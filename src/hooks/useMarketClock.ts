import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { MarketPayload } from '../lib/types';
import { preview, previewInTimezone } from '../lib/preview';
import timezones from '../lib/timezones.json';

const previewZoneKey = 'forex-time:preview-home-timezone:v1';
function savedPreview(): MarketPayload {
  try {
    const id = localStorage.getItem(previewZoneKey) ?? 'Asia/Kabul';
    return timezones.includes(id) ? previewInTimezone(id) : preview;
  } catch { return preview; }
}

export function useMarketClock() {
  const native = isTauri();
  const [payload, setPayload] = useState<MarketPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [previewPayload, setPreviewPayload] = useState(() => native ? preview : savedPreview());
  const [timezoneBusy, setTimezoneBusy] = useState(false);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const desiredTimezone = useRef<string | null>(null);
  const latestPayload = useRef<MarketPayload | null>(null);
  const changingTimezone = useRef(false);

  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let receivedTick = false;
    let unlisten: UnlistenFn | undefined;
    setError(null);
    setPayload(null);

    async function connect() {
      try {
        const release = await listen<MarketPayload>('market-tick', ({ payload: next }) => {
          if (disposed || (desiredTimezone.current && next.home.id !== desiredTimezone.current)) return;
          receivedTick = true;
          latestPayload.current = next;
          setPayload(next);
          setError(null);
        });
        if (disposed) { release(); return; }
        unlisten = release;
        const snapshot = await invoke<MarketPayload>('get_market_snapshot');
        if (!disposed && !receivedTick && (!desiredTimezone.current || snapshot.home.id === desiredTimezone.current)) {
          latestPayload.current = snapshot;
          setPayload(snapshot);
        }
      } catch (reason) {
        if (!disposed && !receivedTick) setError(`Clock connection failed: ${String(reason)}`);
      }
    }
    void connect();
    return () => { disposed = true; unlisten?.(); };
  }, [native, attempt]);

  async function setTimezone(id: string): Promise<boolean> {
    if (changingTimezone.current) return false;
    changingTimezone.current = true;
    setTimezoneBusy(true);
    setTimezoneError(null);
    const previous = latestPayload.current?.home.id ?? null;
    try {
      if (!timezones.includes(id)) throw new Error('Choose a valid IANA timezone.');
      if (native) {
        desiredTimezone.current = id;
        const snapshot = await invoke<MarketPayload>('set_home_timezone', { homeTimezone: id });
        // A later tick in the newly selected zone may arrive before the command reply.
        if (latestPayload.current?.home.id !== id || latestPayload.current.timestamp <= snapshot.timestamp) {
          latestPayload.current = snapshot;
          setPayload(snapshot);
        }
      } else {
        const next = previewInTimezone(id);
        localStorage.setItem(previewZoneKey, id);
        setPreviewPayload(next);
      }
      return true;
    } catch (reason) {
      desiredTimezone.current = previous;
      setTimezoneError(`Could not change timezone: ${String(reason)}`);
      return false;
    } finally {
      changingTimezone.current = false;
      setTimezoneBusy(false);
    }
  }

  return { native, payload, previewPayload, error, timezoneBusy, timezoneError, setTimezone, retry: () => setAttempt(value => value + 1) };
}
