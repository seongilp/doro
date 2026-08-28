/**
 * 콘존(구간)에 실제 도로 선형을 입힌다.
 *
 * 도로공사 실시간 소통정보에는 좌표가 없고, 콘존은 "시점IC-종점IC" 이름으로만 식별된다.
 * IC/JC 위치를 앵커로 삼아 OpenStreetMap 고속도로 폴리라인 위에 스냅한 뒤,
 * 두 앵커 사이의 도로 조각을 잘라 콘존 경로로 저장한다.
 *
 * 사용법: node scripts/build-conzone-paths.mjs
 * 산출물: data/conzone-paths.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { osmNameForRoute } from './osm-routes.mjs';
import {
  cumulativeDistances,
  haversineKm,
  pointAt,
  simplify,
  slice,
  snapToPolyline,
} from './geo-util.mjs';

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, '.osm-cache');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const KOREA_BBOX = '33.0,124.5,38.7,131.9';

/** 앵커가 도로에서 이보다 멀리 떨어져 있으면 잘못된 매칭으로 본다. */
const MAX_SNAP_KM = 3;
/** 차로(컴포넌트)를 바꿀 때 물리는 비용(km 환산). 잦은 차로 전환을 억제한다. */
const SWITCH_PENALTY_KM = 4;
/** 콘존 하나가 이보다 길면 앵커 배치가 어긋난 것으로 보고 버린다. */
const MAX_SPAN_KM = 40;
/** 폴리라인 단순화 허용 오차(약 20m). */
const SIMPLIFY_TOLERANCE_KM = 0.02;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function cachedFetch(name, loader) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, name);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const data = await loader();
  await writeFile(file, JSON.stringify(data));
  return data;
}

async function overpass(query) {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'text/plain' },
  });
  if (!response.ok) throw new Error(`Overpass 응답 오류: HTTP ${response.status}`);
  return response.json();
}

async function loadConzones() {
  return cachedFetch('conzone.json', async () => {
    const key = process.env.EX_API_KEY;
    if (!key) throw new Error('EX_API_KEY가 필요합니다 (.env.local 참고).');
    const url = `https://data.ex.co.kr/openapi/odtraffic/trafficAmountByRealtime?key=${key}&type=json&numOfRows=10000&pageNo=1`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`도로공사 응답 오류: HTTP ${response.status}`);
    return response.json();
  });
}

const loadWays = () =>
  cachedFetch('ways.json', () =>
    overpass(
      `[out:json][timeout:600];way["highway"="motorway"]["name"~"고속도로"](${KOREA_BBOX});out geom qt;`,
    ),
  );

const loadJunctions = () =>
  cachedFetch('junctions.json', () =>
    overpass(
      `[out:json][timeout:300];node["highway"="motorway_junction"](${KOREA_BBOX});out body qt;`,
    ),
  );

/**
 * 시설 종류별 접미사. "노포IC"와 "노포JC"는 수백 m 떨어진 서로 다른 지점이라
 * 접미사를 통째로 떼면 같은 앵커로 붙어버린다. 종류를 남겨 구분한다.
 */
const FACILITY_SUFFIXES = [
  [/(IC|나들목)$/, 'IC'],
  [/(JCT|JC|분기점)$/, 'JC'],
  [/(TG|영업소)$/, 'TG'],
  [/(Hi)$/, 'HI'],
  [/(교차로)$/, 'IC'],
];

function cleanName(name) {
  return name.replace(/\s/g, '').replace(/하이패스/g, 'Hi').replace(/본선$/, '');
}

/** "서영천하이패스IC" → "서영천Hi#IC" (시설 종류를 남긴 정밀 키) */
function facilityKey(name) {
  const clean = cleanName(name);
  for (const [pattern, tag] of FACILITY_SUFFIXES) {
    if (pattern.test(clean)) return `${clean.replace(pattern, '')}#${tag}`;
  }
  return `${clean}#`;
}

/** "서영천하이패스IC" → "서영천" (접미사를 모두 뗀 느슨한 키) */
function baseKey(name) {
  return cleanName(name).replace(/(IC|JC|JCT|TG|Hi|분기점|나들목|교차로|영업소)+$/g, '');
}

/**
 * 앵커 색인을 만든다.
 * 정밀 키(시설 종류 포함)와 느슨한 키(이름만)를 모두 넣고, 조회할 때 정밀 → 느슨 순으로 찾는다.
 */
