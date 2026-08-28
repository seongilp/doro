/**
 * 콘존(구간) 실시간 소통정보에는 좌표가 없다.
 * 콘존명이 "시점IC-종점IC" 형태이고 conzoneId에 노선 진행 순번이 담겨 있다는 점을 이용해
 * 영업소·IC 좌표를 앵커로 삼고, 좌표를 모르는 분기점(JC)은 앵커 사이에서 선형 보간한다.
 */

import conzonePathData from '@/data/conzone-paths.json';
import unitData from '@/data/units.json';
import type { ConzoneSegment, LatLng, RawConzone, UnitLocation } from './types';

const units = unitData as readonly UnitLocation[];

/**
 * scripts/build-conzone-paths.mjs가 미리 계산해 둔 실제 도로 선형.
 * OpenStreetMap 고속도로 폴리라인 위에 콘존 양 끝을 스냅해 잘라낸 결과다.
 */
const roadPaths = conzonePathData as unknown as Readonly<
  Record<string, readonly LatLng[]>
>;

/** 대한민국 대략 경계. 일부 영업소는 좌표가 null이라 0,0으로 잘못 읽히는 것을 걸러낸다. */
const KOREA_BOUNDS = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 } as const;

function isInKorea(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KOREA_BOUNDS.minLat &&
    lat <= KOREA_BOUNDS.maxLat &&
    lng >= KOREA_BOUNDS.minLng &&
    lng <= KOREA_BOUNDS.maxLng
  );
}

/** "서영천하이패스IC" → "서영천" 처럼 시설 접미사를 제거해 매칭 키를 만든다. */
function normalizeName(name: string): string {
  return name
    .replace(/\s/g, '')
    .replace(/하이패스/g, 'Hi')
    .replace(/(IC|JC|JCT|TG|Hi|분기점|나들목|영업소|본선)+$/g, '');
}

function buildAnchorIndex(): ReadonlyMap<string, LatLng> {
  const index = new Map<string, LatLng>();
  for (const unit of units) {
    if (unit.yValue == null || unit.xValue == null) continue;
    const lat = Number(unit.yValue);
    const lng = Number(unit.xValue);
    if (!isInKorea(lat, lng)) continue;

    const key = normalizeName(unit.unitName);
    const point: LatLng = [lat, lng];
    index.set(`${key}@${unit.routeName}`, point);
    if (!index.has(key)) index.set(key, point);
  }
  return index;
}

const anchors = buildAnchorIndex();

/** 같은 노선에서만 찾는다. 동명 IC 오매칭을 막는 1차 기준. */
function lookupOnRoute(name: string, routeName: string): LatLng | null {
  return anchors.get(`${normalizeName(name)}@${routeName}`) ?? null;
}

