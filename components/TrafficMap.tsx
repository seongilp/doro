'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { conzonePaths } from '@/lib/conzone-paths';
import { styleForSpeed, weightForSpeed } from '@/lib/traffic-style';
import type { ConzoneStatus, LatLng } from '@/lib/types';
import 'leaflet/dist/leaflet.css';

const KOREA_CENTER: [number, number] = [36.4, 127.9];
const INITIAL_ZOOM = 7;

interface Props {
  readonly conzones: readonly ConzoneStatus[];
  readonly selectedId: string | null;
  readonly onSelect: (conzone: ConzoneStatus) => void;
}

function ZoomWatcher({ onZoom }: { readonly onZoom: (zoom: number) => void }) {
  useMapEvents({ zoomend: (event) => onZoom(event.target.getZoom()) });
  return null;
}

function FocusFlyer({ target }: { readonly target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target[0], target[1]], Math.max(map.getZoom(), 11), { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function TrafficMap({ conzones, selectedId, onSelect }: Props) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

  // 선택된 구간의 시작점. 목록에서 고르면 지도를 그쪽으로 옮긴다.
  const focus = useMemo(() => {
    const path = selectedId ? conzonePaths[selectedId] : null;
    return path && path.length > 0 ? path[0] : null;
  }, [selectedId]);

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
      <FocusFlyer target={focus} />
      {/* OpenStreetMap 표준 타일. 다크 톤은 CSS 필터(.leaflet-tile-pane)로 입힌다. */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      {conzones.map((conzone) => {
        const path = conzonePaths[conzone.id];
        if (!path) return null;

        const style = styleForSpeed(conzone.speed);
        const selected = conzone.id === selectedId;
        return (
          <Polyline
            key={conzone.id}
            positions={path as [number, number][]}
            pathOptions={{
              color: selected ? '#ffffff' : style.color,
              weight: weightForSpeed(conzone.speed, zoom) + (selected ? 4 : 0),
              opacity: selected ? 1 : 0.85,
              lineCap: 'round',
            }}
            eventHandlers={{ click: () => onSelect(conzone) }}
          >
            <Tooltip sticky className="!bg-slate-900 !text-slate-100 !border-slate-700">
              <span className="font-semibold">{conzone.name}</span>
              <br />
              {conzone.routeName} · {conzone.direction === 'S' ? '상행' : '하행'}
              <br />
              {conzone.speed > 0 ? `${conzone.speed} km/h · ${style.label}` : '속도 미수집'}
            </Tooltip>
          </Polyline>
        );
      })}
    </MapContainer>
  );
}
