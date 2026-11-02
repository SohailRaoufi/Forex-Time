import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';
import { preview } from './lib/preview';
import type { MarketPayload } from './lib/types';

const mocks = vi.hoisted(() => ({ payload: null as MarketPayload | null }));
vi.mock('./hooks/useMarketClock', () => ({
  useMarketClock: () => ({ native: false, payload: mocks.payload, error: null, retry: vi.fn() }),
}));
afterEach(() => { cleanup(); localStorage.clear(); mocks.payload = null; });

it('shows all four cities and their local clocks without a local-home clock', () => {
  render(<App />);
  for (const name of ['Sydney', 'Tokyo', 'London', 'New York']) {
    expect(screen.getByRole('article', { name: `${name} session` })).toBeTruthy();
  }
  expect(screen.queryByRole('article', { name: 'Kabul session' })).toBeNull();
  expect(within(screen.getByRole('article', { name: 'Sydney session' })).getByText('Closed')).toBeTruthy();
  expect(within(screen.getByRole('article', { name: 'London session' })).getByText('Open')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'All four sessions over the next 24 hours' })).toBeTruthy();
});

it('shows current and upcoming sessions in compact mode and restores all four on expand', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Compact view' }));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'All four sessions over the next 24 hours' })).toBeNull());
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getByRole('article', { name: 'New York session' })).toBeTruthy();
  const upcoming = within(screen.getByRole('article', { name: 'Sydney session' }));
  expect(upcoming.getByText('Opens in')).toBeTruthy();
  expect(upcoming.getByText('07:00:00')).toBeTruthy();
  expect(screen.getByText('Overlap with London')).toBeTruthy();
  expect(screen.queryByText('London closes')).toBeNull();
  expect(screen.getByText('Opens Tue 01:30 · Kabul')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show all sessions' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'All four sessions over the next 24 hours' })).toBeTruthy());
  expect(screen.getAllByRole('article')).toHaveLength(4);
});

it('shows an honest closed state on weekends and follows a new opening payload', () => {
  localStorage.setItem('forex-time:preferences:v1', JSON.stringify({ compact: true }));
  mocks.payload = {
    ...preview,
    sessions: preview.sessions.map(session => ({ ...session, is_open: false })),
    compact: { current_id: null, next_id: 'sydney', next_open_seconds: 118800, next_open_local: 'Mon 08:00 AEDT' },
  };
  const { rerender } = render(<App />);
  expect(screen.getByRole('article', { name: 'No session open' })).toBeTruthy();
  expect(screen.getByText('33:00:00')).toBeTruthy();
  expect(screen.queryByText(/Overlap with/)).toBeNull();
  mocks.payload = {
    ...preview,
    sessions: preview.sessions.map(session => ({ ...session, is_open: session.id === 'sydney' })),
    compact: { current_id: 'sydney', next_id: 'tokyo', next_open_seconds: 10800, next_open_local: 'Mon 09:00 JST' },
  };
  rerender(<App />);
  expect(screen.queryByRole('article', { name: 'No session open' })).toBeNull();
  expect(within(screen.getByRole('article', { name: 'Sydney session' })).getByText('Open')).toBeTruthy();
  const upcoming = within(screen.getByRole('article', { name: 'Tokyo session' }));
  expect(upcoming.getByText('Upcoming')).toBeTruthy();
  expect(upcoming.getByText('03:00:00')).toBeTruthy();
});
