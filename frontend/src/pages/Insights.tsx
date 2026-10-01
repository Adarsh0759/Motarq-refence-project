import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Wallet, Gauge, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import type { IdlingCost, Utilisation, RiskRanking } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatedNumber } from '@/components/AnimatedNumber';

const DAYS = [1, 7, 30];
const short = (v: string) => v.slice(-6);

export function Insights() {
  const [days, setDays] = useState(7);

  const { data: idle } = useQuery({ queryKey: ['idling-cost', days], queryFn: () => api<IdlingCost>(`/api/insights/idling-cost?days=${days}&limit=10`) });
  const { data: util } = useQuery({ queryKey: ['utilisation', days], queryFn: () => api<Utilisation>(`/api/insights/utilisation?days=${days}&limit=10`) });
  const { data: risk } = useQuery({ queryKey: ['risk'], queryFn: () => api<RiskRanking>('/api/insights/risk?limit=10') });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Insights</h1>
          <p className="text-sm text-muted-foreground">Idling cost, utilisation and breakdown risk.</p>
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            {DAYS.map((d) => (
              <TabsTrigger key={d} value={String(d)}>
                last {d}d
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              <Wallet className="h-3.5 w-3.5" /> Idling cost by vehicle, top 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!idle ? (
              <Skeleton className="h-60 w-full" />
            ) : (
              <>
                <div className="mb-4 text-[28px] font-extrabold tabular-nums">
                  <AnimatedNumber value={idle.total.cost_inr} prefix="₹" />
                  <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">
                    {idle.total.idle_hours} idle hours · {(idle.total.idle_ratio * 100).toFixed(1)}% of engine samples
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={idle.top_vehicles.map((v) => ({ vin: short(v.vin), cost: v.cost_inr }))}>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="vin" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12.5 }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                    <Bar dataKey="cost" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-3 text-xs text-muted-foreground">
                  Assumes {idle.assumptions.litres_per_idle_hour} L per idle hour at ₹{idle.assumptions.inr_per_litre}/L (configurable).
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Wallet className="h-3.5 w-3.5" /> Idling cost by fleet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fleet</TableHead>
                  <TableHead>Idle h</TableHead>
                  <TableHead>₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {idle?.by_fleet.map((f) => (
                  <TableRow key={f.fleet_id}>
                    <TableCell>{f.fleet_id}</TableCell>
                    <TableCell>{f.idle_hours}</TableCell>
                    <TableCell>{f.cost_inr}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Gauge className="h-3.5 w-3.5" /> Utilisation: distance driven, top 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>VIN</TableHead>
                  <TableHead>km</TableHead>
                  <TableHead>Active h</TableHead>
                  <TableHead>Max km/h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {util?.vehicles.map((v) => (
                  <TableRow key={v.vin}>
                    <TableCell className="font-mono text-xs">{v.vin}</TableCell>
                    <TableCell>{v.distance_km}</TableCell>
                    <TableCell>{v.active_hours}</TableCell>
                    <TableCell>{v.max_speed_kmh}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" /> Breakdown risk ranking
              </span>
              {risk && <span className="text-xs font-normal text-muted-foreground">{risk.source === 'ml' ? 'ML model' : 'rule fallback'}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>VIN</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risk?.vehicles.map((v) => (
                  <TableRow key={v.vin}>
                    <TableCell className="font-mono text-xs">{v.vin}</TableCell>
                    <TableCell>{(v.risk * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">Model trained on synthetic data; see docs/ml/results.md.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
