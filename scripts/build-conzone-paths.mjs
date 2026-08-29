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
import { osmNamesForRoute } from './osm-routes.mjs';
import {
  cumulativeDistances,
  haversineKm,
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
/** 끝점 앵커를 못 찾았을 때 관측 비용 대신 쓰는 값. */
const MISSING_ANCHOR_KM = 1.5;
/** 콘존 하나가 이보다 길면 앵커 배치가 어긋난 것으로 보고 버린다. */
const MAX_SPAN_KM = 40;
/** 이보다 짧은 도로 조각은 노선 선형으로 쓰지 않는다. */
const MIN_COMPONENT_KM = 0.3;
/** 도로 선형을 못 얻었을 때 직선으로 대체할 수 있는 최대 길이. */
const MAX_STRAIGHT_KM = 25;

/** 파일 크기를 줄이려고 좌표를 소수 5자리로 자른다(약 1m). */
const round = (path) =>
  path.map(([lat, lng]) => [Number(lat.toFixed(5)), Number(lng.toFixed(5))]);
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

/**
 * 이름이 붙은 자동차전용도로 전체.
 * "…고속도로"만 받으면 신월여의지하도로처럼 trunk로 태깅된 노선이 빠진다.
 * 램프(motorway_link)는 스티칭을 헝클어뜨리므로 제외한다.
 */
const loadWays = () =>
  cachedFetch('named-ways.json', () =>
    overpass(
      `[out:json][timeout:600];way["highway"~"^(motorway|motorway_link|trunk)$"]["name"](${KOREA_BBOX});out geom qt;`,
    ),
  );

/**
 * 1차 조회에서 앵커를 못 찾은 이름만 OSM에서 직접 찾는다.
 *
 * 터널·지하차도·교량 같은 VDS 기준점은 OSM에 이름만 붙은 노드로 들어가 있어
 * 태그로는 걸러낼 수 없다. 그래서 필요한 이름을 알고 나서 이름으로 조회한다.
 */
async function loadNamedPoints(names) {
  if (names.length === 0) return { elements: [] };
  const key = `named-${names.length}.json`;
  return cachedFetch(key, () => {
    const pattern = names
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    return overpass(
      `[out:json][timeout:300];(node["name"~"^(${pattern})$"](${KOREA_BBOX});way["name"~"^(${pattern})$"](${KOREA_BBOX}););out center qt;`,
    );
  });
}

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
  return name
    .replace(/\s/g, '')
    // 도로공사는 "창원1터널(동측)", OSM은 "창원1터널 동측"으로 적는다.
    .replace(/[()]/g, '')
    .replace(/하이패스/g, 'Hi')
    .replace(/본선$/, '');
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
 * OSM 표기 차이를 흡수한 이름 후보들.
 * "남용인(원삼)" → "남용인", "서김포·통진" → "서김포", "통진" 처럼
 * 괄호 보충 설명과 병기 표기를 풀어 준다.
 */
function nameVariants(name) {
  const variants = new Set([name]);
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
  if (withoutParens) variants.add(withoutParens);
  for (const variant of [...variants]) {
    for (const part of variant.split(/[·・]/)) {
      const trimmed = part.trim();
      if (trimmed) variants.add(trimmed);
    }
  }
  return [...variants];
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
    for (const variant of nameVariants(name)) {
      add(facilityKey(variant), [node.lat, node.lon]);
    }
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
    if (!name) continue;
    for (const variant of nameVariants(name)) add(baseKey(variant), [node.lat, node.lon]);
  }

  return index;
}

