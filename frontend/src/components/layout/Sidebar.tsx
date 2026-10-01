import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Bell, BarChart3, PlugZap, ShieldCheck, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
];

export function Sidebar() {
  const { role, logout } = useAuth();

  return (
    <aside className="flex h-screen w-60 flex-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="relative flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-primary to-indigo-500 text-sm font-extrabold text-white shadow-lg shadow-primary/30">
          F
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">FleetNorm</div>
          <div className="text-[10px] text-muted-foreground">Fleet intelligence</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground',
                isActive && 'text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div layoutId="nav-active" className="absolute inset-0 rounded-lg bg-primary/15" transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }} />
                )}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        {role === 'admin' && (
          <NavLink
            to="/onboarding"
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground',
                isActive && 'text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div layoutId="nav-active" className="absolute inset-0 rounded-lg bg-primary/15" transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }} />
                )}
                <PlugZap className="relative z-10 h-4 w-4" />
                <span className="relative z-10">OEM Onboarding</span>
              </>
            )}
          </NavLink>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{role}</span>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
