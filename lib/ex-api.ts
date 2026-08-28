/** 한국도로공사 공공데이터 포털(data.ex.co.kr) 호출 래퍼 */

const BASE_URL = 'https://data.ex.co.kr/openapi';

/** 기본 UA로 호출하면 WAF가 400 Request Blocked를 반환하므로 브라우저 UA를 명시한다. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export class ExApiError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ExApiError';
  }
}

interface ExEnvelope<T> {
  readonly code?: string;
  readonly message?: string;
  readonly count?: number;
  readonly list?: readonly T[];
  readonly trafficAll?: readonly T[];
}

/**
 * 개발용 오프라인 픽스처.
 * 도로공사 WAF가 호출을 차단할 때 EX_FIXTURE_DIR에 저장해 둔 응답으로 대체한다.
 * 운영(production)에서는 무시된다.
 */
async function readFixture<T>(endpoint: string): Promise<readonly T[] | null> {
  const dir = process.env.EX_FIXTURE_DIR;
  if (!dir || process.env.NODE_ENV === 'production') return null;

  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const file = join(dir, `${endpoint.replace(/\//g, '_')}.json`);

  try {
    const payload = JSON.parse(await readFile(file, 'utf8')) as ExEnvelope<T>;
    return payload.list ?? payload.trafficAll ?? [];
  } catch {
    return null;
  }
}

function requireApiKey(): string {
  const key = process.env.EX_API_KEY;
  if (!key) {
    throw new ExApiError(
      'EX_API_KEY 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.',
      'config',
    );
  }
  return key;
}

interface FetchOptions {
  readonly endpoint: string;
  readonly params?: Readonly<Record<string, string | number>>;
  /** 초 단위 재검증 주기 */
  readonly revalidate: number;
}

/** 엔드포인트를 호출해 리스트 형태의 페이로드를 돌려준다. */
export async function fetchExList<T>({
  endpoint,
  params = {},
  revalidate,
}: FetchOptions): Promise<readonly T[]> {
  const fixture = await readFixture<T>(endpoint);
  if (fixture) return fixture;

  const query = new URLSearchParams({
    key: requireApiKey(),
    type: 'json',
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
  });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/${endpoint}?${query}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      next: { revalidate },
    });
  } catch (cause) {
    throw new ExApiError(
      `도로공사 API에 연결하지 못했습니다: ${(cause as Error).message}`,
      endpoint,
    );
  }

  if (!response.ok) {
    throw new ExApiError(
      `도로공사 API가 오류를 반환했습니다 (HTTP ${response.status}).`,
      endpoint,
      response.status,
    );
  }

  const text = await response.text();
  if (!text.trimStart().startsWith('{')) {
    throw new ExApiError(
      '도로공사 API가 JSON이 아닌 오류 페이지를 반환했습니다.',
      endpoint,
      response.status,
    );
  }

  let payload: ExEnvelope<T>;
  try {
    payload = JSON.parse(text) as ExEnvelope<T>;
  } catch {
    throw new ExApiError('도로공사 API 응답을 파싱하지 못했습니다.', endpoint);
  }

  if (payload.code && payload.code !== 'SUCCESS') {
    throw new ExApiError(
      payload.message ?? '도로공사 API 인증에 실패했습니다.',
      endpoint,
    );
  }

  return payload.list ?? payload.trafficAll ?? [];
}
