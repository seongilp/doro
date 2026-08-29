/**
 * 실시간 콘존 데이터를 전송용 값 배열로 줄인다.
 *
 * 콘존의 이름·노선은 정적 색인(`lib/conzone-index.ts`)에 있으므로 여기서는
 * 매분 바뀌는 값만 뽑는다. 결과 배열은 색인과 같은 순서이며, 해당 콘존의
 * 관측치가 없으면 null이다.
 */

import { positionById } from './conzone-index';
import type { ConzoneValues, RawConzone } from './types';

interface Accumulator {
  readonly speeds: number[];
  readonly traffic: number[];
  grade: number;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 한 콘존에 여러 VDS 관측치가 오므로 평균 속도·평균 교통량, 최악 혼잡등급으로 합친다.
 * 속도 -1은 미수집을 뜻하므로 평균에서 제외한다.
 */
export function buildConzoneValues(
  rows: readonly RawConzone[],
): readonly (ConzoneValues | null)[] {
  const acc = new Array<Accumulator | null>(positionById.size).fill(null);

  for (const row of rows) {
    const at = positionById.get(row.conzoneId);
    if (at === undefined) continue;

    const speed = Number(row.speed);
    const traffic = Number(row.trafficAmout);
    const grade = Number(row.grade);

    let entry = acc[at];
    if (!entry) {
      entry = { speeds: [], traffic: [], grade: 1 };
      acc[at] = entry;
    }
    if (Number.isFinite(speed) && speed > 0) entry.speeds.push(speed);
    if (Number.isFinite(traffic)) entry.traffic.push(traffic);
    if (Number.isFinite(grade)) entry.grade = Math.max(entry.grade, grade);
  }

  return acc.map((entry) =>
    entry
      ? ([
          entry.speeds.length > 0 ? Math.round(mean(entry.speeds)) : -1,
          Math.round(mean(entry.traffic)),
          entry.grade,
        ] as ConzoneValues)
      : null,
  );
}
