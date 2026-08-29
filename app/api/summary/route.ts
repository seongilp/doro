import { NextResponse } from 'next/server';
import { ExApiError } from '@/lib/ex-api';
import { getTrafficSummary, SUMMARY_CACHE_HEADER } from '@/lib/traffic-service';

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
