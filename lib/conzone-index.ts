/**
 * 콘존의 정적 정보(이름·노선·방향).
 *
 * 이 값들은 노선이 개편될 때만 바뀐다. 좌표와 마찬가지로 빌드 산출물에 담아
 * 불변 청크로 내보내고, 매분 오가는 응답에는 속도·교통량·등급만 싣는다.
 * `npm run build:paths`가 data/conzone-index.json을 만든다.
 */

import indexData from '@/data/conzone-index.json';

export interface ConzoneMeta {
  readonly id: string;
  readonly name: string;
  readonly routeName: string;
  readonly routeNo: string;
  readonly direction: 'S' | 'E';
}

/** [노선명, 노선번호] */
type RawRoute = readonly [string, string];
/** [콘존id, 구간명, 노선 인덱스, 방향(0=상행 S, 1=하행 E)] */
type RawEntry = readonly [string, string, number, number];

interface IndexFile {
  readonly routes: readonly RawRoute[];
  readonly conzones: readonly RawEntry[];
}

const file = indexData as unknown as IndexFile;

/** 콘존 id 오름차순. 실시간 값 배열이 이 순서에 맞춰 온다. */
export const conzoneMeta: readonly ConzoneMeta[] = file.conzones.map(
  ([id, name, route, dir]) => {
    const [routeName, routeNo] = file.routes[route] ?? ['', ''];
    return { id, name, routeName, routeNo, direction: dir === 1 ? 'E' : 'S' };
  },
);

/** 콘존 id → 값 배열에서의 위치 */
export const positionById: ReadonlyMap<string, number> = new Map(
  conzoneMeta.map((meta, i) => [meta.id, i]),
);

/** 화면 필터용 노선명 목록 (가나다순) */
export const routeNames: readonly string[] = [...file.routes.map(([name]) => name)].sort(
  (a, b) => a.localeCompare(b, 'ko'),
);
