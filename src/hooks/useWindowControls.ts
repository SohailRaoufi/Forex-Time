import { useEffect, useRef, useState } from 'react';
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window';

type Preferences = { onTop: boolean; locked: boolean; compact: boolean; twelveHour: boolean };
const defaults: Preferences = { onTop: false, locked: false, compact: false, twelveHour: false };
const key = 'forex-time:preferences:v1';

function readPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) =>
      [name, typeof stored[name] === 'boolean' ? stored[name] : fallback])) as Preferences;
  } catch { return defaults; }
}

export function useWindowControls(native: boolean) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function save(next: Preferences) {
    setPreferences(next);
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { setError('Your preference was applied, but could not be saved.'); }
  }

  useEffect(() => {
    if (!native) return;
    const win = getCurrentWindow();
    let disposed = false;
    inFlight.current = true;
    setBusy(true);
    // Do not resize on startup: the Rust plugin restores the saved geometry.
    void (async () => {
      await win.setAlwaysOnTop(preferences.onTop);
      await win.setResizable(!preferences.locked);
    })().catch(reason => {
      if (!disposed) setError(`Could not restore window preferences: ${String(reason)}`);
    }).finally(() => {
      if (!disposed) { inFlight.current = false; setBusy(false); }
    });
    return () => { disposed = true; };
    // Restore once; subsequent changes go through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  async function perform(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (reason) { setError(`Window control failed: ${String(reason)}`); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function update(name: keyof Preferences, value: boolean) {
    await perform(async () => {
      if (native) {
        const win = getCurrentWindow();
        if (name === 'onTop') await win.setAlwaysOnTop(value);
        if (name === 'locked') await win.setResizable(!value);
        if (name === 'compact') {
          const monitor = await currentMonitor();
          const available = monitor?.workArea.size.toLogical(monitor.scaleFactor);
          await win.setSize(new LogicalSize(
            Math.min(value ? 380 : 880, available ? available.width - 32 : 880),
            Math.min(value ? 260 : 880, available ? available.height - 32 : 880),
          ));
          // Expanding near a screen edge must not put controls off-screen.
          await win.center();
        }
      }
      save({ ...preferences, [name]: value });
    });
  }

  async function place(corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center') {
    if (preferences.locked) return;
    await perform(async () => {
      if (!native) return;
      const win = getCurrentWindow();
      if (corner === 'center') { await win.center(); return; }
      const monitor = await currentMonitor();
      if (!monitor) throw new Error('No monitor is available.');
      const size = await win.outerSize();
      const { position, size: area } = monitor.workArea;
      const margin = Math.round(16 * monitor.scaleFactor);
      const x = corner.endsWith('right') ? Math.max(margin, area.width - size.width - margin) : margin;
      const y = corner.startsWith('bottom') ? Math.max(margin, area.height - size.height - margin) : margin;
      await win.setPosition(new PhysicalPosition(position.x + x, position.y + y));
    });
  }

  function drag() {
    if (!native || preferences.locked || inFlight.current) return;
    void perform(() => getCurrentWindow().startDragging());
  }

  return { preferences, busy, error, update, place, drag, dismissError: () => setError(null),
    minimize: () => perform(async () => { if (native) await getCurrentWindow().minimize(); }),
    close: () => perform(async () => { if (native) await getCurrentWindow().close(); }),
  };
}
