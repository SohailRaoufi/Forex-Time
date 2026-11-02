import type { MarketPayload } from './types';

// Explicit static design fixtures. Never used in the native application.
export const preview: MarketPayload = {
  kabul_time: '18:42:08', london_time: '14:12:08', ny_time: '09:12:08',
  london_status: true, ny_status: true, is_overlap: true,
  kabul_date: 'Monday, 02 November 2026', timeline_date: 'Mon, 02 Nov', timeline_minute: 1122,
  london_session: {
    timezone_label: 'GMT', opens_at_kabul: '12:30', closes_at_kabul: '20:30',
    timeline_start: 750, timeline_end: 1230, scheduled: true, progress_percent: 77,
    next_change_seconds: 6472, next_change_at: 'Mon 20:30',
  },
  ny_session: {
    timezone_label: 'EST', opens_at_kabul: '17:30', closes_at_kabul: '02:30',
    timeline_start: 1050, timeline_end: 1590, scheduled: true, progress_percent: 13,
    next_change_seconds: 28072, next_change_at: 'Tue 02:30',
  },
  next_event: { label: 'London closes', seconds: 6472, at_kabul: 'Mon 20:30' },
};

export function previewFor(mode: string): MarketPayload {
  if (mode === 'solo') return {
    ...preview, kabul_time: '14:30:00', london_time: '10:00:00', ny_time: '05:00:00',
    ny_status: false, is_overlap: false, timeline_minute: 870,
    london_session: { ...preview.london_session, progress_percent: 25, next_change_seconds: 21600 },
    ny_session: { ...preview.ny_session, progress_percent: 0, next_change_seconds: 10800, next_change_at: 'Mon 17:30' },
    next_event: { label: 'New York opens', seconds: 10800, at_kabul: 'Mon 17:30' },
  };
  if (mode === 'closed') return {
    ...preview, kabul_time: '09:30:00', london_time: '05:00:00', ny_time: '00:00:00',
    london_status: false, ny_status: false, is_overlap: false, timeline_minute: 570,
    london_session: { ...preview.london_session, progress_percent: 0, next_change_seconds: 10800, next_change_at: 'Mon 12:30' },
    ny_session: { ...preview.ny_session, progress_percent: 0, next_change_seconds: 28800, next_change_at: 'Mon 17:30' },
    next_event: { label: 'London opens', seconds: 10800, at_kabul: 'Mon 12:30' },
  };
  return preview;
}
