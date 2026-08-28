import { NextResponse } from 'next/server';
import { ExApiError, fetchExList } from '@/lib/ex-api';
import { buildSegments } from '@/lib/geometry';
import { withCache } from '@/lib/memo-cache';
import type { RawConzone, TrafficSnapshot } from '@/lib/types';

/** VDS 소통정보는 약 1분 주기로 갱신되므로 60초 캐시한다. */
const REVALIDATE_SECONDS = 60;

export async function GET() {
  try {
    const rows = await withCache('odtraffic', REVALIDATE_SECONDS * 1000, () =>
      fetchExList<RawConzone>({
        endpoint: 'odtraffic/trafficAmountByRealtime',
        params: { numOfRows: 10000, pageNo: 1 },
        revalidate: REVALIDATE_SECONDS,
      }),
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: '도로공사에서 반환한 실시간 소통정보가 비어 있습니다.' },
        { status: 502 },
      );
    }

    const segments = buildSegments(rows);
    const routes = [...new Set(segments.map((s) => s.routeName))].sort((a, b) =>
      a.localeCompare(b, 'ko'),
    );

    const snapshot: TrafficSnapshot = {
      updatedAt: new Date().toISOString(),
      stdDate: rows[0].stdDate,
      stdHour: rows[0].stdHour,
      segments,
      routes,
    };

    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': `s-maxage=${REVALIDATE_SECONDS}` },
    });
  } catch (error) {
    const message =
      error instanceof ExApiError
        ? error.message
        : '실시간 교통정보를 불러오는 중 알 수 없는 오류가 발생했습니다.';
    console.error('[api/traffic]', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
