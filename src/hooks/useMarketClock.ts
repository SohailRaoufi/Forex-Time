import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { MarketPayload } from '../lib/types';

export function useMarketClock() {
  const native = isTauri();
  const [payload, setPayload] = useState<MarketPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
          if (disposed) return;
          receivedTick = true;
          setPayload(next);
          setError(null);
        });
        if (disposed) { release(); return; }
        unlisten = release;
        const snapshot = await invoke<MarketPayload>('get_market_snapshot');
        if (!disposed && !receivedTick) setPayload(snapshot);
      } catch (reason) {
        if (!disposed && !receivedTick) setError(`Clock connection failed: ${String(reason)}`);
      }
    }
    void connect();
    return () => { disposed = true; unlisten?.(); };
  }, [native, attempt]);

  return { native, payload, error, retry: () => setAttempt(value => value + 1) };
}
