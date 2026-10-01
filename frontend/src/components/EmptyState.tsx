import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon className="h-7 w-7 text-muted-foreground/40" />
      <div className="text-sm font-semibold text-muted-foreground">{title}</div>
      {hint && <div className="max-w-[260px] text-xs text-muted-foreground/70">{hint}</div>}
    </div>
  );
}
