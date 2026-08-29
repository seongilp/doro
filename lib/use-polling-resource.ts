'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollingResource<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly lastFetchedAt: Date | null;
  readonly refresh: () => void;
}

interface Options<T> {
  readonly intervalMs: number;
  readonly enabled: boolean;
  /** 서버에서 함께 내려준 첫 데이터. 있으면 마운트 직후 재조회하지 않는다. */
  readonly initialData?: T | null;
}

/** 지정한 주기로 JSON 엔드포인트를 재조회한다. enabled=false면 자동 갱신을 멈춘다. */
export function usePollingResource<T>(
  url: string,
  { intervalMs, enabled, initialData = null }: Options<T>,
): PollingResource<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialData === null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(
    initialData === null ? null : new Date(),
  );
  const [nonce, setNonce] = useState(0);
  const aborted = useRef(false);
  const skipInitialLoad = useRef(initialData !== null);

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
    // 서버가 이미 최신 데이터를 실어 보냈으면 첫 조회를 건너뛴다.
    if (skipInitialLoad.current) {
      skipInitialLoad.current = false;
    } else {
      void load();
    }
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
