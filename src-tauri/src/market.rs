use chrono::{DateTime, Datelike, Duration, NaiveDate, Offset, TimeZone, Utc, Weekday};
use chrono_tz::{America::New_York, Asia::Tokyo, Australia::Sydney, Europe::London, Tz};
use serde::Serialize;

pub const MARKET_TICK_EVENT: &str = "market-tick";
const DAY_SECONDS: i64 = 86_400;

#[derive(Clone, Copy)]
struct Session {
    id: &'static str,
    name: &'static str,
    zone: Tz,
    start: u32,
    end: u32,
}

// Weekday session conventions, in each city's local time. London retains the
// user's requested 16:00 close. These are not exchange or broker calendars.
const SESSIONS: [Session; 4] = [
    Session {
        id: "sydney",
        name: "Sydney",
        zone: Sydney,
        start: 8,
        end: 17,
    },
    Session {
        id: "tokyo",
        name: "Tokyo",
        zone: Tokyo,
        start: 9,
        end: 18,
    },
    Session {
        id: "london",
        name: "London",
        zone: London,
        start: 8,
        end: 16,
    },
    Session {
        id: "new-york",
        name: "New York",
        zone: New_York,
        start: 8,
        end: 17,
    },
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MarketPayload {
    pub timestamp: i64,
    pub sessions: [SessionClock; 4],
    pub overlaps: Vec<TimelineWindow>,
    pub next_event: NextEvent,
    pub compact: CompactSessions,
    pub home: HomeReference,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ZonedMoment {
    pub day: String,
    pub time: String,
}

impl ZonedMoment {
    fn at(instant: DateTime<Utc>, zone: Tz) -> Self {
        let local = instant.with_timezone(&zone);
        Self {
            day: local.format("%a").to_string(),
            time: local.format("%H:%M:%S").to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HomeReference {
    pub id: &'static str,
    pub label: String,
    pub utc_offset: String,
    pub next_event: ZonedMoment,
    pub next_open: ZonedMoment,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CompactSessions {
    pub current_id: Option<&'static str>,
    pub next_id: &'static str,
    pub next_open_seconds: i64,
    pub next_open_local: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SessionClock {
    pub id: &'static str,
    pub name: &'static str,
    pub time: String,
    pub date: String,
    pub timezone: String,
    pub is_open: bool,
    pub hours: String,
    pub next_change_seconds: i64,
    pub next_change_local: String,
    pub windows: Vec<TimelineWindow>,
}

/// Seconds from the current tick, clipped to the rolling next 24 hours.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TimelineWindow {
    pub start: i64,
    pub end: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NextEvent {
    pub label: String,
    pub seconds: i64,
}

fn local_hour(zone: Tz, date: NaiveDate, hour: u32) -> DateTime<Tz> {
    // All four session boundaries fall outside their DST transition hours.
    zone.from_local_datetime(&date.and_hms_opt(hour, 0, 0).unwrap())
        .single()
        .expect("session boundary must be unambiguous")
}

fn weekday(date: NaiveDate) -> bool {
    !matches!(date.weekday(), Weekday::Sat | Weekday::Sun)
}

impl Session {
    fn next_opening(self, now: DateTime<Utc>) -> DateTime<Tz> {
        let local = now.with_timezone(&self.zone);
        (0..8)
            .map(|offset| {
                local_hour(
                    self.zone,
                    local.date_naive() + Duration::days(offset),
                    self.start,
                )
            })
            .find(|opening| weekday(opening.date_naive()) && *opening > local)
            .expect("next weekday opening exists within a week")
    }

    fn at(self, now: DateTime<Utc>) -> SessionClock {
        let local = now.with_timezone(&self.zone);
        let day = local.date_naive();
        let start = local_hour(self.zone, day, self.start);
        let end = local_hour(self.zone, day, self.end);
        let is_open = weekday(day) && local >= start && local < end;
        let next = if is_open { end } else { self.next_opening(now) };
        let windows = (0..3)
            .filter_map(|offset| {
                let date = day + Duration::days(offset);
                if !weekday(date) {
                    return None;
                }
                let start =
                    (local_hour(self.zone, date, self.start).timestamp() - now.timestamp()).max(0);
                let end = (local_hour(self.zone, date, self.end).timestamp() - now.timestamp())
                    .min(DAY_SECONDS);
                (start < end).then_some(TimelineWindow { start, end })
            })
            .collect();
        SessionClock {
            id: self.id,
            name: self.name,
            time: local.format("%H:%M:%S").to_string(),
            date: local.format("%a, %d %b").to_string(),
            timezone: local.format("%Z").to_string(),
            is_open,
            hours: format!("{:02}:00–{:02}:00", self.start, self.end),
            next_change_seconds: (next.timestamp() - now.timestamp()).max(0),
            next_change_local: next.format("%a %H:%M %Z").to_string(),
            windows,
        }
    }
}

fn overlap_windows(sessions: &[SessionClock; 4]) -> Vec<TimelineWindow> {
    let windows: Vec<_> = sessions
        .iter()
        .flat_map(|session| &session.windows)
        .collect();
    let mut edges: Vec<_> = windows
        .iter()
        .flat_map(|window| [window.start, window.end])
        .collect();
    edges.sort_unstable();
    edges.dedup();
    let mut overlaps: Vec<TimelineWindow> = Vec::new();
    for edge in edges.windows(2) {
        let (start, end) = (edge[0], edge[1]);
        if windows
            .iter()
            .filter(|window| window.start <= start && window.end > start)
            .count()
            >= 2
        {
            if let Some(last) = overlaps.last_mut().filter(|last| last.end == start) {
                last.end = end;
            } else {
                overlaps.push(TimelineWindow { start, end });
            }
        }
    }
    overlaps
}

impl MarketPayload {
    pub fn at(now: DateTime<Utc>, home_zone: Tz) -> Self {
        let sessions = SESSIONS.map(|session| session.at(now));
        let next = sessions
            .iter()
            .min_by_key(|session| session.next_change_seconds)
            .unwrap();
        let next_event = NextEvent {
            label: format!(
                "{} {}",
                next.name,
                if next.is_open { "closes" } else { "opens" }
            ),
            seconds: next.next_change_seconds,
        };
        // During an overlap, focus the session that opened most recently.
        let current_id = SESSIONS
            .iter()
            .zip(&sessions)
            .filter(|(_, clock)| clock.is_open)
            .max_by_key(|(session, _)| {
                local_hour(
                    session.zone,
                    now.with_timezone(&session.zone).date_naive(),
                    session.start,
                )
                .timestamp()
            })
            .map(|(session, _)| session.id);
        // This is the next opening, which can differ from the next closing event.
        let (upcoming, opening) = SESSIONS
            .iter()
            .map(|session| (session, session.next_opening(now)))
            .min_by_key(|(_, opening)| opening.timestamp())
            .unwrap();
        let compact = CompactSessions {
            current_id,
            next_id: upcoming.id,
            next_open_seconds: opening.timestamp() - now.timestamp(),
            next_open_local: opening.format("%a %H:%M %Z").to_string(),
        };
        let offset = now
            .with_timezone(&home_zone)
            .offset()
            .fix()
            .local_minus_utc();
        let home = HomeReference {
            id: home_zone.name(),
            label: home_zone
                .name()
                .rsplit('/')
                .next()
                .unwrap()
                .replace('_', " "),
            utc_offset: format!(
                "UTC{}{:02}:{:02}",
                if offset < 0 { '-' } else { '+' },
                offset.abs() / 3600,
                offset.abs() % 3600 / 60
            ),
            next_event: ZonedMoment::at(now + Duration::seconds(next_event.seconds), home_zone),
            next_open: ZonedMoment::at(opening.with_timezone(&Utc), home_zone),
        };
        Self {
            timestamp: now.timestamp(),
            overlaps: overlap_windows(&sessions),
            sessions,
            next_event,
            compact,
            home,
        }
    }
}

#[derive(Default)]
pub struct MarketTicker {
    last_second: Option<i64>,
}

impl MarketTicker {
    pub fn sample(&mut self, now: DateTime<Utc>, home_zone: Tz) -> Option<MarketPayload> {
        let second = now.timestamp();
        if self.last_second == Some(second) {
            return None;
        }
        // Equality also recovers when the system clock moves backwards.
        self.last_second = Some(second);
        Some(MarketPayload::at(now, home_zone))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utc(value: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(value)
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn four_clocks_share_one_instant_and_keep_local_dates() {
        let payload = MarketPayload::at(utc("2026-11-02T14:12:08Z"), chrono_tz::Asia::Kabul);
        assert_eq!(
            payload.sessions.each_ref().map(|s| s.time.as_str()),
            ["01:12:08", "23:12:08", "14:12:08", "09:12:08"]
        );
        assert_eq!(payload.sessions[0].date, "Tue, 03 Nov");
        assert_eq!(payload.sessions[1].date, "Mon, 02 Nov");
        assert_eq!(
            payload.sessions.each_ref().map(|s| s.is_open),
            [false, false, true, true]
        );
    }

    #[test]
    fn sydney_and_tokyo_are_open_during_asian_hours() {
        let payload = MarketPayload::at(utc("2026-11-02T02:00:00Z"), chrono_tz::Asia::Kabul);
        assert_eq!(
            payload.sessions.each_ref().map(|s| s.is_open),
            [true, true, false, false]
        );
        assert_eq!(payload.next_event.label, "Sydney closes");
        assert_eq!(
            payload.overlaps[0],
            TimelineWindow {
                start: 0,
                end: 4 * 3600
            }
        );
    }

    #[test]
    fn all_four_session_boundaries_are_inclusive_open_exclusive_close() {
        for session in SESSIONS {
            for (month, day) in [(1, 5), (7, 6)] {
                let date = NaiveDate::from_ymd_opt(2026, month, day).unwrap();
                let start = local_hour(session.zone, date, session.start).with_timezone(&Utc);
                let end = local_hour(session.zone, date, session.end).with_timezone(&Utc);
                assert!(!session.at(start - Duration::seconds(1)).is_open);
                assert!(session.at(start).is_open);
                assert!(session.at(end - Duration::seconds(1)).is_open);
                assert!(!session.at(end).is_open);
            }
        }
    }

    #[test]
    fn weekends_follow_each_city_not_utc_weekday() {
        let payload = MarketPayload::at(utc("2026-11-01T21:00:00Z"), chrono_tz::Asia::Kabul);
        assert!(payload.sessions[0].is_open); // Monday 08:00 Sydney; Sunday UTC.
        assert!(!payload.sessions[1].is_open);
        assert!(!payload.sessions[2].is_open);
        assert!(!payload.sessions[3].is_open);
        let saturday = MarketPayload::at(utc("2026-11-07T12:00:00Z"), chrono_tz::Asia::Kabul);
        assert!(saturday.sessions.iter().all(|s| !s.is_open));
        assert!(saturday.overlaps.is_empty());
    }

    #[test]
    fn northern_and_southern_dst_are_independent() {
        for (instant, expected) in [
            ("2026-01-05T12:00:00Z", ["AEDT", "JST", "GMT", "EST"]),
            ("2026-07-06T12:00:00Z", ["AEST", "JST", "BST", "EDT"]),
            ("2026-03-16T12:00:00Z", ["AEDT", "JST", "GMT", "EDT"]),
            ("2026-10-26T12:00:00Z", ["AEDT", "JST", "GMT", "EDT"]),
        ] {
            let payload = MarketPayload::at(utc(instant), chrono_tz::Asia::Kabul);
            assert_eq!(
                payload.sessions.each_ref().map(|s| s.timezone.as_str()),
                expected
            );
        }
    }

    #[test]
    fn next_open_skips_weekend_and_applies_new_dst_offset() {
        let now = utc("2026-03-06T22:00:00Z");
        let ny = SESSIONS[3].at(now);
        assert_eq!(ny.next_change_seconds, 62 * 3600);
        assert_eq!(ny.next_change_local, "Mon 08:00 EDT");
        let sydney = SESSIONS[0].at(utc("2026-10-02T08:00:00Z"));
        assert_eq!(sydney.next_change_local, "Mon 08:00 AEDT");
        assert_eq!(sydney.next_change_seconds, 61 * 3600);
    }

    #[test]
    fn timeline_clips_running_sessions_and_includes_next_day() {
        let now = utc("2026-11-02T14:00:00Z");
        let london = SESSIONS[2].at(now);
        assert_eq!(
            london.windows,
            vec![
                TimelineWindow {
                    start: 0,
                    end: 2 * 3600
                },
                TimelineWindow {
                    start: 18 * 3600,
                    end: DAY_SECONDS
                },
            ]
        );
        for session in MarketPayload::at(now, chrono_tz::Asia::Kabul).sessions {
            for window in session.windows {
                assert!(
                    window.start >= 0 && window.start < window.end && window.end <= DAY_SECONDS
                );
            }
        }
    }

    #[test]
    fn timeline_overlaps_match_actual_session_counts() {
        for instant in [
            "2026-07-06T12:00:00Z",
            "2026-11-01T20:00:00Z",
            "2026-11-06T20:00:00Z",
        ] {
            let now = utc(instant);
            let payload = MarketPayload::at(now, chrono_tz::Asia::Kabul);
            for offset in (0..DAY_SECONDS).step_by(900) {
                let active = SESSIONS
                    .iter()
                    .filter(|s| s.at(now + Duration::seconds(offset)).is_open)
                    .count();
                let shaded = payload
                    .overlaps
                    .iter()
                    .any(|w| w.start <= offset && offset < w.end);
                assert_eq!(shaded, active >= 2, "{instant} + {offset}");
            }
        }
    }

    #[test]
    fn countdown_matches_displayed_seconds() {
        let payload = MarketPayload::at(utc("2026-11-02T07:59:59.750Z"), chrono_tz::Asia::Kabul);
        assert_eq!(payload.sessions[2].time, "07:59:59");
        assert_eq!(payload.next_event.seconds, 1);
        assert_eq!(payload.next_event.label, "London opens");
    }

    #[test]
    fn compact_follows_opening_order_and_ignores_closings_for_upcoming() {
        for (instant, current, upcoming) in [
            ("2026-11-01T21:00:00Z", "sydney", "tokyo"),
            ("2026-11-02T00:00:00Z", "tokyo", "london"),
            ("2026-11-02T08:00:00Z", "london", "new-york"),
            ("2026-11-02T13:00:00Z", "new-york", "sydney"),
            ("2026-11-02T21:00:00Z", "sydney", "tokyo"),
        ] {
            let payload = MarketPayload::at(utc(instant), chrono_tz::Asia::Kabul);
            assert_eq!(payload.compact.current_id, Some(current));
            assert_eq!(payload.compact.next_id, upcoming);
            assert!(payload.compact.next_open_seconds > 0);
        }
        let overlap = MarketPayload::at(utc("2026-11-02T14:00:00Z"), chrono_tz::Asia::Kabul);
        assert_eq!(overlap.next_event.label, "London closes");
        assert_eq!(overlap.compact.next_id, "sydney");
        assert_eq!(overlap.compact.next_open_seconds, 7 * 3600);
    }

    #[test]
    fn compact_handles_weekend_dst_and_exact_session_handoff() {
        // The weekend includes Sydney's spring-forward transition.
        let closed = MarketPayload::at(utc("2026-10-03T12:00:00Z"), chrono_tz::Asia::Kabul);
        assert_eq!(closed.compact.current_id, None);
        assert_eq!(closed.compact.next_id, "sydney");
        assert_eq!(closed.compact.next_open_seconds, 33 * 3600);
        assert_eq!(closed.compact.next_open_local, "Mon 08:00 AEDT");
        let before = MarketPayload::at(utc("2026-11-02T12:59:59Z"), chrono_tz::Asia::Kabul);
        assert_eq!(before.compact.current_id, Some("london"));
        assert_eq!(before.compact.next_id, "new-york");
        assert_eq!(before.compact.next_open_seconds, 1);
        let after = MarketPayload::at(utc("2026-11-02T13:00:00Z"), chrono_tz::Asia::Kabul);
        assert_eq!(after.compact.current_id, Some("new-york"));
        assert_eq!(after.compact.next_id, "sydney");
    }

    #[test]
    fn four_polls_per_second_produce_one_payload() {
        let mut ticker = MarketTicker::default();
        let start = utc("2026-07-06T12:00:00Z");
        for offset in (0..3000).step_by(250) {
            assert_eq!(
                ticker
                    .sample(
                        start + Duration::milliseconds(offset),
                        chrono_tz::Asia::Kabul
                    )
                    .is_some(),
                offset % 1000 == 0
            );
        }
    }

    #[test]
    fn suspend_and_backwards_clock_corrections_recover() {
        let mut ticker = MarketTicker::default();
        let start = utc("2026-07-06T12:00:00Z");
        assert!(ticker.sample(start, chrono_tz::Asia::Kabul).is_some());
        assert_eq!(
            ticker
                .sample(start + Duration::hours(1), chrono_tz::Asia::Kabul)
                .unwrap()
                .sessions[3]
                .time,
            "09:00:00"
        );
        assert!(ticker
            .sample(start + Duration::hours(1), chrono_tz::Asia::Kabul)
            .is_none());
        assert!(ticker
            .sample(start - Duration::minutes(1), chrono_tz::Asia::Kabul)
            .is_some());
    }

    #[test]
    fn serialized_contract_is_four_ordered_session_clocks() {
        let json = serde_json::to_value(MarketPayload::at(
            utc("2026-11-02T14:00:00Z"),
            chrono_tz::Asia::Kabul,
        ))
        .unwrap();
        assert_eq!(json["sessions"].as_array().unwrap().len(), 4);
        assert_eq!(json["sessions"][0]["id"], "sydney");
        assert_eq!(json["sessions"][3]["id"], "new-york");
        assert_eq!(json["sessions"][2]["time"], "14:00:00");
        assert!(json.get("kabul_time").is_none());
    }

    #[test]
    fn home_references_cover_fractional_offsets_and_date_rollovers() {
        let now = utc("2026-11-02T14:00:00Z");
        for (zone, offset, event_time, open_day, open_time) in [
            ("Asia/Kabul", "UTC+04:30", "20:30:00", "Tue", "01:30:00"),
            ("Asia/Kathmandu", "UTC+05:45", "21:45:00", "Tue", "02:45:00"),
            (
                "Pacific/Chatham",
                "UTC+13:45",
                "05:45:00",
                "Tue",
                "10:45:00",
            ),
            ("Etc/GMT+12", "UTC-12:00", "04:00:00", "Mon", "09:00:00"),
            ("UTC", "UTC+00:00", "16:00:00", "Mon", "21:00:00"),
        ] {
            let payload = MarketPayload::at(now, zone.parse().unwrap());
            assert_eq!(payload.home.id, zone);
            assert_eq!(payload.home.utc_offset, offset);
            assert_eq!(payload.home.next_event.time, event_time);
            assert_eq!(payload.home.next_open.day, open_day);
            assert_eq!(payload.home.next_open.time, open_time);
            assert_eq!(payload.sessions[3].time, "09:00:00");
        }
    }

    #[test]
    fn home_references_use_dst_at_the_event_not_the_current_offset() {
        let before = MarketPayload::at(utc("2026-03-07T12:00:00Z"), New_York);
        assert_eq!(before.home.utc_offset, "UTC-05:00");
        assert_eq!(before.home.next_open.day, "Sun");
        assert_eq!(before.home.next_open.time, "17:00:00"); // Sydney Monday open, after US DST starts.
        let after = MarketPayload::at(utc("2026-03-09T12:00:00Z"), New_York);
        assert_eq!(after.home.utc_offset, "UTC-04:00");
    }

    #[test]
    fn timezone_picker_catalog_matches_every_backend_zone() {
        let catalog: Vec<String> =
            serde_json::from_str(include_str!("../../src/lib/timezones.json")).unwrap();
        let mut expected: Vec<_> = chrono_tz::TZ_VARIANTS
            .iter()
            .map(|zone| zone.name())
            .collect();
        expected.sort_unstable();
        assert_eq!(catalog, expected);
        for zone in chrono_tz::TZ_VARIANTS {
            assert_eq!(
                MarketPayload::at(utc("2026-11-02T14:00:00Z"), zone).home.id,
                zone.name()
            );
        }
    }
}
