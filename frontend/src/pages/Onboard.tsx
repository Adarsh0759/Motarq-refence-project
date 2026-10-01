import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, RefreshCw, CheckCircle2, AlertTriangle, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import type { OemMapping, MappingPreview, DlqSummary } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';

const MAP_E = {
  oem: 'E',
  fields: {
    vin: { path: 'chassis' },
    ts: { path: 'unixTime', format: 'epoch_ms' },
    lat: { path: 'coords.y' },
    lon: { path: 'coords.x' },
    speed_kmh: { path: 'kph', unit: 'kph' },
    odo_km: { path: 'odometer', unit: 'km' },
    fuel_pct: { path: 'fuel', scale: 100 },
    engine_on: { path: 'running', truthy: ['Y'] },
    rpm: { path: 'revs' },
    dtc: { path: 'dtcList' },
    evt: { path: 'event' },
    seq: { path: 'counter' },
  },
};
const SAMPLE_E = { chassis: '1HGCM82633A004352', unixTime: 1790000000000, coords: { y: 13.08, x: 80.27 }, kph: 64.2, odometer: 18234.7, fuel: 0.41, running: 'Y', revs: 2100, dtcList: ['P0301'], event: 'HARSH_BRAKE', counter: 88412 };

export function Onboard() {
  const qc = useQueryClient();
  const [mapping, setMapping] = useState(JSON.stringify(MAP_E, null, 2));
  const [payload, setPayload] = useState(JSON.stringify(SAMPLE_E, null, 2));
  const [preview, setPreview] = useState<MappingPreview | null>(null);

  const { data: list } = useQuery({ queryKey: ['oem-mappings'], queryFn: () => api<{ data: OemMapping[] }>('/api/admin/oem-mappings').then((r) => r.data), refetchInterval: 2000 });
  const { data: dlq } = useQuery({ queryKey: ['dlq'], queryFn: () => api<DlqSummary>('/api/admin/dlq'), refetchInterval: 2000 });

  const parse = (t: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(t);
    } catch {
      toast.error('Invalid JSON');
      return null;
    }
  };

  const doPreview = async () => {
    const m = parse(mapping);
    const p = parse(payload);
    if (!m || !p) return;
    try {
      setPreview(await api<MappingPreview>('/api/admin/oem-mappings/preview', { method: 'POST', body: { mapping: m, payload: p } }));
    } catch (e) {
      const data = (e as { data?: { issues?: unknown } })?.data;
      setPreview({ ok: false, reason: JSON.stringify(data?.issues ?? (e as Error).message) });
    }
  };

  const save = async () => {
    const m = parse(mapping);
    if (!m) return;
    try {
      const r = await api<{ oem: string; version: number }>('/api/admin/oem-mappings', { method: 'POST', body: m });
      toast.success(`Saved ${r.oem} v${r.version} (inactive)`);
      qc.invalidateQueries({ queryKey: ['oem-mappings'] });
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  };

  const activate = async (oem: string, v: number) => {
    await api(`/api/admin/oem-mappings/${oem}/activate/${v}`, { method: 'POST' });
    toast.success(`Activated ${oem} v${v} — processors reload instantly, no restart`);
    qc.invalidateQueries({ queryKey: ['oem-mappings'] });
  };

  const resetDlq = async () => {
    await api('/api/admin/dlq', { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['dlq'] });
  };

  const dlEntries = Object.entries(dlq?.counts ?? {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">OEM Onboarding</h1>
        <p className="text-sm text-muted-foreground">Add a new OEM wire format with no deploy, no restart.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="normal-case text-sm tracking-normal text-foreground">1. Mapping (JSON)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={20} value={mapping} onChange={(e) => setMapping(e.target.value)} spellCheck={false} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="normal-case text-sm tracking-normal text-foreground">2. Sample raw payload from the new OEM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={11} value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={doPreview}>
                <RefreshCw className="h-3.5 w-3.5" /> Preview normalisation
              </Button>
              <Button size="sm" onClick={save}>
                <Upload className="h-3.5 w-3.5" /> Save as new version
              </Button>
            </div>
            {preview && (
              <pre className={`overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed ${preview.ok ? 'border-success/20 bg-success/5 text-success' : 'border-destructive/20 bg-destructive/5 text-destructive'}`}>
                {JSON.stringify(preview.ok ? preview.event : preview.reason, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="normal-case text-sm tracking-normal text-foreground">Mapping versions</CardTitle>
          </CardHeader>
          <CardContent>
            {!list || list.length === 0 ? (
              <EmptyState icon={Inbox} title="No mappings yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OEM</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((m) => (
                    <TableRow key={`${m.oem}${m.version}`}>
                      <TableCell>{m.oem}</TableCell>
                      <TableCell>v{m.version}</TableCell>
                      <TableCell>{m.active ? <Badge variant="info">active</Badge> : <span className="text-muted-foreground">inactive</span>}</TableCell>
                      <TableCell>
                        {!m.active && (
                          <Button size="sm" variant="outline" onClick={() => activate(m.oem, m.version)}>
                            Activate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="normal-case text-sm tracking-normal text-foreground">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" /> Dead-letter counters (events rejected)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dlEntries.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="None" />
            ) : (
              <Table>
                <TableBody>
                  {dlEntries.map(([k, n]) => (
                    <TableRow key={k}>
                      <TableCell>{k}</TableCell>
                      <TableCell>{n.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Demo: events from OEM E land here as <b className="text-foreground">no_mapping</b> until you activate its mapping; the counter then stops growing.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={resetDlq}>
              <RefreshCw className="h-3.5 w-3.5" /> Reset counters
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
