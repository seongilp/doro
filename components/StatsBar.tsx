'use client';

import type { ConzoneSegment, TrafficSummary } from '@/lib/types';
import { levelForSpeed } from '@/lib/traffic-style';

interface Props {
  readonly segments: readonly ConzoneSegment[];
  readonly summary: TrafficSummary | null;
}

function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR');
}

interface Stat {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: string;
}

export default function StatsBar({ segments, summary }: Props) {
  const measured = segments.filter((s) => s.speed > 0);
  const avgSpeed =
    measured.length > 0
      ? Math.round(measured.reduce((sum, s) => sum + s.speed, 0) / measured.length)
      : 0;
  const jamCount = measured.filter((s) => levelForSpeed(s.speed) === 'jam').length;
  const slowCount = measured.filter((s) => levelForSpeed(s.speed) === 'slow').length;

  const stats: readonly Stat[] = [
    {
      label: '전국 평균속도',
      value: `${avgSpeed} km/h`,
      hint: `${formatNumber(measured.length)}개 구간 관측`,
    },
    {
      label: '정체 구간',
      value: formatNumber(jamCount),
      hint: '40km/h 미만',
      tone: 'text-red-400',
    },
    {
      label: '서행 구간',
      value: formatNumber(slowCount),
      hint: '40~60km/h',
      tone: 'text-orange-400',
    },
    {
      label: '시간당 통행량',
      value: summary ? formatNumber(summary.total) : '—',
      hint: summary ? `${summary.sumDate.slice(4, 6)}/${summary.sumDate.slice(6, 8)} ${summary.sumTm}시 기준` : '집계 대기',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
        >
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</p>
          <p className={`text-lg font-semibold tabular-nums ${stat.tone ?? 'text-slate-100'}`}>
            {stat.value}
          </p>
          {stat.hint ? <p className="text-[11px] text-slate-500">{stat.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
