/** 속도 기반 혼잡도 분류 및 지도 스타일 */

export type CongestionLevel = 'jam' | 'slow' | 'moderate' | 'free' | 'unknown';

export interface LevelStyle {
  readonly level: CongestionLevel;
  readonly label: string;
  readonly color: string;
  /** 속도 하한(km/h). unknown은 -Infinity. */
  readonly minSpeed: number;
}

export const LEVELS: readonly LevelStyle[] = [
  { level: 'free', label: '원활', color: '#22c55e', minSpeed: 80 },
  { level: 'moderate', label: '보통', color: '#eab308', minSpeed: 60 },
  { level: 'slow', label: '서행', color: '#f97316', minSpeed: 40 },
  { level: 'jam', label: '정체', color: '#ef4444', minSpeed: 0 },
  { level: 'unknown', label: '미수집', color: '#64748b', minSpeed: -Infinity },
];

const BY_LEVEL = new Map(LEVELS.map((l) => [l.level, l]));

export function levelForSpeed(speed: number): CongestionLevel {
  if (!Number.isFinite(speed) || speed <= 0) return 'unknown';
  if (speed >= 80) return 'free';
  if (speed >= 60) return 'moderate';
  if (speed >= 40) return 'slow';
  return 'jam';
}

export function styleForSpeed(speed: number): LevelStyle {
  return BY_LEVEL.get(levelForSpeed(speed)) ?? LEVELS[LEVELS.length - 1];
}

/** 정체일수록 굵게 그려 눈에 띄게 한다. */
export function weightForSpeed(speed: number, zoom: number): number {
  const base = zoom >= 10 ? 6 : zoom >= 8 ? 4 : 3;
  const level = levelForSpeed(speed);
  if (level === 'jam') return base + 2.5;
  if (level === 'slow') return base + 1.5;
  if (level === 'unknown') return Math.max(1.5, base - 1.5);
  return base;
}