function buildAnchorIndex(units, junctions) {
  const index = new Map();
  const add = (key, point) => {
    if (key && !index.has(key)) index.set(key, point);
  };

  // OSM 분기점 노드는 이름에 IC/JC가 붙어 있어 정밀 키를 만들 수 있다.
  for (const node of junctions.elements) {
    const name = node.tags?.name ?? node.tags?.['name:ko'];
    if (!name) continue;
    add(facilityKey(name), [node.lat, node.lon]);
  }

  // 도로공사 영업소 목록은 접미사가 없어 느슨한 키로만 쓴다. 대신 노선까지 맞출 수 있다.
  for (const unit of units) {
    if (unit.yValue == null || unit.xValue == null) continue;
    const lat = Number(unit.yValue);
    const lng = Number(unit.xValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = baseKey(unit.unitName);
    index.set(`${key}@${unit.routeName}`, [lat, lng]);
    add(key, [lat, lng]);
  }

  for (const node of junctions.elements) {
    const name = node.tags?.name ?? node.tags?.['name:ko'];
    if (name) add(baseKey(name), [node.lat, node.lon]);
  }

  return index;
}

/** 정밀 키 → 노선 일치 → 느슨한 키 순으로 앵커를 찾는다. */
function findAnchor(anchors, name, routeName) {
  return (
    anchors.get(facilityKey(name)) ??
    anchors.get(`${baseKey(name)}@${routeName}`) ??
    anchors.get(baseKey(name)) ??
    null
  );
}

/** 노드 id를 공유하는 way들을 이어 붙여 연속된 폴리라인(컴포넌트)으로 만든다. */
function stitchWays(ways) {
  const remaining = new Map(ways.map((way) => [way.id, way]));
  const byEndpoint = new Map();
  const register = (nodeId, wayId) => {
    const list = byEndpoint.get(nodeId);
    if (list) list.push(wayId);
    else byEndpoint.set(nodeId, [wayId]);
  };
  for (const way of ways) {
    register(way.nodes[0], way.id);
    register(way.nodes[way.nodes.length - 1], way.id);
  }

  const findNext = (nodeId, usedId) => {
    for (const candidateId of byEndpoint.get(nodeId) ?? []) {
      if (candidateId === usedId) continue;
      const candidate = remaining.get(candidateId);
      if (candidate) return candidate;
    }
    return null;
  };

  const components = [];

  while (remaining.size > 0) {
    const seed = remaining.values().next().value;
    remaining.delete(seed.id);

    let nodes = [...seed.nodes];
    let points = seed.geometry.map((g) => [g.lat, g.lon]);

    // 앞쪽으로 확장
    for (;;) {
      const next = findNext(nodes[nodes.length - 1], null);
      if (!next) break;
      remaining.delete(next.id);
      const forward = next.nodes[0] === nodes[nodes.length - 1];
      const nextNodes = forward ? next.nodes : [...next.nodes].reverse();
      const nextPoints = next.geometry.map((g) => [g.lat, g.lon]);
      nodes = nodes.concat(nextNodes.slice(1));
      points = points.concat((forward ? nextPoints : nextPoints.reverse()).slice(1));
    }

    // 뒤쪽으로 확장
    for (;;) {
      const prev = findNext(nodes[0], null);
      if (!prev) break;
      remaining.delete(prev.id);
      const forward = prev.nodes[prev.nodes.length - 1] === nodes[0];
      const prevNodes = forward ? prev.nodes : [...prev.nodes].reverse();
      const prevPoints = prev.geometry.map((g) => [g.lat, g.lon]);
      nodes = prevNodes.slice(0, -1).concat(nodes);
      points = (forward ? prevPoints : prevPoints.reverse()).slice(0, -1).concat(points);
    }

    if (points.length >= 2) {
      const cum = cumulativeDistances(points);
      components.push({
        points,
        cum,
        length: cum[cum.length - 1],
        closed: haversineKm(points[0], points[points.length - 1]) < 0.5,
      });
    }
  }

  return components.sort((a, b) => b.length - a.length);
}

function buildRouteIndex(waysJson) {
  const byName = new Map();
  for (const way of waysJson.elements) {
    const name = way.tags?.name;
    if (!name || !way.geometry || !way.nodes) continue;
    for (const part of name.split(';')) {
      const list = byName.get(part);
      if (list) list.push(way);
      else byName.set(part, [way]);
    }
  }
  const routes = new Map();
  for (const [name, ways] of byName) {
    routes.set(name, stitchWays(ways));
  }
  return routes;
}

/** 닫힌 노선(순환선)에서는 짧은 쪽 호를 고른다. */
function sliceComponent(component, from, to) {
  const { points, cum, length, closed } = component;
  if (!closed) return slice(points, cum, from, to);

  const direct = Math.abs(to - from);
  if (direct <= length - direct) return slice(points, cum, from, to);

  // 시작점을 지나 반대로 돌아가는 조각
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const head = slice(points, cum, high, length);
  const tail = slice(points, cum, 0, low);
  const wrapped = head.concat(tail.slice(1));
  return from === high ? wrapped : wrapped.reverse();
}

/** 앵커를 각 컴포넌트에 스냅해 후보 목록을 만든다. */
function snapCandidates(components, point) {
  const candidates = new Map();
  for (let i = 0; i < components.length; i += 1) {
    const hit = snapToPolyline(point, components[i].points, components[i].cum);
    if (hit && hit.distKm <= MAX_SNAP_KM) {
      candidates.set(i, { componentIndex: i, along: hit.along, distKm: hit.distKm });
    }
  }
  return candidates;
}

/**
 * 노선 순서를 따라 컴포넌트를 배정한다.
 *
 * IC 앵커는 상·하행 차로 사이에 찍혀 있어 "가장 가까운 컴포넌트"만 고르면
 * 구간마다 차로가 번갈아 잡힌다. 스냅 거리(km)를 관측 비용, 차로 변경을
 * SWITCH_PENALTY_KM 비용으로 두고 Viterbi로 전체 비용이 최소인 배정을 찾는다.
 */
function assignComponents(candidateList) {
  const states = new Set();
  for (const candidates of candidateList) {
    for (const index of candidates.keys()) states.add(index);
  }
  if (states.size === 0) return candidateList.map(() => null);
  const stateList = [...states];

  const emission = (candidates, state) => {
    if (candidates.size === 0) return 0; // 앵커가 없는 노드는 관측 비용 없음
    const hit = candidates.get(state);
    return hit ? hit.distKm : MAX_SNAP_KM * 2;
  };

  let cost = stateList.map((state) => emission(candidateList[0], state));
  const back = [];

  for (let i = 1; i < candidateList.length; i += 1) {
    const nextCost = [];
    const choice = [];
    for (let s = 0; s < stateList.length; s += 1) {
      let bestCost = Infinity;
      let bestPrev = 0;
      for (let p = 0; p < stateList.length; p += 1) {
        const transition = p === s ? 0 : SWITCH_PENALTY_KM;
        const total = cost[p] + transition;
        if (total < bestCost) {
          bestCost = total;
          bestPrev = p;
        }
      }
      nextCost.push(bestCost + emission(candidateList[i], stateList[s]));
      choice.push(bestPrev);
    }
    cost = nextCost;
    back.push(choice);
  }

  let current = cost.indexOf(Math.min(...cost));
  const assigned = new Array(candidateList.length);
  for (let i = candidateList.length - 1; i >= 0; i -= 1) {
    assigned[i] = stateList[current];
    if (i > 0) current = back[i - 1][current];
  }

  return assigned.map((state, i) => {
    const hit = candidateList[i].get(state);
    return hit ? { componentIndex: state, along: hit.along } : null;
  });
}

/** 콘존명을 시점·종점으로 나눈다. 구분자는 '-' 또는 '~'. */
function splitConzoneName(name) {
  const parts = name.split(/[-~]/);
  return parts.length === 2 ? parts : null;
}

async function main() {
  const [unitsRaw, waysJson, junctionsJson, conzoneJson] = await Promise.all([
    readFile(join(ROOT, 'data/units.json'), 'utf8'),
    loadWays(),
    loadJunctions(),
    loadConzones(),
  ]);

  const units = JSON.parse(unitsRaw);
  const anchors = buildAnchorIndex(units, junctionsJson);
  const routes = buildRouteIndex(waysJson);

  const conzones = [...new Map(conzoneJson.list.map((r) => [r.conzoneId, r])).values()];

  // 노선+방향별로 콘존 순번대로 정렬한다.
  const groups = new Map();
  for (const zone of conzones) {
    const key = `${zone.routeNo}|${zone.updownTypeCode}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(zone);
    else groups.set(key, [zone]);
  }

  const paths = {};
  const stats = {
    total: conzones.length,
    onRoad: 0,
    noRoute: 0,
    noAnchor: 0,
    crossComponent: 0,
    degenerate: 0,
    tooLong: 0,
    unresolved: 0,
  };
  const missingRoutes = new Set();

  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((a, b) => a.conzoneId.localeCompare(b.conzoneId));
    const routeName = ordered[0].routeName;
    const components = routes.get(osmNameForRoute(routeName));

    if (!components || components.length === 0) {
      missingRoutes.add(routeName);
      stats.noRoute += ordered.length;
      continue;
    }

    // 콘존 체인이 중간에 끊기는 노선이 있어, 각 콘존의 시점·종점을 그대로 나열한다.
    // (이웃 콘존이 끝점을 공유한다고 가정하면 끊긴 지점에서 엉뚱한 구간이 만들어진다.)
    const nodeNames = ordered.flatMap((zone) => {
      const parts = splitConzoneName(zone.conzoneName);
      return parts ? [parts[0], parts[1]] : ['', ''];
    });

    const candidateList = nodeNames.map((name) => {
      if (!name) return new Map();
      const point = findAnchor(anchors, name, routeName);
      return point ? snapCandidates(components, point) : new Map();
    });

    const snapped = assignComponents(candidateList);

    if (snapped.every((hit) => hit === null)) {
      stats.noAnchor += ordered.length;
      continue;
    }

    // 좌표를 모르는 노드는, 같은 컴포넌트에 얹힌 이웃 앵커 사이에서
    // 주행거리로 보간한다. 컴포넌트가 다르면 보간하지 않는다.
    for (let i = 0; i < snapped.length; i += 1) {
      if (snapped[i]) continue;
      let before = i - 1;
      while (before >= 0 && !snapped[before]) before -= 1;
      let after = i + 1;
      while (after < snapped.length && !snapped[after]) after += 1;
      if (before < 0 || after >= snapped.length) continue;
      if (snapped[before].componentIndex !== snapped[after].componentIndex) continue;
      const t = (i - before) / (after - before);
      snapped[i] = {
        componentIndex: snapped[before].componentIndex,
        along: snapped[before].along + (snapped[after].along - snapped[before].along) * t,
      };
    }

    // 시퀀스 양 끝의 빈 노드는 이웃 두 앵커의 간격을 이어서 외삽한다.
    const extrapolate = (indices, knownA, knownB) => {
      const slope =
        (snapped[knownB].along - snapped[knownA].along) / (knownB - knownA);
      const component = components[snapped[knownA].componentIndex];
      for (const i of indices) {
        const along = snapped[knownA].along + slope * (i - knownA);
        snapped[i] = {
          componentIndex: snapped[knownA].componentIndex,
          along: Math.max(0, Math.min(component.length, along)),
        };
      }
    };

    const knownIndices = snapped
      .map((hit, i) => (hit ? i : -1))
      .filter((i) => i >= 0);

    if (knownIndices.length >= 2) {
      const [first, second] = knownIndices;
      const last = knownIndices[knownIndices.length - 1];
      const secondLast = knownIndices[knownIndices.length - 2];

      if (first > 0 && snapped[first].componentIndex === snapped[second].componentIndex) {
        extrapolate(
          Array.from({ length: first }, (_, i) => i).reverse(),
          first,
          second,
        );
      }
      if (
        last < snapped.length - 1 &&
        snapped[last].componentIndex === snapped[secondLast].componentIndex
      ) {
        extrapolate(
          Array.from({ length: snapped.length - 1 - last }, (_, i) => last + 1 + i),
          secondLast,
          last,
        );
      }
    }

    ordered.forEach((zone, i) => {
      const from = snapped[i * 2];
      const to = snapped[i * 2 + 1];
      if (!from || !to) {
        stats.unresolved += 1;
        return;
      }
      // 노선이 OSM에서 여러 조각으로 나뉘어 있으면 걸친 구간은 건너뛴다.
      if (from.componentIndex !== to.componentIndex) {
        stats.crossComponent += 1;
        return;
      }
      const spanKm = Math.abs(to.along - from.along);
      // 외삽이 어긋나면 비정상적으로 긴 구간이 나온다. 그런 결과는 버린다.
      if (spanKm < 0.05) {
        stats.degenerate += 1;
        return;
      }
      if (spanKm > MAX_SPAN_KM) {
        stats.tooLong += 1;
        return;
      }

      const component = components[from.componentIndex];
      const path = simplify(
        sliceComponent(component, from.along, to.along),
        SIMPLIFY_TOLERANCE_KM,
      );
      if (path.length < 2) return;

      paths[zone.conzoneId] = path.map(([lat, lng]) => [
        Number(lat.toFixed(5)),
        Number(lng.toFixed(5)),
      ]);
      stats.onRoad += 1;
    });
  }

  await writeFile(join(ROOT, 'data/conzone-paths.json'), JSON.stringify(paths));

  const pointCount = Object.values(paths).reduce((sum, p) => sum + p.length, 0);
  console.log('콘존', stats.total);
  console.log('도로 선형 적용', stats.onRoad, `(${((100 * stats.onRoad) / stats.total).toFixed(1)}%)`);
  console.log(
    '탈락 —',
    '노선 미매칭', stats.noRoute,
    '| 앵커 없음', stats.noAnchor,
    '| 노드 미해결', stats.unresolved,
    '| 컴포넌트 불일치', stats.crossComponent,
    '| 길이 0', stats.degenerate,
    '| 과다 길이', stats.tooLong,
  );
  console.log('평균 점 개수', (pointCount / Math.max(stats.onRoad, 1)).toFixed(1));
  if (missingRoutes.size > 0) {
    console.log('OSM에서 못 찾은 노선:', [...missingRoutes].join(', '));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
