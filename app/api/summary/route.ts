import { NextResponse } from 'next/server';
import { ExApiError, fetchExList } from '@/lib/ex-api';
import type { RawTrafficAll, SummaryBucket, TrafficSummary } from '@/lib/types';

/** 전국 집계는 1시간 단위로 갱신된다. */
const REVALIDATE_SECONDS = 300;

const CAR_TYPE_LABELS: Readonly<Record<string, string>> = {
  '1': '1종 (승용차)',
  '2': '2종 (중형버스·소형화물)',
  '3': '3종 (대형버스·중형화물)',
  '4': '4종 (대형화물)',
  '5': '5종 (특수화물)',
  '6': '6종 (경차)',
};

function sumBy(
  rows: readonly RawTrafficAll[],
  pick: (row: RawTrafficAll) => string,
): readonly SummaryBucket[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.trafficAmout);
    if (!Number.isFinite(amount)) continue;
    const label = pick(row);
    totals.set(label, (totals.get(label) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export async function GET() {
  try {
    const rows = await fetchExList<RawTrafficAll>({
      endpoint: 'trafficapi/trafficAll',
      params: { numOfRows: 200, pageNo: 1 },
      revalidate: REVALIDATE_SECONDS,
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: '전국 통행량 집계가 비어 있습니다.' },
        { status: 502 },
      );
    }

    const summary: TrafficSummary = {
      sumDate: rows[0].sumDate,
      sumTm: rows[0].sumTm,
      total: rows.reduce((sum, row) => sum + (Number(row.trafficAmout) || 0), 0),
      byOperator: sumBy(rows, (r) => r.exDivName),
      byTcs: sumBy(rows, (r) => r.tcsName),
      byCarType: sumBy(rows, (r) => CAR_TYPE_LABELS[r.carType] ?? `${r.carType}종`),
    };

    return NextResponse.json(summary, {
      headers: { 'Cache-Control': `s-maxage=${REVALIDATE_SECONDS}` },
    });
  } catch (error) {
    const message =
      error instanceof ExApiError
        ? error.message
        : '전국 통행량 집계를 불러오는 중 알 수 없는 오류가 발생했습니다.';
    console.error('[api/summary]', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
