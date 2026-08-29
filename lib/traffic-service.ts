/**
 * 도로공사 실시간 데이터를 앱에서 쓰는 형태로 만들어 주는 공용 서비스.
 * API 라우트와 서버 컴포넌트가 같은 함수를 쓴다.
 */

import { fetchExList } from './ex-api';
import { buildConzoneStatuses } from './geometry';
import { withCache } from './memo-cache';
import type {
  RawConzone,
  RawTrafficAll,
  SummaryBucket,
  TrafficSnapshot,
  TrafficSummary,
} from './types';

/** VDS 소통정보는 약 1분 주기로 갱신된다. */
export const TRAFFIC_REVALIDATE_SECONDS = 60;
/** 전국 통행량 집계는 1시간 단위다. */
export const SUMMARY_REVALIDATE_SECONDS = 300;

/**
 * 상류 응답이 3MB라 한 번 받는 데 수 초가 걸린다.
 * stale-while-revalidate로 오래된 값을 즉시 주고 갱신은 뒤에서 돌린다.
 */
export const TRAFFIC_CACHE_HEADER = `public, s-maxage=${TRAFFIC_REVALIDATE_SECONDS}, stale-while-revalidate=600`;
export const SUMMARY_CACHE_HEADER = `public, s-maxage=${SUMMARY_REVALIDATE_SECONDS}, stale-while-revalidate=3600`;

const CAR_TYPE_LABELS: Readonly<Record<string, string>> = {
  '1': '1종 (승용차)',
  '2': '2종 (중형버스·소형화물)',
  '3': '3종 (대형버스·중형화물)',
  '4': '4종 (대형화물)',
  '5': '5종 (특수화물)',
  '6': '6종 (경차)',
};

export class EmptyResponseError extends Error {}

export async function getTrafficSnapshot(): Promise<TrafficSnapshot> {
  const rows = await withCache('odtraffic', TRAFFIC_REVALIDATE_SECONDS * 1000, () =>
    fetchExList<RawConzone>({
      endpoint: 'odtraffic/trafficAmountByRealtime',
      params: { numOfRows: 10000, pageNo: 1 },
      revalidate: TRAFFIC_REVALIDATE_SECONDS,
    }),
  );

  if (rows.length === 0) {
    throw new EmptyResponseError('도로공사에서 반환한 실시간 소통정보가 비어 있습니다.');
  }

  const conzones = buildConzoneStatuses(rows);
  const routes = [...new Set(conzones.map((c) => c.routeName))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );

  return {
    updatedAt: new Date().toISOString(),
    stdDate: rows[0].stdDate,
    stdHour: rows[0].stdHour,
    conzones,
    routes,
  };
}

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

export async function getTrafficSummary(): Promise<TrafficSummary> {
  const rows = await withCache('trafficAll', SUMMARY_REVALIDATE_SECONDS * 1000, () =>
    fetchExList<RawTrafficAll>({
      endpoint: 'trafficapi/trafficAll',
      params: { numOfRows: 200, pageNo: 1 },
      revalidate: SUMMARY_REVALIDATE_SECONDS,
    }),
  );

  if (rows.length === 0) {
    throw new EmptyResponseError('전국 통행량 집계가 비어 있습니다.');
  }

  return {
    sumDate: rows[0].sumDate,
    sumTm: rows[0].sumTm,
    total: rows.reduce((sum, row) => sum + (Number(row.trafficAmout) || 0), 0),
    byOperator: sumBy(rows, (r) => r.exDivName),
    byTcs: sumBy(rows, (r) => r.tcsName),
    byCarType: sumBy(rows, (r) => CAR_TYPE_LABELS[r.carType] ?? `${r.carType}종`),
  };
}
