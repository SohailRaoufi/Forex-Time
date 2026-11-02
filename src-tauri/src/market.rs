use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike, Utc, Weekday};
use chrono_tz::{America::New_York, Asia::Kabul, Europe::London, Tz};
use serde::Serialize;

pub const MARKET_TICK_EVENT: &str = "market-tick";

/// Stable JSON contract for both market-tick events and get_market_snapshot.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MarketPayload {
    pub kabul_time: String,
    pub london_time: String,
    pub ny_time: String,
    pub london_status: bool,
    pub ny_status: bool,
    pub is_overlap: bool,
    pub kabul_date: String,
    pub timeline_date: String,
    pub timeline_minute: u32,
    pub london_session: SessionDetails,
    pub ny_session: SessionDetails,
    pub next_event: NextEvent,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SessionDetails {
    pub timezone_label: String,
    pub opens_at_kabul: String,
    pub closes_at_kabul: String,
    pub timeline_start: i64,
    pub timeline_end: i64,
    pub scheduled: bool,
    pub progress_percent: u32,
    pub next_change_seconds: i64,
    pub next_change_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NextEvent {
    pub label: String,
    pub seconds: i64,
    pub at_kabul: String,
}

fn local_hour(zone: Tz, date: NaiveDate, hour: u32) -> DateTime<Tz> {
    // These sessions start/end outside the DST transition hours in both zones.
    zone.from_local_datetime(&date.and_hms_opt(hour, 0, 0).unwrap())
        .single()
        .expect("session boundary must be an unambiguous local time")
}

fn weekday(date: NaiveDate) -> bool {
    !matches!(date.weekday(), Weekday::Sat | Weekday::Sun)
}

fn session_details(
    now: DateTime<Utc>,
    zone: Tz,
    close_hour: u32,
    day: NaiveDate,
) -> SessionDetails {
    let local = now.with_timezone(&zone);
    let open = local_hour(zone, local.date_naive(), 8);
    let close = local_hour(zone, local.date_naive(), close_hour);
    let is_open = session_is_open(&local, close_hour);
    let next = if is_open {
        close
    } else {
        (0..8)
            .map(|offset| local_hour(zone, local.date_naive() + Duration::days(offset), 8))
            .find(|candidate| weekday(candidate.date_naive()) && *candidate > local)
            .expect("next weekday opening exists within a week")
    };
    let schedule_open = local_hour(zone, day, 8).with_timezone(&Kabul);
    let schedule_close = local_hour(zone, day, close_hour).with_timezone(&Kabul);
    let midnight = local_hour(Kabul, day, 0);
    SessionDetails {
        timezone_label: local.format("%Z").to_string(),
        opens_at_kabul: schedule_open.format("%H:%M").to_string(),
        closes_at_kabul: schedule_close.format("%H:%M").to_string(),
        timeline_start: (schedule_open - midnight).num_minutes(),
        timeline_end: (schedule_close - midnight).num_minutes(),
        scheduled: weekday(day),
        progress_percent: if is_open {
            (((local - open).num_seconds() * 100) / (close - open).num_seconds()) as u32
        } else {
            0
        },
        next_change_seconds: (next.timestamp() - now.timestamp()).max(0),
        next_change_at: next.with_timezone(&Kabul).format("%a %H:%M").to_string(),
    }
}

impl MarketPayload {
    /// Convert a single UTC instant so every field describes the same moment.
    pub fn at(now: DateTime<Utc>) -> Self {
        let kabul = now.with_timezone(&Kabul);
        let london = now.with_timezone(&London);
        let ny = now.with_timezone(&New_York);
        let london_status = session_is_open(&london, 16);
        let ny_status = session_is_open(&ny, 17);
        // A 06:00–06:00 Kabul trading-day view keeps New York's overnight tail visible.
        let day = kabul.date_naive() - Duration::days(i64::from(kabul.hour() < 6));
        let london_session = session_details(now, London, 16, day);
        let ny_session = session_details(now, New_York, 17, day);
        let (name, status, next) =
            if london_session.next_change_seconds <= ny_session.next_change_seconds {
                ("London", london_status, &london_session)
            } else {
                ("New York", ny_status, &ny_session)
            };
        let next_event = NextEvent {
            label: format!("{} {}", name, if status { "closes" } else { "opens" }),
            seconds: next.next_change_seconds,
            at_kabul: next.next_change_at.clone(),
        };

        Self {
            kabul_time: kabul.format("%H:%M:%S").to_string(),
            london_time: london.format("%H:%M:%S").to_string(),
            ny_time: ny.format("%H:%M:%S").to_string(),
            london_status,
            ny_status,
            is_overlap: london_status && ny_status,
            kabul_date: kabul.format("%A, %d %B %Y").to_string(),
            timeline_date: day.format("%a, %d %b").to_string(),
            timeline_minute: kabul.hour() * 60
                + kabul.minute()
                + if kabul.hour() < 6 { 1440 } else { 0 },
            london_session,
            ny_session,
            next_event,
        }
    }
}

/// Local weekday sessions, inclusive at 08:00 and exclusive at close.
/// This is a session schedule, not an exchange/broker holiday calendar.
fn session_is_open(local: &DateTime<Tz>, close_hour: u32) -> bool {
    !matches!(local.weekday(), Weekday::Sat | Weekday::Sun)
        && (8..close_hour).contains(&local.hour())
}

/// Avoid formatting, allocating and emitting on duplicate sub-second polls.
#[derive(Default)]
pub struct MarketTicker {
    last_second: Option<i64>,
}

impl MarketTicker {
    pub fn sample(&mut self, now: DateTime<Utc>) -> Option<MarketPayload> {
        let second = now.timestamp();
        if self.last_second == Some(second) {
            return None;
        }
        // Equality (rather than >) also recovers from a backward clock correction.
        self.last_second = Some(second);
        Some(MarketPayload::at(now))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone};

    fn utc(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value)
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn winter_new_york_open_is_1730_in_kabul() {
        let payload = MarketPayload::at(utc("2026-11-02T13:00:00Z"));
        assert_eq!(payload.kabul_time, "17:30:00");
        assert_eq!(payload.london_time, "13:00:00");
        assert_eq!(payload.ny_time, "08:00:00");
        assert!(payload.is_overlap);
    }

    #[test]
    fn summer_new_york_open_is_1630_in_kabul() {
        let payload = MarketPayload::at(utc("2026-07-06T12:00:00Z"));
        assert_eq!(payload.kabul_time, "16:30:00");
        assert_eq!(payload.london_time, "13:00:00");
        assert_eq!(payload.ny_time, "08:00:00");
        assert!(payload.is_overlap);
    }

    #[test]
    fn handles_weeks_when_us_and_uk_dst_differ() {
        for date in ["2026-03-16T12:00:00Z", "2026-10-26T12:00:00Z"] {
            let payload = MarketPayload::at(utc(date));
            assert_eq!(payload.london_time, "12:00:00");
            assert_eq!(payload.ny_time, "08:00:00");
            assert_eq!(payload.kabul_time, "16:30:00");
            assert!(payload.is_overlap);
        }
    }

    #[test]
    fn session_boundaries_are_inclusive_open_exclusive_close() {
        for (zone, close) in [(London, 16), (New_York, 17)] {
            for (month, day) in [(1, 5), (7, 6)] {
                let open = zone.with_ymd_and_hms(2026, month, day, 8, 0, 0).unwrap();
                let end = zone
                    .with_ymd_and_hms(2026, month, day, close, 0, 0)
                    .unwrap();
                assert!(!session_is_open(&(open - Duration::seconds(1)), close));
                assert!(session_is_open(&open, close));
                assert!(session_is_open(&(end - Duration::seconds(1)), close));
                assert!(!session_is_open(&end, close));
            }
        }
    }

    #[test]
    fn weekends_are_closed() {
        for date in ["2026-07-04T13:00:00Z", "2026-07-05T13:00:00Z"] {
            let payload = MarketPayload::at(utc(date));
            assert!(!payload.london_status);
            assert!(!payload.ny_status);
            assert!(!payload.is_overlap);
        }
    }

    #[test]
    fn overlap_requires_both_sessions() {
        for (time, london, ny) in [
            ("2026-07-06T06:59:59Z", false, false),
            ("2026-07-06T07:00:00Z", true, false),
            ("2026-07-06T12:00:00Z", true, true),
            ("2026-07-06T15:00:00Z", false, true),
            ("2026-07-06T21:00:00Z", false, false),
        ] {
            let payload = MarketPayload::at(utc(time));
            assert_eq!(payload.london_status, london);
            assert_eq!(payload.ny_status, ny);
            assert_eq!(payload.is_overlap, london && ny);
        }
    }

    #[test]
    fn timezone_conversion_handles_midnight_rollover() {
        let payload = MarketPayload::at(utc("2026-07-06T20:00:00Z"));
        assert_eq!(payload.kabul_time, "00:30:00");
        assert_eq!(payload.ny_time, "16:00:00");
        assert!(payload.ny_status);
    }

    #[test]
    fn iana_rules_handle_actual_dst_transition_instants() {
        for (before, after, zone, expected_before, expected_after) in [
            (
                "2026-03-08T06:59:59Z",
                "2026-03-08T07:00:00Z",
                New_York,
                "01:59:59",
                "03:00:00",
            ),
            (
                "2026-11-01T05:59:59Z",
                "2026-11-01T06:00:00Z",
                New_York,
                "01:59:59",
                "01:00:00",
            ),
            (
                "2026-03-29T00:59:59Z",
                "2026-03-29T01:00:00Z",
                London,
                "00:59:59",
                "02:00:00",
            ),
            (
                "2026-10-25T00:59:59Z",
                "2026-10-25T01:00:00Z",
                London,
                "01:59:59",
                "01:00:00",
            ),
        ] {
            assert_eq!(
                utc(before)
                    .with_timezone(&zone)
                    .format("%H:%M:%S")
                    .to_string(),
                expected_before
            );
            assert_eq!(
                utc(after)
                    .with_timezone(&zone)
                    .format("%H:%M:%S")
                    .to_string(),
                expected_after
            );
        }
    }

    #[test]
    fn four_polls_per_second_produce_one_payload() {
        let mut ticker = MarketTicker::default();
        let start = utc("2026-07-06T12:00:00Z");
        for second in 0..3 {
            for millisecond in [0, 250, 500, 750] {
                let sample =
                    ticker.sample(start + Duration::milliseconds(second * 1000 + millisecond));
                assert_eq!(sample.is_some(), millisecond == 0);
            }
        }
    }

    #[test]
    fn resume_skips_stale_seconds_and_clock_corrections_recover() {
        let mut ticker = MarketTicker::default();
        let start = utc("2026-07-06T12:00:00Z");
        assert!(ticker.sample(start).is_some());
        let resumed = ticker.sample(start + Duration::hours(1)).unwrap();
        assert_eq!(resumed.ny_time, "09:00:00");
        assert!(ticker.sample(start + Duration::hours(1)).is_none());
        assert!(ticker.sample(start - Duration::minutes(1)).is_some());
        assert!(ticker.sample(start - Duration::minutes(1)).is_none());
    }

    #[test]
    fn serialized_payload_matches_frontend_contract() {
        let payload = MarketPayload::at(utc("2026-07-06T12:00:00Z"));
        let json = serde_json::to_value(payload).unwrap();
        assert_eq!(json["kabul_time"], "16:30:00");
        assert_eq!(json["london_time"], "13:00:00");
        assert_eq!(json["ny_time"], "08:00:00");
        assert_eq!(json["london_status"], true);
        assert_eq!(json["ny_status"], true);
        assert_eq!(json["is_overlap"], true);
        assert_eq!(json["next_event"]["label"], "London closes");
        assert_eq!(json["next_event"]["seconds"], 10800);
        assert_eq!(json["ny_session"]["timeline_end"], 1530);
    }

    #[test]
    fn next_open_skips_weekend_and_accounts_for_dst_change() {
        let payload = MarketPayload::at(utc("2026-03-06T22:00:00Z"));
        assert_eq!(payload.next_event.label, "London opens");
        assert_eq!(payload.ny_session.next_change_at, "Mon 16:30");
        assert_eq!(payload.ny_session.next_change_seconds, 62 * 3600);
    }

    #[test]
    fn overnight_timeline_keeps_previous_trading_day() {
        let payload = MarketPayload::at(utc("2026-07-10T20:00:00Z"));
        assert_eq!(payload.timeline_date, "Fri, 10 Jul");
        assert_eq!(payload.timeline_minute, 1470);
        assert!(payload.ny_status);
        assert!(payload.ny_session.scheduled);
        assert_eq!(payload.ny_session.timeline_end, 1530);
        assert_eq!(payload.ny_session.next_change_seconds, 3600);
    }

    #[test]
    fn weekend_timeline_has_no_scheduled_bars() {
        let payload = MarketPayload::at(utc("2026-07-11T12:00:00Z"));
        assert!(!payload.london_session.scheduled);
        assert!(!payload.ny_session.scheduled);
    }

    #[test]
    fn countdown_matches_displayed_clock_despite_subsecond_polling() {
        let payload = MarketPayload::at(utc("2026-11-02T07:59:59.750Z"));
        assert_eq!(payload.kabul_time, "12:29:59");
        assert_eq!(payload.next_event.seconds, 1);
    }
}
