/**
 * 실시간 스냅숏의 전송 형식.
 *
 * 콘존의 id·이름·노선은 정적 색인(`lib/conzone-index.ts`)에 있고 불변 청크로
 * 캐시된다. 그래서 매분 오가는 것은 색인 순서에 맞춘 값 배열뿐이다.
 * 관측치가 없는 콘존은 null이다.
 */

import { conzoneMeta } from './conzone-index';
import type { ConzoneStatus, ConzoneValues } from './types';

export interface WireSnapshot {
  readonly updatedAt: string;
  readonly stdDate: string;
  readonly stdHour: string;
  readonly values: readonly (ConzoneValues | null)[];
}

/** 정적 색인과 실시간 값을 합쳐 화면에서 쓰는 형태로 만든다. */
export function decodeConzones(
  values: readonly (ConzoneValues | null)[],
): readonly ConzoneStatus[] {
  const statuses: ConzoneStatus[] = [];

  for (let i = 0; i < conzoneMeta.length; i += 1) {
    const value = values[i];
    if (!value) continue;
    const meta = conzoneMeta[i];
    statuses.push({
      id: meta.id,
      name: meta.name,
      routeNo: meta.routeNo,
      routeName: meta.routeName,
      direction: meta.direction,
      speed: value[0],
      traffic: value[1],
      grade: value[2],
    });
  }

  return statuses;
}
