/**
 * 실시간 콘존 데이터를 화면에서 쓰는 상태 목록으로 변환한다.
 * 좌표는 붙이지 않는다 — 경로는 지도 컴포넌트가 정적으로 들고 있다.
 */

import { conzonePaths } from './conzone-paths';
import type { ConzoneStatus, RawConzone } from './types';

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

/** 그릴 수 있는(경로가 있는) 콘존만 골라 실시간 상태 목록으로 만든다. */
export function buildConzoneStatuses(
  rows: readonly RawConzone[],
): readonly ConzoneStatus[] {
  const statuses: ConzoneStatus[] = [];

  for (const item of aggregate(rows)) {
    const { row } = item;
    if (!conzonePaths[row.conzoneId]) continue;

    statuses.push({
      id: row.conzoneId,
      name: row.conzoneName,
      routeNo: row.routeNo,
      routeName: row.routeName,
      direction: row.updownTypeCode === 'E' ? 'E' : 'S',
      speed: item.speeds.length > 0 ? Math.round(mean(item.speeds)) : -1,
      traffic: Math.round(mean(item.traffic)),
      grade: item.grade,
    });
  }

  return statuses;
}
