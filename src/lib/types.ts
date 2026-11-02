export interface TimelineWindow { start: number; end: number }
export interface ZonedMoment { day: string; time: string }

export interface SessionClock {
  id: 'sydney' | 'tokyo' | 'london' | 'new-york';
  name: string;
  time: string;
  date: string;
  timezone: string;
  is_open: boolean;
  hours: string;
  next_change_seconds: number;
  next_change_local: string;
  windows: TimelineWindow[];
}

export interface MarketPayload {
  timestamp: number;
  sessions: SessionClock[];
  overlaps: TimelineWindow[];
  next_event: { label: string; seconds: number };
  compact: {
    current_id: SessionClock['id'] | null;
    next_id: SessionClock['id'];
    next_open_seconds: number;
    next_open_local: string;
  };
  home: {
    id: string;
    label: string;
    utc_offset: string;
    next_event: ZonedMoment;
    next_open: ZonedMoment;
  };
}

// Formatting only. Time and session calculations belong to Rust.
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

export function referenceTime(moment: ZonedMoment, twelveHour: boolean): string {
  const time = clock(moment.time, twelveHour);
  return `${moment.day} ${time.main}${time.period ? ` ${time.period}` : ''}`;
}