/** 이름으로 찾아온 노드·way를 앵커 색인에 보탠다. */
function addNamedPoints(index, elements) {
  for (const element of elements) {
    const name = element.tags?.name ?? element.tags?.['name:ko'];
    if (!name) continue;
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!isInKorea(lat, lon)) continue;
    for (const key of [facilityKey(name), baseKey(name)]) {
      if (key && !index.has(key)) index.set(key, [lat, lon]);
    }
  }
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
      // 길이가 없는 조각(램프 흔적 등)은 스냅을 가로채므로 버린다.
      const length = cum[cum.length - 1];
      if (length >= MIN_COMPONENT_KM) {
        components.push({
          points,
          cum,
          length,
          closed: haversineKm(points[0], points[points.length - 1]) < 0.5,
        });
      }
    }
  }

  return components.sort((a, b) => b.length - a.length);
}

/**
 * 도로 이름별 way 묶음. 스티칭은 실제로 필요한 노선에 대해서만 한다
 * (이름 붙은 도로가 5만 개가 넘어 전부 이어 붙이면 낭비다).
 */
function buildRouteIndex(waysJson) {
  const byName = new Map();
  for (const way of waysJson.elements) {
    const name = way.tags?.name;
    if (!name || !way.geometry || !way.nodes) continue;
    if (way.tags.highway === 'motorway_link') continue;
    for (const part of name.split(';')) {
      const list = byName.get(part);
      if (list) list.push(way);
      else byName.set(part, [way]);
    }
  }

  const cache = new Map();
  return {
    names: [...byName.keys()],
    componentsFor(name) {
      if (!cache.has(name)) {
        const ways = byName.get(name);
        cache.set(name, ways ? stitchWays(ways) : []);
      }
      return cache.get(name);
    },
  };
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
 * 콘존마다 어느 도로 조각(컴포넌트) 위에 놓을지 정한다.
 *
 * 콘존 하나는 반드시 한 조각 위에 있어야 하므로 배정 단위는 노드가 아니라 콘존이다.
 * IC 앵커는 상·하행 차로 사이에 찍혀 있어 "가장 가까운 조각"만 고르면 콘존마다
 * 차로가 번갈아 잡힌다. 그래서 스냅 거리를 관측 비용, 조각 변경을
 * SWITCH_PENALTY_KM 비용으로 두고 Viterbi로 전체 비용이 최소인 배정을 찾는다.
 */
function assignComponents(pairs) {
  const states = new Set();
  for (const [from, to] of pairs) {
    for (const index of from.keys()) states.add(index);
    for (const index of to.keys()) states.add(index);
  }
  if (states.size === 0) return pairs.map(() => null);
  const stateList = [...states];

  const emission = ([from, to], state) => {
    if (from.size === 0 && to.size === 0) return 0; // 앵커가 없으면 정보 없음
    const a = from.size === 0 ? MISSING_ANCHOR_KM : (from.get(state)?.distKm ?? MAX_SNAP_KM * 2);
    const b = to.size === 0 ? MISSING_ANCHOR_KM : (to.get(state)?.distKm ?? MAX_SNAP_KM * 2);
    return a + b;
  };

  let cost = stateList.map((state) => emission(pairs[0], state));
  const back = [];

  for (let i = 1; i < pairs.length; i += 1) {
    const nextCost = [];
    const choice = [];
    for (let s = 0; s < stateList.length; s += 1) {
      let bestCost = Infinity;
      let bestPrev = 0;
      for (let p = 0; p < stateList.length; p += 1) {
        const total = cost[p] + (p === s ? 0 : SWITCH_PENALTY_KM);
        if (total < bestCost) {
          bestCost = total;
          bestPrev = p;
        }
      }
      nextCost.push(bestCost + emission(pairs[i], stateList[s]));
      choice.push(bestPrev);
    }
    cost = nextCost;
    back.push(choice);
  }

  let current = cost.indexOf(Math.min(...cost));
  const assigned = new Array(pairs.length);
  for (let i = pairs.length - 1; i >= 0; i -= 1) {
    assigned[i] = stateList[current];
    if (i > 0) current = back[i - 1][current];
  }
  return assigned;
}

/** 콘존명을 시점·종점으로 나눈다. 구분자는 '-' 또는 '~'. */
function splitConzoneName(name) {
  const parts = name.split(/[-~]/).map((part) => part.trim());
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

  // 1차 색인에 없는 끝점 이름을 모아 OSM에서 이름으로 직접 찾아 보탠다.
  const unresolved = new Set();
  for (const row of conzoneJson.list) {
    for (const name of splitConzoneName(row.conzoneName) ?? []) {
      if (!name) continue;
      if (!anchors.has(facilityKey(name)) && !anchors.has(baseKey(name))) {
        unresolved.add(name);
      }
    }
  }
  if (unresolved.size > 0) {
    // 선택적 보강이다. Overpass가 막히면 건너뛰고 나머지로 진행한다.
    try {
      const found = await loadNamedPoints([...unresolved]);
      addNamedPoints(anchors, found.elements ?? []);
    } catch (error) {
      console.log('이름 조회 건너뜀:', error.message);
    }
    const stillMissing = [...unresolved].filter(
      (n) => !anchors.has(facilityKey(n)) && !anchors.has(baseKey(n)),
    );
    console.log(
      `끝점 이름 ${unresolved.size}개 미해결 → ${unresolved.size - stillMissing.length}개 보강`,
    );
    if (stillMissing.length > 0) {
      console.log('  못 찾음:', stillMissing.slice(0, 10).join(', '));
    }
  }

  const routes = buildRouteIndex(waysJson);

  const routeNames = routes.names;
  const conzones = [...new Map(conzoneJson.list.map((r) => [r.conzoneId, r])).values()];

  // 노선+방향별로 콘존 순번대로 정렬한다.
  const groups = new Map();
  for (const zone of conzones) {
    const key = `${zone.routeNo}|${zone.updownTypeCode}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(zone);
    else groups.set(key, [zone]);
  }

  const roads = {};
  const straight = {};
  const stats = {
    total: conzones.length,
    onRoad: 0,
    noRoute: 0,
    noAnchor: 0,
    crossComponent: 0,
    degenerate: 0,
    tooLong: 0,
    unresolved: 0,
    straight: 0,
  };
  const missingRoutes = new Set();

  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((a, b) => a.conzoneId.localeCompare(b.conzoneId));
    const routeName = ordered[0].routeName;
    const components = osmNamesForRoute(routeName, routeNames).flatMap((name) =>
      routes.componentsFor(name),
    );

    if (components.length === 0) {
      missingRoutes.add(routeName);
      stats.noRoute += ordered.length;
      continue;
    }

    // 콘존마다 시점·종점 앵커를 각 도로 조각에 스냅해 후보를 만든다.
    const pairs = ordered.map((zone) => {
      const parts = splitConzoneName(zone.conzoneName) ?? ['', ''];
      return parts.map((name) => {
        if (!name) return new Map();
        const point = findAnchor(anchors, name, routeName);
        return point ? snapCandidates(components, point) : new Map();
      });
    });

    const assigned = assignComponents(pairs);
    if (assigned.every((c) => c === null)) {
      stats.noAnchor += ordered.length;
      continue;
    }

    // 배정된 조각 위에서의 주행거리. 앵커가 없는 끝점은 null로 남긴다.
    const along = pairs.flatMap(([from, to], i) => [
      from.get(assigned[i])?.along ?? null,
      to.get(assigned[i])?.along ?? null,
    ]);
    const componentOf = (i) => assigned[Math.floor(i / 2)];

    // 같은 조각에 얹힌 이웃 앵커 사이에서 주행거리로 보간한다.
    for (let i = 0; i < along.length; i += 1) {
      if (along[i] != null) continue;
      let before = i - 1;
      while (before >= 0 && along[before] == null) before -= 1;
      let after = i + 1;
      while (after < along.length && along[after] == null) after += 1;
      if (before < 0 || after >= along.length) continue;
      if (componentOf(before) !== componentOf(i) || componentOf(after) !== componentOf(i)) continue;
      const t = (i - before) / (after - before);
      along[i] = along[before] + (along[after] - along[before]) * t;
    }

    // 시퀀스 양 끝의 빈 값은 이웃 두 앵커의 간격을 이어서 외삽한다.
    const known = along.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
    if (known.length >= 2) {
      const extrapolate = (indices, a, b) => {
        const slope = (along[b] - along[a]) / (b - a);
        for (const i of indices) {
          if (componentOf(i) !== componentOf(a)) continue;
          const component = components[componentOf(a)];
          along[i] = Math.max(0, Math.min(component.length, along[a] + slope * (i - a)));
        }
      };
      const [first, second] = known;
      const last = known[known.length - 1];
      const secondLast = known[known.length - 2];
      if (first > 0) {
        extrapolate(Array.from({ length: first }, (_, i) => first - 1 - i), first, second);
      }
      if (last < along.length - 1) {
        extrapolate(
          Array.from({ length: along.length - 1 - last }, (_, i) => last + 1 + i),
          secondLast,
          last,
        );
      }
    }

    const snapped = along.map((value, i) =>
      value == null ? null : { componentIndex: componentOf(i), along: value },
    );

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

      roads[zone.conzoneId] = round(path);
      stats.onRoad += 1;
    });

    // 도로 선형을 못 만든 콘존은, 양 끝 앵커가 모두 실제로 확인될 때만 직선으로 남긴다.
    // (보간한 좌표로 직선을 그으면 실제와 수십 km 어긋난 선이 생긴다.)
    ordered.forEach((zone) => {
      if (roads[zone.conzoneId]) return;
      const [startName, endName] = splitConzoneName(zone.conzoneName) ?? ['', ''];
      const a = startName ? findAnchor(anchors, startName, routeName) : null;
      const b = endName ? findAnchor(anchors, endName, routeName) : null;
      if (!a || !b) return;
      const span = haversineKm(a, b);
      if (span < 0.05 || span > MAX_STRAIGHT_KM) return;
      straight[zone.conzoneId] = round([a, b]);
      stats.straight += 1;
    });
  }

  await writeFile(
    join(ROOT, 'data/conzone-paths.json'),
    JSON.stringify({ roads, straight }),
  );

  // 콘존 이름·노선은 매분 바뀌지 않는다. 좌표와 마찬가지로 정적 파일로 빼서
  // 불변 청크에 실으면, 실시간 응답은 속도·교통량·등급만 실어 나르면 된다.
  const drawable = new Set([...Object.keys(roads), ...Object.keys(straight)]);
  const routeList = [];
  const routeIndex = new Map();
  const entries = conzones
    .filter((zone) => drawable.has(zone.conzoneId))
    .sort((a, b) => a.conzoneId.localeCompare(b.conzoneId))
    .map((zone) => {
      const key = `${zone.routeName}|${zone.routeNo}`;
      let route = routeIndex.get(key);
      if (route === undefined) {
        route = routeList.push([zone.routeName, zone.routeNo]) - 1;
        routeIndex.set(key, route);
      }
      return [zone.conzoneId, zone.conzoneName, route, zone.updownTypeCode === 'E' ? 1 : 0];
    });

  await writeFile(
    join(ROOT, 'data/conzone-index.json'),
    JSON.stringify({ routes: routeList, conzones: entries }),
  );
  console.log('정적 색인', entries.length, '콘존 /', routeList.length, '노선');

  const pointCount = Object.values(roads).reduce((sum, p) => sum + p.length, 0);
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
  console.log('직선 대체', stats.straight);
  console.log('평균 점 개수', (pointCount / Math.max(stats.onRoad, 1)).toFixed(1));
  if (missingRoutes.size > 0) {
    console.log('OSM에서 못 찾은 노선:', [...missingRoutes].join(', '));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
