'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollingResource<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly lastFetchedAt: Date | null;
  readonly refresh: () => void;
}

/** 지정한 주기로 JSON 엔드포인트를 재조회한다. enabled=false면 자동 갱신을 멈춘다. */
export function usePollingResource<T>(
  url: string,
  intervalMs: number,
  enabled: boolean,
): PollingResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [nonce, setNonce] = useState(0);
  const aborted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      const payload = await response.json();
      if (aborted.current) return;

      if (!response.ok) {
        setError(payload?.error ?? `요청이 실패했습니다 (HTTP ${response.status}).`);
      } else {
        setData(payload as T);
        setError(null);
        setLastFetchedAt(new Date());
      }
    } catch (cause) {
      if (!aborted.current) {
        setError(`네트워크 오류: ${(cause as Error).message}`);
      }
    } finally {
      if (!aborted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    aborted.current = false;
    void load();
    return () => {
      aborted.current = true;
    };
  }, [load, nonce]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNonce((n) => n + 1), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, lastFetchedAt, refresh };
}
