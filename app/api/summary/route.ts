import { NextResponse } from 'next/server';
import { ExApiError } from '@/lib/ex-api';
import { getTrafficSummary, SUMMARY_CACHE_HEADER } from '@/lib/traffic-service';

/** 요청마다 함수를 깨우지 않고 엣지 정적 캐시에서 바로 나가게 한다. */
export const dynamic = 'force-static';
// SUMMARY_REVALIDATE_SECONDS와 같은 값.
export const revalidate = 300;

export async function GET() {
  try {
    const summary = await getTrafficSummary();
    return NextResponse.json(summary, {
      headers: { 'Cache-Control': SUMMARY_CACHE_HEADER },
    });
  } catch (error) {
    const message =
      error instanceof ExApiError || error instanceof Error
        ? error.message
        : '전국 통행량 집계를 불러오는 중 알 수 없는 오류가 발생했습니다.';
    console.error('[api/summary]', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
