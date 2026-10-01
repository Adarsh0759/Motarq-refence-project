import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[11px] font-semibold transition-colors', {
  variants: {
    variant: {
      default: 'bg-primary/15 text-primary',
      critical: 'bg-destructive/15 text-destructive',
      warning: 'bg-warning/15 text-warning',
      info: 'bg-info/15 text-info',
      success: 'bg-success/15 text-success',
      neutral: 'bg-muted text-muted-foreground',
      secondary: 'border border-border bg-secondary text-secondary-foreground',
      outline: 'border border-border text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
