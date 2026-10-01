import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors before:h-1.5 before:w-1.5 before:rounded-full before:bg-current',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        critical: 'border-destructive/20 bg-destructive/15 text-destructive',
        warning: 'border-warning/20 bg-warning/15 text-warning',
        info: 'border-primary/20 bg-primary/15 text-primary',
        success: 'border-success/20 bg-success/15 text-success',
        secondary: 'border-border bg-secondary text-secondary-foreground before:hidden',
        outline: 'border-border text-foreground before:hidden',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