/** 노선 무관 매칭. 이름이 같아도 전혀 다른 지역일 수 있어 거리 검증과 함께 쓴다. */
function lookupAnywhere(name: string): LatLng | null {
  return anchors.get(normalizeName(name)) ?? null;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** 노선 무관 매칭을 받아들일 최대 거리. 이보다 멀면 동명 다른 지점으로 본다. */
const FALLBACK_MAX_KM = 60;

/** 하나의 콘존이 이보다 길면 보간 실패로 보고 그리지 않는다. */
const MAX_SEGMENT_KM = 80;

/**
 * 노선 내 노드 좌표를 해석한다.
 * 노선 일치 앵커를 먼저 채우고, 남은 노드는 노선 무관 매칭을 시도하되
 * 이미 확정된 앵커에서 지나치게 먼 후보는 버린다.
 */
function resolveNodes(
  nodeNames: readonly string[],
  routeName: string,
): readonly (LatLng | null)[] {
  const strict = nodeNames.map((name) => lookupOnRoute(name, routeName));
  const trusted = strict.filter(Boolean) as LatLng[];

  return strict.map((point, i) => {
    if (point) return point;
    const candidate = lookupAnywhere(nodeNames[i]);
    if (!candidate) return null;
    if (trusted.length === 0) return candidate;
    const nearest = Math.min(...trusted.map((anchor) => distanceKm(anchor, candidate)));
    return nearest <= FALLBACK_MAX_KM ? candidate : null;
  });
}

/** 알려진 좌표 사이의 빈 노드를 선형 보간하고, 양 끝은 가장 가까운 좌표로 채운다. */
function fillGaps(points: readonly (LatLng | null)[]): readonly (LatLng | null)[] {
  const filled = points.slice();

  for (let i = 0; i < filled.length; i += 1) {
    if (filled[i]) continue;
    let before = i - 1;
    while (before >= 0 && !filled[before]) before -= 1;
    let after = i + 1;
    while (after < filled.length && !filled[after]) after += 1;
    if (before < 0 || after >= filled.length) continue;

    const a = filled[before] as LatLng;
    const b = filled[after] as LatLng;
    const t = (i - before) / (after - before);
    filled[i] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  let firstKnown = filled.findIndex(Boolean);
  if (firstKnown < 0) return filled;
  for (let i = 0; i < firstKnown; i += 1) filled[i] = filled[firstKnown];

  let lastKnown = filled.length - 1;
  while (lastKnown >= 0 && !filled[lastKnown]) lastKnown -= 1;
  for (let i = lastKnown + 1; i < filled.length; i += 1) filled[i] = filled[lastKnown];

  return filled;
}

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
    const existing = byId.get(row.conzoneId);
    if (existing) {
      // 속도 -1은 미수집을 뜻하므로 평균에서 제외한다.
      if (Number.isFinite(speed) && speed > 0) existing.speeds.push(speed);
      if (Number.isFinite(traffic)) existing.traffic.push(traffic);
      if (Number.isFinite(grade)) existing.grade = Math.max(existing.grade, grade);
    } else {
      byId.set(row.conzoneId, {
        row,
        speeds: Number.isFinite(speed) && speed > 0 ? [speed] : [],
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

/** 콘존명을 시점·종점으로 나눈다. 구분자는 '-' 또는 '~'. */
function splitConzoneName(name: string): readonly [string, string] {
  const parts = name.split(/[-~]/);
  return parts.length === 2 ? [parts[0], parts[1]] : ['', ''];
}

/** 실시간 콘존 행들을 지도에 그릴 수 있는 구간 목록으로 변환한다. */
export function buildSegments(rows: readonly RawConzone[]): readonly ConzoneSegment[] {
  const groups = new Map<string, AggregatedConzone[]>();
  for (const item of aggregate(rows)) {
    const key = `${item.row.routeNo}|${item.row.updownTypeCode}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const segments: ConzoneSegment[] = [];

  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((a, b) =>
      a.row.conzoneId.localeCompare(b.row.conzoneId),
    );

    // 노드 = 각 콘존의 시점 + 마지막 콘존의 종점
    const nodeNames = ordered.map((item) => splitConzoneName(item.row.conzoneName)[0]);
    const last = ordered[ordered.length - 1];
    nodeNames.push(splitConzoneName(last.row.conzoneName)[1]);

    const routeName = ordered[0].row.routeName;
    const known = resolveNodes(nodeNames, routeName);
    const hasRoadPath = ordered.some((item) => roadPaths[item.row.conzoneId]);
    if (known.filter(Boolean).length < 2 && !hasRoadPath) continue;

    const points = fillGaps(known);

    ordered.forEach((item, i) => {
      // 실제 도로 선형이 있으면 그것을 쓰고, 없을 때만 앵커 직선으로 대체한다.
      const road = roadPaths[item.row.conzoneId];
      const start = points[i];
      const end = points[i + 1];

      let path: readonly LatLng[];
      if (road && road.length >= 2) {
        path = road;
      } else {
        if (!start || !end) return;
        if (start[0] === end[0] && start[1] === end[1]) return;
        if (distanceKm(start, end) > MAX_SEGMENT_KM) return;
        path = [start, end];
      }

      segments.push({
        id: item.row.conzoneId,
        name: item.row.conzoneName,
        routeNo: item.row.routeNo,
        routeName: item.row.routeName,
        direction: item.row.updownTypeCode === 'E' ? 'E' : 'S',
        speed: item.speeds.length > 0 ? Math.round(mean(item.speeds)) : -1,
        traffic: Math.round(mean(item.traffic)),
        grade: item.grade,
        path,
      });
    });
  }

  return segments;
}
