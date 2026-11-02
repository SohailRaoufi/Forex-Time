import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TimezonePicker } from './TimezonePicker';
import { preview } from '../lib/preview';
import timezones from '../lib/timezones.json';

afterEach(cleanup);

it('offers every timezone, searches city names, and saves an explicit selection', async () => {
  const change = vi.fn().mockResolvedValue(true);
  render(<TimezonePicker home={preview.home} busy={false} error={null} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: /Kabul/ }));
  expect(screen.getAllByRole('option')).toHaveLength(timezones.length);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search timezones' }), { target: { value: 'new york' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.change(screen.getByRole('listbox', { name: 'Choose home timezone' }), { target: { value: 'America/New_York' } });
  await waitFor(() => expect(change).toHaveBeenCalledWith('America/New_York'));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
});

it('keeps the selector open on failure and handles an empty search', async () => {
  const change = vi.fn().mockResolvedValue(false);
  render(<TimezonePicker home={preview.home} busy={false} error="Could not save" onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: /Kabul/ }));
  fireEvent.change(screen.getByRole('listbox'), { target: { value: 'UTC' } });
  await waitFor(() => expect(change).toHaveBeenCalledWith('UTC'));
  expect(screen.getByRole('listbox')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('Could not save');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'not a timezone' } });
  expect(screen.getByText(/No matching timezone/)).toBeTruthy();
});
