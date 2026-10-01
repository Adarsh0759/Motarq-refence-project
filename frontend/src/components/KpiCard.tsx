import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'bad' | 'warn' | 'ok';

const toneStyles: Record<Tone, string> = {
  default: 'bg-primary/15 text-primary',
  bad: 'bg-destructive/15 text-destructive',
  warn: 'bg-warning/15 text-warning',
  ok: 'bg-success/15 text-success',
};

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  prefix?: string;
  hint?: string;
  tone?: Tone;
}

export function KpiCard({ icon: Icon, label, value, prefix, hint, tone = 'default' }: KpiCardProps) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
      <Card className="relative overflow-hidden p-5">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary to-transparent opacity-80" />
        <div className={cn('mb-3 flex h-8 w-8 items-center justify-center rounded-lg', toneStyles[tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        {value === null ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums">
            <AnimatedNumber value={value} prefix={prefix} />
          </div>
        )}
        {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
      </Card>
    </motion.div>
  );
}
