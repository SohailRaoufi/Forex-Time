import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWindowControls } from './useWindowControls';

const mocks = vi.hoisted(() => ({ top: vi.fn(), resizable: vi.fn(), position: vi.fn(), monitor: vi.fn(), drag: vi.fn(), size: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setAlwaysOnTop: mocks.top, setResizable: mocks.resizable, setPosition: mocks.position, startDragging: mocks.drag, outerSize: mocks.size }),
  currentMonitor: mocks.monitor,
  LogicalSize: class { constructor(public width: number, public height: number) {} },
  PhysicalPosition: class { constructor(public x: number, public y: number) {} },
}));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });

it('only saves on-top state after the native operation succeeds', async () => {
  const { result } = renderHook(() => useWindowControls(true));
  await waitFor(() => expect(result.current.busy).toBe(false));
  mocks.top.mockRejectedValueOnce(new Error('not allowed'));
  await act(() => result.current.update('onTop', true));
  expect(result.current.preferences.onTop).toBe(false);
  expect(result.current.error).toContain('not allowed');
  mocks.top.mockResolvedValueOnce(undefined);
  await act(() => result.current.update('onTop', true));
  expect(result.current.preferences.onTop).toBe(true);
  expect(JSON.parse(localStorage.getItem('forex-time:preferences:v1')!).onTop).toBe(true);
});

it('places the window in the monitor work area with DPI-aware margins', async () => {
  mocks.monitor.mockResolvedValue({ scaleFactor: 1.5, workArea: { position: { x: -1920, y: 0 }, size: { width: 1920, height: 1040 } } });
  mocks.size.mockResolvedValue({ width: 570, height: 390 });
  const { result } = renderHook(() => useWindowControls(true));
  await waitFor(() => expect(result.current.busy).toBe(false));
  await act(() => result.current.place('bottom-right'));
  expect(mocks.position).toHaveBeenCalledWith({ x: -594, y: 626 });
});

it('blocks dragging and placement when position is locked', async () => {
  const { result } = renderHook(() => useWindowControls(true));
  await waitFor(() => expect(result.current.busy).toBe(false));
  await act(() => result.current.update('locked', true));
  act(() => result.current.drag());
  await act(() => result.current.place('top-right'));
  expect(mocks.resizable).toHaveBeenLastCalledWith(false);
  expect(mocks.drag).not.toHaveBeenCalled();
  expect(mocks.position).not.toHaveBeenCalled();
});
