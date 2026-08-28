'use client';

import { LEVELS, type CongestionLevel } from '@/lib/traffic-style';

export type DirectionFilter = 'all' | 'S' | 'E';

export interface Filters {
  readonly route: string;
  readonly direction: DirectionFilter;
  readonly levels: readonly CongestionLevel[];
  readonly query: string;
}

interface Props {
  readonly filters: Filters;
  readonly routes: readonly string[];
  readonly onChange: (next: Filters) => void;
}

const DIRECTIONS: readonly { value: DirectionFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'S', label: '상행' },
  { value: 'E', label: '하행' },
];

export default function FilterPanel({ filters, routes, onChange }: Props) {
  const toggleLevel = (level: CongestionLevel) => {
    const next = filters.levels.includes(level)
      ? filters.levels.filter((l) => l !== level)
      : [...filters.levels, level];
    onChange({ ...filters, levels: next });
  };

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
        placeholder="구간 검색 (예: 판교, 서울TG)"
        className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none"
      />

      <div className="flex gap-2">
        <select
          value={filters.route}
          onChange={(e) => onChange({ ...filters, route: e.target.value })}
          className="flex-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-2 text-sm text-slate-100 focus:border-sky-600 focus:outline-none"
        >
          <option value="all">전체 노선 ({routes.length})</option>
          {routes.map((route) => (
            <option key={route} value={route}>
              {route}
            </option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded-md border border-slate-800">
          {DIRECTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => onChange({ ...filters, direction: d.value })}
              className={`px-3 py-2 text-xs transition ${
                filters.direction === d.value
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LEVELS.map((level) => {
          const active = filters.levels.includes(level.level);
          return (
            <button
              key={level.level}
              type="button"
              onClick={() => toggleLevel(level.level)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                active
                  ? 'border-slate-600 bg-slate-800 text-slate-100'
                  : 'border-slate-800 bg-transparent text-slate-600'
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: level.color, opacity: active ? 1 : 0.35 }}
              />
              {level.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
