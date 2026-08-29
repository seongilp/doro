import { fetchExList } from './ex-api';
import { withCache } from './memo-cache';
import { buildConzoneStatuses } from './geometry';
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
    const conzones = buildConzoneStatuses(rows);
    const measured = conzones.filter((c) => c.speed > 0);
    if (measured.length === 0) return FALLBACK;

    return {
      segmentCount: conzones.length,
      routeCount: new Set(conzones.map((c) => c.routeName)).size,
      avgSpeed: Math.round(
        measured.reduce((sum, c) => sum + c.speed, 0) / measured.length,
      ),
      jamCount: measured.filter((c) => levelForSpeed(c.speed) === 'jam').length,
      available: true,
    };
  } catch (error) {
    console.error('[landing-stats]', error);
    return FALLBACK;
  }
}
