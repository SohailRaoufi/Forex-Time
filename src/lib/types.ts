export interface SessionDetails {
  timezone_label: string;
  opens_at_kabul: string;
  closes_at_kabul: string;
  timeline_start: number;
  timeline_end: number;
  scheduled: boolean;
  progress_percent: number;
  next_change_seconds: number;
  next_change_at: string;
}

export interface MarketPayload {
  kabul_time: string;
  london_time: string;
  ny_time: string;
  london_status: boolean;
  ny_status: boolean;
  is_overlap: boolean;
  kabul_date: string;
  timeline_date: string;
  timeline_minute: number;
  london_session: SessionDetails;
  ny_session: SessionDetails;
  next_event: { label: string; seconds: number; at_kabul: string };
}

// Presentation only: all time, schedule and countdown values originate in Rust.
export function duration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function clock(value: string, twelveHour: boolean) {
  const [hours, minutes, seconds] = value.split(':');
  return {
    main: `${twelveHour ? String(Number(hours) % 12 || 12).padStart(2, '0') : hours}:${minutes}`,
    seconds,
    period: twelveHour ? (Number(hours) >= 12 ? 'PM' : 'AM') : '',
  };
}
