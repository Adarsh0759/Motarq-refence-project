import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Inbox, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { AlertsPage, AlertStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';

const STATUSES: AlertStatus[] = ['open', 'ack', 'closed'];

export function Alerts() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<AlertStatus>('open');
  const [cursor, setCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<AlertsPage['data']>([]);

  const { isLoading } = useQuery({
    queryKey: ['alerts', status],
    queryFn: async () => {
      const r = await api<AlertsPage>(`/api/alerts?status=${status}&limit=25`);
      setRows(r.data);
      setCursor(r.next_cursor);
      return r;
    },
  });

  const loadMore = async () => {
    if (!cursor) return;
    const r = await api<AlertsPage>(`/api/alerts?status=${status}&limit=25&cursor=${cursor}`);
    setRows((p) => [...p, ...r.data]);
    setCursor(r.next_cursor);
  };

  const ack = useMutation({
    mutationFn: (id: number) => api(`/api/alerts/${id}/ack`, { method: 'POST' }),
    onSuccess: (_d, id) => {
      setRows((p) => p.filter((x) => x.alert_id !== id));
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (e) => toast.error(e instanceof ApiError && e.status === 403 ? 'Your role cannot acknowledge alerts' : 'Failed to acknowledge'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Alerts</h1>
        <p className="text-sm text-muted-foreground">Idling, harsh-braking, DTC and anomaly alerts across your fleet.</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="normal-case text-sm text-foreground tracking-normal">Alert queue</CardTitle>
          <Tabs value={status} onValueChange={(v) => setStatus(v as AlertStatus)}>
            <TabsList>
              {STATUSES.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Inbox} title={`No ${status} alerts`} hint="Nothing to show for this status right now." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>VIN</TableHead>
                    <TableHead>Raised</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                    <TableRow key={a.alert_id}>
                      <TableCell className="text-muted-foreground">{a.alert_id}</TableCell>
                      <TableCell>
                        <Badge variant={a.severity}>{a.severity}</Badge>
                      </TableCell>
                      <TableCell>{a.code}</TableCell>
                      <TableCell className="font-mono text-xs">{a.vin}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(a.raised_at).toLocaleString()}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{JSON.stringify(a.detail)}</TableCell>
                      <TableCell>
                        {status === 'open' && role !== 'viewer' && (
                          <Button size="sm" variant="outline" onClick={() => ack.mutate(a.alert_id)} disabled={ack.isPending}>
                            {ack.isPending && ack.variables === a.alert_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Ack
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {cursor && (
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={loadMore}>
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
