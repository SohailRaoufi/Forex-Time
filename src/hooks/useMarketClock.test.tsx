import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketClock } from './useMarketClock';
import { preview, previewInTimezone } from '../lib/preview';
import type { MarketPayload } from '../lib/types';

const mocks = vi.hoisted(() => ({ listen: vi.fn(), invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, isTauri: mocks.isTauri }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); mocks.isTauri.mockReturnValue(true); });

describe('Rust clock subscription', () => {
  it('subscribes before hydration and releases the listener on unmount', async () => {
    const release = vi.fn();
    mocks.listen.mockResolvedValue(release);
    mocks.invoke.mockResolvedValue(preview);
    const { result, unmount } = renderHook(useMarketClock);
    await waitFor(() => expect(result.current.payload).toEqual(preview));
    expect(mocks.listen.mock.invocationCallOrder[0]).toBeLessThan(mocks.invoke.mock.invocationCallOrder[0]);
    unmount();
    expect(release).toHaveBeenCalledOnce();
  });

  it('does not overwrite a new tick with an older startup snapshot', async () => {
    let tick!: (event: { payload: MarketPayload }) => void;
    let resolveSnapshot!: (data: MarketPayload) => void;
    mocks.listen.mockImplementation((_name, callback) => { tick = callback; return Promise.resolve(vi.fn()); });
    mocks.invoke.mockImplementation(() => new Promise(resolve => { resolveSnapshot = resolve; }));
    const { result } = renderHook(useMarketClock);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    const newer = { ...preview, timestamp: preview.timestamp + 1 };
    act(() => tick({ payload: newer }));
    await act(async () => resolveSnapshot(preview));
    expect(result.current.payload).toEqual(newer);
  });

  it('releases a subscription that finishes registering after unmount', async () => {
    let resolveListen!: (release: () => void) => void;
    mocks.listen.mockImplementation(() => new Promise(resolve => { resolveListen = resolve; }));
    const { unmount } = renderHook(useMarketClock);
    unmount();
    const release = vi.fn();
    await act(async () => resolveListen(release));
    expect(release).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('reports a connection error and allows a successful retry', async () => {
    mocks.listen.mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValue(vi.fn());
    mocks.invoke.mockResolvedValue(preview);
    const { result } = renderHook(useMarketClock);
    await waitFor(() => expect(result.current.error).toContain('IPC unavailable'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.payload).toEqual(preview));
    expect(result.current.error).toBeNull();
  });

  it('does not invent a live clock in the browser', () => {
    mocks.isTauri.mockReturnValue(false);
    const { result } = renderHook(useMarketClock);
    expect(result.current.payload).toBeNull();
    expect(result.current.native).toBe(false);
    expect(mocks.listen).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('applies a timezone and rejects queued ticks from the old timezone', async () => {
    let tick!: (event: { payload: MarketPayload }) => void;
    mocks.listen.mockImplementation((_name, callback) => { tick = callback; return Promise.resolve(vi.fn()); });
    mocks.invoke.mockResolvedValueOnce(preview);
    const { result } = renderHook(useMarketClock);
    await waitFor(() => expect(result.current.payload).toEqual(preview));
    const dubai = previewInTimezone('Asia/Dubai');
    mocks.invoke.mockResolvedValueOnce(dubai);
    await act(() => result.current.setTimezone('Asia/Dubai'));
    expect(mocks.invoke).toHaveBeenLastCalledWith('set_home_timezone', { homeTimezone: 'Asia/Dubai' });
    act(() => tick({ payload: { ...preview, timestamp: preview.timestamp + 1 } }));
    expect(result.current.payload?.home.id).toBe('Asia/Dubai');
    act(() => tick({ payload: { ...dubai, timestamp: dubai.timestamp + 2 } }));
    expect(result.current.payload?.timestamp).toBe(dubai.timestamp + 2);
    mocks.invoke.mockRejectedValueOnce(new Error('disk unavailable'));
    await act(() => result.current.setTimezone('UTC'));
    expect(result.current.timezoneError).toContain('disk unavailable');
    act(() => tick({ payload: { ...dubai, timestamp: dubai.timestamp + 3 } }));
    expect(result.current.payload?.timestamp).toBe(dubai.timestamp + 3);
  });

  it('saves browser preview selections and restores them without timers', async () => {
    mocks.isTauri.mockReturnValue(false);
    const first = renderHook(useMarketClock);
    await act(() => first.result.current.setTimezone('Asia/Kathmandu'));
    expect(first.result.current.previewPayload.home.next_open.time).toBe('02:45:00');
    first.unmount();
    const second = renderHook(useMarketClock);
    expect(second.result.current.previewPayload.home.id).toBe('Asia/Kathmandu');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
