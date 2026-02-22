import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

type MapPoint = {
  label: string;
  lat: number;
  lon: number;
  popup: string;
};

type LocationMapProps = {
  client: MapPoint;
  office: MapPoint;
  className?: string;
};

const mapIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
  }, [map, points]);
  return null;
}

export function LocationMap({ client, office, className }: LocationMapProps) {
  const [tileError, setTileError] = useState(false);
  const points = useMemo(() => [client, office], [client, office]);

  return (
    <div className={className}>
      {tileError ? (
        <div className="h-60 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-muted))] flex items-center justify-center text-sm text-[rgb(var(--color-muted-foreground))]">
          Map unavailable
        </div>
      ) : (
        <MapContainer
          center={[client.lat, client.lon]}
          zoom={11}
          className="h-60 w-full rounded-lg border border-[rgb(var(--color-border))] overflow-hidden"
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
            eventHandlers={{
              tileerror: () => setTileError(true),
            }}
          />
          <FitBounds points={points} />
          <Marker position={[client.lat, client.lon]} icon={mapIcon}>
            <Popup>{client.popup}</Popup>
          </Marker>
          <Marker position={[office.lat, office.lon]} icon={mapIcon}>
            <Popup>{office.popup}</Popup>
          </Marker>
          <Polyline
            positions={[
              [client.lat, client.lon],
              [office.lat, office.lon],
            ]}
            pathOptions={{ color: 'rgb(99, 102, 241)', weight: 3, opacity: 0.7 }}
          />
        </MapContainer>
      )}
    </div>
  );
}
