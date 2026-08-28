'use client';

import type { SummaryBucket, TrafficSummary } from '@/lib/types';

interface Props {
  readonly summary: TrafficSummary | null;
}

function Bars({ buckets, total }: { readonly buckets: readonly SummaryBucket[]; readonly total: number }) {
  return (
    <ul className="space-y-1">
      {buckets.map((bucket) => {
        const ratio = total > 0 ? bucket.amount / total : 0;
        return (
          <li key={bucket.label} className="space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span className="truncate text-slate-400">{bucket.label}</span>
              <span className="tabular-nums text-slate-500">
                {bucket.amount.toLocaleString('ko-KR')} ({Math.round(ratio * 100)}%)
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${Math.max(ratio * 100, 1)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function SummaryBreakdown({ summary }: Props) {
  if (!summary) {
    return <p className="text-xs text-slate-600">전국 통행량 집계를 불러오는 중…</p>;
  }

  return (
    <div className="space-y-3">
      <section>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">수납 방식</p>
        <Bars buckets={summary.byTcs} total={summary.total} />
      </section>
      <section>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">운영 주체</p>
        <Bars buckets={summary.byOperator} total={summary.total} />
      </section>
      <section>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">차종</p>
        <Bars buckets={summary.byCarType} total={summary.total} />
      </section>
    </div>
  );
}
