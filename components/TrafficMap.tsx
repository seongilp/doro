'use client';

import { useEffect, useState } from 'react';
import {
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { ConzoneSegment } from '@/lib/types';
import { styleForSpeed, weightForSpeed } from '@/lib/traffic-style';
import 'leaflet/dist/leaflet.css';

const KOREA_CENTER: [number, number] = [36.4, 127.9];
const INITIAL_ZOOM = 7;

interface Props {
  readonly segments: readonly ConzoneSegment[];
  readonly selectedId: string | null;
  readonly onSelect: (segment: ConzoneSegment) => void;
  /** 목록에서 고른 구간으로 지도를 이동시킨다. */
  readonly focus: ConzoneSegment | null;
}

function FocusFlyer({ focus }: { readonly focus: ConzoneSegment | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus || focus.path.length === 0) return;
    const [lat, lng] = focus.path[0];
    map.flyTo([lat, lng], Math.max(map.getZoom(), 11), { duration: 0.8 });
  }, [focus, map]);
  return null;
}

function ZoomWatcher({ onZoom }: { readonly onZoom: (zoom: number) => void }) {
  useMapEvents({ zoomend: (event) => onZoom(event.target.getZoom()) });
  return null;
}

export default function TrafficMap({ segments, selectedId, onSelect, focus }: Props) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

  return (
    <MapContainer
      center={KOREA_CENTER}
      zoom={INITIAL_ZOOM}
      minZoom={6}
      maxZoom={15}
      className="h-full w-full bg-slate-950"
      preferCanvas
      zoomControl={false}
    >
      <ZoomWatcher onZoom={setZoom} />
      <FocusFlyer focus={focus} />
      {/* OpenStreetMap 표준 타일. 다크 톤은 CSS 필터(.leaflet-tile-pane)로 입힌다. */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      {segments.map((segment) => {
        const style = styleForSpeed(segment.speed);
        const selected = segment.id === selectedId;
        return (
          <Polyline
            key={`${segment.id}-${segment.direction}`}
            positions={segment.path as [number, number][]}
            pathOptions={{
              color: selected ? '#ffffff' : style.color,
              weight: weightForSpeed(segment.speed, zoom) + (selected ? 4 : 0),
              opacity: selected ? 1 : 0.85,
              lineCap: 'round',
            }}
            eventHandlers={{ click: () => onSelect(segment) }}
          >
            <Tooltip sticky className="!bg-slate-900 !text-slate-100 !border-slate-700">
              <span className="font-semibold">{segment.name}</span>
              <br />
              {segment.routeName} · {segment.direction === 'S' ? '상행' : '하행'}
              <br />
              {segment.speed > 0 ? `${segment.speed} km/h · ${style.label}` : '속도 미수집'}
            </Tooltip>
          </Polyline>
        );
      })}
    </MapContainer>
  );
}
