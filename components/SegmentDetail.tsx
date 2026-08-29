'use client';

import type { ConzoneStatus } from '@/lib/types';
import { styleForSpeed } from '@/lib/traffic-style';

interface Props {
  readonly segment: ConzoneStatus;
  readonly onClose: () => void;
}

export default function SegmentDetail({ segment, onClose }: Props) {
  const style = styleForSpeed(segment.speed);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{segment.name}</p>
          <p className="text-[11px] text-slate-500">
            {segment.routeName} ({segment.routeNo}) ·{' '}
            {segment.direction === 'S' ? '상행' : '하행'} · {segment.id}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          className="shrink-0 rounded px-1.5 text-slate-500 hover:text-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-slate-950/60 py-2">
          <p className="text-[10px] text-slate-500">평균속도</p>
          <p className="text-base font-semibold tabular-nums" style={{ color: style.color }}>
            {segment.speed > 0 ? segment.speed : '—'}
          </p>
        </div>
        <div className="rounded-md bg-slate-950/60 py-2">
          <p className="text-[10px] text-slate-500">소통상태</p>
          <p className="text-base font-semibold" style={{ color: style.color }}>
            {style.label}
          </p>
        </div>
        <div className="rounded-md bg-slate-950/60 py-2">
          <p className="text-[10px] text-slate-500">교통량</p>
          <p className="text-base font-semibold tabular-nums text-slate-200">
            {segment.traffic.toLocaleString('ko-KR')}
          </p>
        </div>
      </div>
    </div>
  );
}
