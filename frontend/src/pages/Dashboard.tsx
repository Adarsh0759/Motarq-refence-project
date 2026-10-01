import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Truck, Zap, AlertTriangle, Wallet, Map as MapIcon, Bell } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import type { Summary, LiveVehicle, LiveAlertEvent } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KpiCard } from '@/components/KpiCard';
import { EmptyState } from '@/components/EmptyState';
import { formatRelativeTime } from '@/lib/utils';

export function Dashboard() {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [feed, setFeed] = useState<LiveAlertEvent[]>([]);

  const { data: summary } = useQuery({
    queryKey: ['summary'],
    queryFn: () => api<Summary>('/api/insights/summary'),
    refetchInterval: 2000,
  });

  const { data: live } = useQuery({
    queryKey: ['live-vehicles'],
    queryFn: () => api<{ data: LiveVehicle[] }>('/api/vehicles/live?limit=400'),
    refetchInterval: 2000,
  });

  useEffect(() => {
    const map = L.map('map-root', { zoomControl: true }).setView([13.0, 78.0], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 18 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!layerRef.current || !live?.data) return;
    layerRef.current.clearLayers();
    live.data.forEach((v) => {
      const color = v.engine_on ? (v.speed_kmh < 1 ? '#f59e0b' : '#22c55e') : '#64748b';
      L.circleMarker([v.lat, v.lon], { radius: 4, weight: 1.5, fillOpacity: 0.9, color, fillColor: color })
        .bindTooltip(`${v.vin} · ${Math.round(v.speed_kmh)} km/h`)
        .addTo(layerRef.current!);
    });
  }, [live]);

  useEffect(() => {
    const es = new EventSource(`/api/stream/alerts?token=${encodeURIComponent(getToken())}`);
    es.onmessage = (m) => setFeed((f) => [JSON.parse(m.data), ...f].slice(0, 12));
    return () => es.close();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live fleet telemetry, at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Truck} label="Active vehicles (2 min)" value={summary?.active_vehicles ?? null} />
        <KpiCard icon={Zap} label="Events / sec" value={summary?.events_per_sec ?? null} />
        <KpiCard icon={AlertTriangle} label="Open alerts" value={summary?.open_alerts ?? null} tone={summary && summary.open_alerts > 0 ? 'bad' : 'ok'} />
        <KpiCard icon={Wallet} label="Idle cost, 7 days" value={summary?.idle_cost_7d_inr ?? null} prefix="₹" tone="warn" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              <MapIcon className="h-3.5 w-3.5" /> Live fleet (latest 400)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[420px] overflow-hidden rounded-lg border border-border">
              <div id="map-root" />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> moving
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> idling
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#64748b]" /> engine off
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Bell className="h-3.5 w-3.5" /> Live alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {feed.length === 0 ? (
              <EmptyState icon={Bell} title="Waiting for alerts" hint="Idling, harsh-braking and DTC alerts stream in here in real time." />
            ) : (
              <ul className="space-y-0.5">
                <AnimatePresence initial={false}>
                  {feed.map((a) => (
                    <motion.li
                      key={a.alert_id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0"
                    >
                      <div className="flex items-center gap-2.5">
                        <Badge variant={a.severity}>{a.code}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{a.vin}</span>
                      </div>
                      <span className="flex-none text-[11px] text-muted-foreground">{formatRelativeTime(a.ts)}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
