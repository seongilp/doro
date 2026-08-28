/** 위경도 기하 유틸. 국내 범위에서는 평면 근사로 충분하다. */

const EARTH_RADIUS_KM = 6371;
const DEG_TO_KM = (Math.PI / 180) * EARTH_RADIUS_KM;

/** 위도에 따른 경도 축소를 반영한 평면 좌표(km). */
export function toPlane([lat, lng], refLat) {
  return [lng * DEG_TO_KM * Math.cos((refLat * Math.PI) / 180), lat * DEG_TO_KM];
}

export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** 폴리라인의 누적 거리(km) 배열. */
export function cumulativeDistances(points) {
  const acc = [0];
  for (let i = 1; i < points.length; i += 1) {
    acc.push(acc[i - 1] + haversineKm(points[i - 1], points[i]));
  }
  return acc;
}

/** 점 p에서 선분 ab에 내린 수선의 발과 거리(km). */
function projectOnSegment(p, a, b) {
  const refLat = a[0];
  const [px, py] = toPlane(p, refLat);
  const [ax, ay] = toPlane(a, refLat);
  const [bx, by] = toPlane(b, refLat);
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  return { t, distKm: Math.hypot(px - qx, py - qy) };
}

/** 폴리라인 위에서 점 p에 가장 가까운 위치를 찾는다. */
export function snapToPolyline(p, points, cum) {
  let best = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const { t, distKm } = projectOnSegment(p, points[i], points[i + 1]);
    if (best && distKm >= best.distKm) continue;
    const along = cum[i] + (cum[i + 1] - cum[i]) * t;
    best = { distKm, along };
  }
  return best;
}

/** 누적 거리 d 위치의 좌표. */
export function pointAt(points, cum, d) {
  const total = cum[cum.length - 1];
  const clamped = Math.max(0, Math.min(total, d));
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= clamped) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const t = span === 0 ? 0 : (clamped - cum[lo]) / span;
  return [
    points[lo][0] + (points[hi][0] - points[lo][0]) * t,
    points[lo][1] + (points[hi][1] - points[lo][1]) * t,
  ];
}

/** 누적 거리 a→b 사이의 폴리라인 조각. */
export function slice(points, cum, a, b) {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  const out = [pointAt(points, cum, from)];
  for (let i = 0; i < points.length; i += 1) {
    if (cum[i] > from && cum[i] < to) out.push(points[i]);
  }
  out.push(pointAt(points, cum, to));
  return a <= b ? out : out.reverse();
}

/** Douglas-Peucker 단순화 (tolerance: km). */
export function simplify(points, toleranceKm) {
  if (points.length < 3) return points;
  const refLat = points[0][0];
  const plane = points.map((p) => toPlane(p, refLat));

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop();
    const [ax, ay] = plane[start];
    const [bx, by] = plane[end];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let farthest = -1;
    let maxDist = toleranceKm;
    for (let i = start + 1; i < end; i += 1) {
      const [px, py] = plane[i];
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const dist = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      if (dist > maxDist) {
        maxDist = dist;
        farthest = i;
      }
    }

    if (farthest > 0) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }

  return points.filter((_, i) => keep[i]);
}
