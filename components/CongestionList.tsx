'use client';

import type { ConzoneSegment } from '@/lib/types';
import { styleForSpeed } from '@/lib/traffic-style';

interface Props {
  readonly segments: readonly ConzoneSegment[];
  readonly selectedId: string | null;
  readonly onSelect: (segment: ConzoneSegment) => void;
}

const MAX_ITEMS = 40;

export default function CongestionList({ segments, selectedId, onSelect }: Props) {
  const ranked = [...segments]
    .filter((s) => s.speed > 0)
    .sort((a, b) => a.speed - b.speed)
    .slice(0, MAX_ITEMS);

  if (ranked.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-slate-600">
        조건에 맞는 구간이 없습니다.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {ranked.map((segment, index) => {
        const style = styleForSpeed(segment.speed);
        const selected = segment.id === selectedId;
        return (
          <li key={`${segment.id}-${segment.direction}`}>
            <button
              type="button"
              onClick={() => onSelect(segment)}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                selected
                  ? 'border-sky-600 bg-sky-950/50'
                  : 'border-transparent hover:border-slate-800 hover:bg-slate-900/60'
              }`}
            >
              <span className="w-5 text-right text-xs tabular-nums text-slate-600">
                {index + 1}
              </span>
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: style.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-200">{segment.name}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {segment.routeName} · {segment.direction === 'S' ? '상행' : '하행'}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span
                  className="block text-sm font-semibold tabular-nums"
                  style={{ color: style.color }}
                >
                  {segment.speed}
                </span>
                <span className="block text-[10px] text-slate-600">km/h</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
