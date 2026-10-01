import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from '@/components/Sparkline';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useHistory } from '@/lib/useHistory';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: number | null;
  prefix?: string;
  delta?: ReactNode;
  gradient?: boolean;
  sparklineColor?: string;
}

export function KpiCard({ label, value, prefix, delta, gradient, sparklineColor }: KpiCardProps) {
  const history = useHistory(value, 24);

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
      <Card
        className={cn('flex flex-1 flex-col gap-3 border-0 p-5', gradient && 'bg-accent-gradient text-primary-foreground shadow-lg shadow-primary/20')}
      >
        <div className="flex items-center">
          <span className={cn('text-[13px] font-medium', gradient ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{label}</span>
          <span className="flex-1" />
          {delta}
        </div>
        <div className="flex items-end">
          {value === null ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <span className="text-[34px] font-bold leading-none tracking-tight tabular-nums">
              <AnimatedNumber value={value} prefix={prefix} />
            </span>
          )}
          <span className="flex-1" />
          <Sparkline data={history} color={sparklineColor ?? (gradient ? 'white' : 'hsl(var(--primary))')} />
        </div>
      </Card>
    </motion.div>
  );
}
