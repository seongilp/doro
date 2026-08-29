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
    // 데이터 페칭 이펙트. 상태 갱신은 모두 await 이후에 일어나므로 렌더 중 갱신이 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      aborted.current = true;
    };
  }, [load, nonce]);

  const trigger = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(trigger, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, trigger]);

  return { data, error, loading, lastFetchedAt, refresh: trigger };
}
