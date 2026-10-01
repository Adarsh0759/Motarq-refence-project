import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton-shimmer rounded-md bg-[length:200%_100%]', className)} {...props} />;
}

export { Skeleton };
