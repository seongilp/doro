import { NextResponse } from 'next/server';
import { ExApiError } from '@/lib/ex-api';
import { getTrafficSnapshot, TRAFFIC_CACHE_HEADER } from '@/lib/traffic-service';

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
