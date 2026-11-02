import type { MarketPayload } from './types';

// Static design sample: Monday 2 Nov 2026, 14:00 UTC. Never used in Tauri.
export const preview: MarketPayload = {
  timestamp: 1793628000,
  sessions: [
    { id: 'sydney', name: 'Sydney', time: '01:00:00', date: 'Tue, 03 Nov', timezone: 'AEDT', is_open: false, hours: '08:00–17:00', next_change_seconds: 25200, next_change_local: 'Tue 08:00 AEDT', windows: [{ start: 25200, end: 57600 }] },
    { id: 'tokyo', name: 'Tokyo', time: '23:00:00', date: 'Mon, 02 Nov', timezone: 'JST', is_open: false, hours: '09:00–18:00', next_change_seconds: 36000, next_change_local: 'Tue 09:00 JST', windows: [{ start: 36000, end: 68400 }] },
    { id: 'london', name: 'London', time: '14:00:00', date: 'Mon, 02 Nov', timezone: 'GMT', is_open: true, hours: '08:00–16:00', next_change_seconds: 7200, next_change_local: 'Mon 16:00 GMT', windows: [{ start: 0, end: 7200 }, { start: 64800, end: 86400 }] },
    { id: 'new-york', name: 'New York', time: '09:00:00', date: 'Mon, 02 Nov', timezone: 'EST', is_open: true, hours: '08:00–17:00', next_change_seconds: 28800, next_change_local: 'Mon 17:00 EST', windows: [{ start: 0, end: 28800 }, { start: 82800, end: 86400 }] },
  ],
  overlaps: [{ start: 0, end: 7200 }, { start: 25200, end: 28800 }, { start: 36000, end: 57600 }, { start: 64800, end: 68400 }, { start: 82800, end: 86400 }],
  next_event: { label: 'London closes', seconds: 7200 },
  compact: { current_id: 'new-york', next_id: 'sydney', next_open_seconds: 25200, next_open_local: 'Tue 08:00 AEDT' },
  home: { id: 'Asia/Kabul', label: 'Kabul', utc_offset: 'UTC+04:30', next_event: { day: 'Mon', time: '20:30:00' }, next_open: { day: 'Tue', time: '01:30:00' } },
};

// Only the fixed browser design fixture uses Intl. Native conversions come from Rust.
export function previewInTimezone(id: string): MarketPayload {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: id, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const moment = (seconds: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date((preview.timestamp + seconds) * 1000)).map(part => [part.type, part.value]));
    return { day: parts.weekday, time: `${parts.hour}:${parts.minute}:${parts.second}` };
  };
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'longOffset' }).formatToParts(new Date(preview.timestamp * 1000)).find(part => part.type === 'timeZoneName')!.value;
  return { ...preview, home: { id, label: id.split('/').at(-1)!.replaceAll('_', ' '), utc_offset: offset === 'GMT' ? 'UTC+00:00' : offset.replace('GMT', 'UTC'), next_event: moment(preview.next_event.seconds), next_open: moment(preview.compact.next_open_seconds) } };
}
