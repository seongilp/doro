/**
 * 실시간 스냅숏의 전송 형식.
 *
 * 콘존 1,516개를 객체 배열로 보내면 키 이름과 노선명이 그대로 1,516번 반복된다.
 * 노선을 사전으로 빼고 각 콘존을 튜플로 눕혀 전송량을 절반 이하로 줄인다.
 * 이 형식은 서버가 만들고 클라이언트가 바로 풀어 쓰며, 화면 코드는 늘 ConzoneStatus를 본다.
 */

import type { ConzoneStatus } from './types';

/** [노선명, 노선번호] */
export type WireRoute = readonly [string, string];

/** [콘존id, 구간명, 노선 인덱스, 방향(0=상행 S, 1=하행 E), 속도, 교통량, 혼잡등급] */
export type WireConzone = readonly [string, string, number, 0 | 1, number, number, number];

export interface WireSnapshot {
  readonly updatedAt: string;
  readonly stdDate: string;
  readonly stdHour: string;
  readonly routes: readonly WireRoute[];
  readonly conzones: readonly WireConzone[];
}

interface SnapshotInput {
  readonly updatedAt: string;
  readonly stdDate: string;
  readonly stdHour: string;
  readonly conzones: readonly ConzoneStatus[];
}

export function encodeSnapshot(input: SnapshotInput): WireSnapshot {
  const routeIndex = new Map<string, number>();
  const routes: WireRoute[] = [];

  const indexOf = (conzone: ConzoneStatus): number => {
    const key = `${conzone.routeName}|${conzone.routeNo}`;
    const found = routeIndex.get(key);
    if (found !== undefined) return found;
    const next = routes.push([conzone.routeName, conzone.routeNo]) - 1;
    routeIndex.set(key, next);
    return next;
  };

  return {
    updatedAt: input.updatedAt,
    stdDate: input.stdDate,
    stdHour: input.stdHour,
    routes,
    conzones: input.conzones.map((c) => [
      c.id,
      c.name,
      indexOf(c),
      c.direction === 'E' ? 1 : 0,
      c.speed,
      c.traffic,
      c.grade,
    ]),
  };
}

export interface DecodedSnapshot {
  readonly updatedAt: string;
  readonly stdDate: string;
  readonly stdHour: string;
  /** 화면 필터용 노선명 목록 (가나다순) */
  readonly routeNames: readonly string[];
  readonly conzones: readonly ConzoneStatus[];
}

export function decodeSnapshot(wire: WireSnapshot): DecodedSnapshot {
  const conzones = wire.conzones.map(([id, name, route, dir, speed, traffic, grade]) => {
    const [routeName, routeNo] = wire.routes[route] ?? ['', ''];
    return {
      id,
      name,
      routeNo,
      routeName,
      direction: dir === 1 ? ('E' as const) : ('S' as const),
      speed,
      traffic,
      grade,
    };
  });

  return {
    updatedAt: wire.updatedAt,
    stdDate: wire.stdDate,
    stdHour: wire.stdHour,
    routeNames: [...wire.routes.map(([name]) => name)].sort((a, b) =>
      a.localeCompare(b, 'ko'),
    ),
    conzones,
  };
}
