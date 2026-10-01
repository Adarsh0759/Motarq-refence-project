import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Map as MapIcon, Bell, Wallet } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import type { Summary, LiveVehicle, LiveAlertEvent, IdlingCost } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KpiCard } from '@/components/KpiCard';
import { EmptyState } from '@/components/EmptyState';
import { useHistory } from '@/lib/useHistory';
import { formatRelativeTime, cn } from '@/lib/utils';

function trendDelta(history: number[], invert = false): { label: string; variant: 'success' | 'critical' | 'neutral' } {
  if (history.length < 2) return { label: '—', variant: 'neutral' };
  const [first] = history;
  const last = history[history.length - 1];
  if (first === 0) return { label: 'steady', variant: 'neutral' };
  const pct = ((last - first) / Math.abs(first)) * 100;
  if (Math.abs(pct) < 1) return { label: 'steady', variant: 'neutral' };
  const up = pct > 0;
  const good = invert ? !up : up;
  return { label: `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`, variant: good ? 'success' : 'critical' };
}

const SEVERITY_DOT: Record<string, string> = { critical: 'bg-destructive', warning: 'bg-warning', info: 'bg-info' };

export function Dashboard() {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [feed, setFeed] = useState<LiveAlertEvent[]>([]);

  const { data: summary } = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/api/insights/summary'), refetchInterval: 2000 });
  const { data: live } = useQuery({ queryKey: ['live-vehicles'], queryFn: () => api<{ data: LiveVehicle[] }>('/api/vehicles/live?limit=400'), refetchInterval: 2000 });
  const { data: idle } = useQuery({ queryKey: ['idling-cost', 7], queryFn: () => api<IdlingCost>('/api/insights/idling-cost?days=7&limit=5') });

  const vehiclesHist = useHistory(summary?.active_vehicles, 24);
  const epsHist = useHistory(summary?.events_per_sec, 24);
  const alertsHist = useHistory(summary?.open_alerts, 24);
  const costHist = useHistory(summary?.idle_cost_7d_inr, 24);

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
    es.onmessage = (m) => setFeed((f) => [JSON.parse(m.data), ...f].slice(0, 5));
    return () => es.close();
  }, []);

  const maxFleetCost = Math.max(1, ...(idle?.by_fleet.map((f) => f.cost_inr) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Overview</h1>
          <p className="text-[13px] text-muted-foreground">Real-time fleet health across all OEMs</p>
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px] font-medium shadow-sm">All fleets</div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px] font-medium shadow-sm">Last 7 days</div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active vehicles" value={summary?.active_vehicles ?? null} delta={<Badge variant={trendDelta(vehiclesHist).variant}>{trendDelta(vehiclesHist).label}</Badge>} />
        <KpiCard label="Events / sec" value={summary?.events_per_sec ?? null} delta={<Badge variant={trendDelta(epsHist).variant}>{trendDelta(epsHist).label}</Badge>} />
        <KpiCard label="Open alerts" value={summary?.open_alerts ?? null} delta={<Badge variant={trendDelta(alertsHist, true).variant}>{trendDelta(alertsHist, true).label}</Badge>} />
        <KpiCard
          label="Idle cost · 7 days"
          value={summary?.idle_cost_7d_inr ?? null}
          prefix="₹"
          gradient
          delta={
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">{trendDelta(costHist, true).label}</span>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="flex flex-col gap-3.5 border-0 bg-map-card p-5 text-map-card-foreground">
          <div className="flex items-center gap-3">
            <CardTitle className="text-white">
              <MapIcon className="h-4 w-4 text-slate-400" /> Live fleet
            </CardTitle>
            <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live
            </span>
            <span className="flex-1" />
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Moving
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Idling
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#64748b]" /> Off
              </span>
            </div>
          </div>
          <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl">
            <div id="map-root" />
            <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur">
              Showing latest 400 vehicles
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Live alerts</CardTitle>
              <Badge variant="neutral">{summary?.open_alerts ?? 0} open</Badge>
              <span className="flex-1" />
            </CardHeader>
            <CardContent className="pt-0">
              {feed.length === 0 ? (
                <EmptyState icon={Bell} title="Waiting for alerts" hint="New alerts stream in here in real time." />
              ) : (
                <ul>
                  <AnimatePresence initial={false}>
                    {feed.map((a) => (
                      <motion.li
                        key={a.alert_id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-start gap-3 border-b border-border py-2.5 last:border-0"
                      >
                        <span className={cn('mt-1.5 h-2 w-2 flex-none rounded-full', SEVERITY_DOT[a.severity])} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">{a.code.replace(/_/g, ' ').toLowerCase()}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">{a.vin}</p>
                        </div>
                        <div className="flex flex-none flex-col items-end gap-1">
                          <Badge variant={a.severity}>{a.severity}</Badge>
                          <span className="text-[11px] text-muted-foreground">{formatRelativeTime(a.ts)}</span>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" /> Idling cost by fleet
              </CardTitle>
              <span className="flex-1" />
              <span className="text-xs text-muted-foreground">₹ · 7 days</span>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {!idle ? (
                <EmptyState icon={Wallet} title="Loading…" />
              ) : (
                idle.by_fleet.slice(0, 4).map((f) => (
                  <div key={f.fleet_id} className="space-y-1.5">
                    <div className="flex items-center text-[13px]">
                      <span className="font-medium text-foreground/80">Fleet {f.fleet_id}</span>
                      <span className="flex-1" />
                      <span className="font-semibold">₹{f.cost_inr.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent-gradient" style={{ width: `${(f.cost_inr / maxFleetCost) * 100}%` }} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
