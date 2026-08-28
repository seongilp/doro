import { fetchExList } from './ex-api';
import { withCache } from './memo-cache';
import { buildSegments } from './geometry';
import { levelForSpeed } from './traffic-style';
import type { RawConzone } from './types';

export interface LandingStats {
  readonly segmentCount: number;
  readonly routeCount: number;
  readonly avgSpeed: number;
  readonly jamCount: number;
  readonly available: boolean;
}

const FALLBACK: LandingStats = {
  segmentCount: 0,
  routeCount: 0,
  avgSpeed: 0,
  jamCount: 0,
  available: false,
};

/** 랜딩 히어로용 요약 지표. 실패해도 페이지가 깨지지 않도록 폴백을 돌려준다. */
export async function getLandingStats(): Promise<LandingStats> {
  try {
    const rows = await withCache('odtraffic', 60_000, () =>
      fetchExList<RawConzone>({
        endpoint: 'odtraffic/trafficAmountByRealtime',
        params: { numOfRows: 10000, pageNo: 1 },
        revalidate: 300,
      }),
    );
    const segments = buildSegments(rows);
    const measured = segments.filter((s) => s.speed > 0);
    if (measured.length === 0) return FALLBACK;

    return {
      segmentCount: segments.length,
      routeCount: new Set(segments.map((s) => s.routeName)).size,
      avgSpeed: Math.round(
        measured.reduce((sum, s) => sum + s.speed, 0) / measured.length,
      ),
      jamCount: measured.filter((s) => levelForSpeed(s.speed) === 'jam').length,
      available: true,
    };
  } catch (error) {
    console.error('[landing-stats]', error);
    return FALLBACK;
  }
}
