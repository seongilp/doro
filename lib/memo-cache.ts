/**
 * 프로세스 내 TTL 캐시.
 * 실시간 소통정보 응답이 3MB를 넘어 Next 데이터 캐시(2MB 한도)에 들어가지 않으므로,
 * 서버 인스턴스 수준에서 결과를 짧게 재사용해 상류 API 호출을 줄인다.
 */

interface Entry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function withCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const task = load()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}
