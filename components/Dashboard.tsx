'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import CongestionList from '@/components/CongestionList';
import FilterPanel, { type Filters } from '@/components/FilterPanel';
import SegmentDetail from '@/components/SegmentDetail';
import StatsBar from '@/components/StatsBar';
import SummaryBreakdown from '@/components/SummaryBreakdown';
import { LEVELS, levelForSpeed } from '@/lib/traffic-style';
import type { ConzoneSegment, TrafficSnapshot, TrafficSummary } from '@/lib/types';
import { usePollingResource } from '@/lib/use-polling-resource';

const TrafficMap = dynamic(() => import('@/components/TrafficMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-600">
      지도를 불러오는 중…
    </div>
  ),
});

const TRAFFIC_INTERVAL_MS = 60_000;
const SUMMARY_INTERVAL_MS = 300_000;

interface Props {
  /** 서버에서 미리 채워 보낸 첫 스냅숏. 첫 화면이 빈 지도로 뜨지 않게 한다. */
  readonly initialSnapshot: TrafficSnapshot | null;
  readonly initialSummary: TrafficSummary | null;
}

const INITIAL_FILTERS: Filters = {
  route: 'all',
  direction: 'all',
  levels: LEVELS.map((l) => l.level),
  query: '',
};

type Tab = 'ranking' | 'stats';

export default function Dashboard({ initialSnapshot, initialSummary }: Props) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [selected, setSelected] = useState<ConzoneSegment | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tab, setTab] = useState<Tab>('ranking');

  const traffic = usePollingResource<TrafficSnapshot>('/api/traffic', {
    intervalMs: TRAFFIC_INTERVAL_MS,
    enabled: autoRefresh,
    initialData: initialSnapshot,
  });
  const summary = usePollingResource<TrafficSummary>('/api/summary', {
    intervalMs: SUMMARY_INTERVAL_MS,
    enabled: autoRefresh,
    initialData: initialSummary,
  });

  const segments = useMemo(() => traffic.data?.segments ?? [], [traffic.data]);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return segments.filter((segment) => {
      if (filters.route !== 'all' && segment.routeName !== filters.route) return false;
      if (filters.direction !== 'all' && segment.direction !== filters.direction) return false;
      if (!filters.levels.includes(levelForSpeed(segment.speed))) return false;
      if (query && !`${segment.name} ${segment.routeName}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [segments, filters]);

  const updatedLabel = traffic.data
    ? `${traffic.data.stdHour.slice(0, 2)}:${traffic.data.stdHour.slice(2, 4)} 기준`
    : '—';

  return (
    <main className="flex h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">
            전국 실시간 교통량 <span className="text-sky-500">DORO</span>
          </h1>
          <p className="text-[11px] text-slate-500">
            한국도로공사 공공데이터 · OpenStreetMap · {updatedLabel} ·{' '}
            {filtered.length.toLocaleString('ko-KR')} / {segments.length.toLocaleString('ko-KR')} 구간
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-sky-500"
            />
            자동 갱신 (1분)
          </label>
          <button
            type="button"
            onClick={() => {
              traffic.refresh();
              summary.refresh();
            }}
            disabled={traffic.loading}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-600 hover:text-sky-400 disabled:opacity-50"
          >
            {traffic.loading ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {traffic.error ? (
        <p className="border-b border-red-900 bg-red-950/60 px-4 py-2 text-xs text-red-300">
          실시간 소통정보를 불러오지 못했습니다 — {traffic.error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-slate-800 p-3 lg:w-96 lg:border-r">
          <StatsBar segments={filtered} summary={summary.data} />
          <FilterPanel
            filters={filters}
            routes={traffic.data?.routes ?? []}
            onChange={setFilters}
          />

          {selected ? (
            <SegmentDetail segment={selected} onClose={() => setSelected(null)} />
          ) : null}

          <div className="flex gap-1 border-b border-slate-800">
            {(
              [
                ['ranking', '정체 순위'],
                ['stats', '통행량 집계'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-xs transition ${
                  tab === value
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'ranking' ? (
            <CongestionList
              segments={filtered}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              loading={traffic.loading && segments.length === 0}
            />
          ) : (
            <SummaryBreakdown summary={summary.data} />
          )}
        </aside>

        <section className="relative min-h-[55dvh] flex-1">
          <TrafficMap
            segments={filtered}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            focus={selected}
          />
          <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] rounded-lg border border-slate-700 bg-slate-900/85 px-3 py-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">소통 상태</p>
            <ul className="flex gap-3">
              {LEVELS.map((level) => (
                <li key={level.level} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <span
                    className="h-1.5 w-4 rounded-full"
                    style={{ backgroundColor: level.color }}
                  />
                  {level.label}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
