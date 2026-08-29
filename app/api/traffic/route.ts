import { NextResponse } from 'next/server';
import { ExApiError } from '@/lib/ex-api';
import { getTrafficSnapshot, TRAFFIC_CACHE_HEADER } from '@/lib/traffic-service';

/**
 * 요청마다 함수를 깨우지 않고 엣지 정적 캐시에서 바로 나가게 한다.
 * 입력이 없는 라우트라 프리렌더가 가능하고, 갱신은 ISR이 백그라운드로 처리한다.
 */
export const dynamic = 'force-static';
// TRAFFIC_REVALIDATE_SECONDS와 같은 값. Next.js는 이 값이 리터럴이어야 인식한다.
export const revalidate = 60;

export async function GET() {
  try {
    const snapshot = await getTrafficSnapshot();
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': TRAFFIC_CACHE_HEADER },
    });
  } catch (error) {
    const message =
      error instanceof ExApiError || error instanceof Error
        ? error.message
        : '실시간 교통정보를 불러오는 중 알 수 없는 오류가 발생했습니다.';
    console.error('[api/traffic]', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
