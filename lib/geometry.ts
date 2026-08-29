/**
 * 실시간 콘존 데이터를 지도에 그릴 수 있는 구간으로 변환한다.
 *
 * 콘존 경로(위경도)는 `scripts/build-conzone-paths.mjs`가 미리 계산해
 * `data/conzone-paths.json`에 넣어 둔다. 여기서는 콘존 id로 조회만 한다.
 * 노선이 개편되면 `npm run build:paths`로 다시 생성한다.
 */

import conzonePathData from '@/data/conzone-paths.json';
import type { ConzoneSegment, LatLng, RawConzone } from './types';

interface ConzonePaths {
  /** OpenStreetMap 도로 선형을 따라 잘라낸 경로 */
  readonly roads: Readonly<Record<string, readonly LatLng[]>>;
  /** 도로 선형을 못 얻어 양 끝 앵커를 직선으로 이은 경로 */
  readonly straight: Readonly<Record<string, readonly LatLng[]>>;
}

const { roads, straight } = conzonePathData as unknown as ConzonePaths;

interface AggregatedConzone {
  readonly row: RawConzone;
  readonly speeds: number[];
  readonly traffic: number[];
  grade: number;
}

/** 한 콘존에 여러 VDS 관측치가 오므로 평균 속도·평균 교통량, 최악 혼잡등급으로 합친다. */
function aggregate(rows: readonly RawConzone[]): readonly AggregatedConzone[] {
  const byId = new Map<string, AggregatedConzone>();

  for (const row of rows) {
    const speed = Number(row.speed);
    const traffic = Number(row.trafficAmout);
    const grade = Number(row.grade);
    // 속도 -1은 미수집을 뜻하므로 평균에서 제외한다.
    const usableSpeed = Number.isFinite(speed) && speed > 0;

    const existing = byId.get(row.conzoneId);
    if (existing) {
      if (usableSpeed) existing.speeds.push(speed);
      if (Number.isFinite(traffic)) existing.traffic.push(traffic);
      if (Number.isFinite(grade)) existing.grade = Math.max(existing.grade, grade);
    } else {
      byId.set(row.conzoneId, {
        row,
        speeds: usableSpeed ? [speed] : [],
        traffic: Number.isFinite(traffic) ? [traffic] : [],
        grade: Number.isFinite(grade) ? grade : 1,
      });
    }
  }

  return [...byId.values()];
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 실시간 콘존 행들을 지도에 그릴 수 있는 구간 목록으로 변환한다. */
export function buildSegments(rows: readonly RawConzone[]): readonly ConzoneSegment[] {
  const segments: ConzoneSegment[] = [];

  for (const item of aggregate(rows)) {
    const { row } = item;
    const path = roads[row.conzoneId] ?? straight[row.conzoneId];
    if (!path || path.length < 2) continue;

    segments.push({
      id: row.conzoneId,
      name: row.conzoneName,
      routeNo: row.routeNo,
      routeName: row.routeName,
      direction: row.updownTypeCode === 'E' ? 'E' : 'S',
      speed: item.speeds.length > 0 ? Math.round(mean(item.speeds)) : -1,
      traffic: Math.round(mean(item.traffic)),
      grade: item.grade,
      path,
    });
  }

  return segments;
}
