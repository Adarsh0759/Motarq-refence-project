import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { LogoMark } from '@/components/Logo';

export function Login() {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState('admin@fleetnorm.dev');
  const [password, setPassword] = useState('Admin@123');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 429 ? 'Too many attempts — wait a minute and try again' : 'Invalid credentials');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-5">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[500px] rounded-full bg-violet-500/10 blur-[100px]" />
      </div>

      <button
        onClick={toggle}
        className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="relative z-10 w-full max-w-sm">
        <Card className="p-8 shadow-2xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4">
              <LogoMark size={48} />
            </div>
            <h1 className="text-xl font-bold">FleetNorm</h1>
            <p className="mt-1 text-sm text-muted-foreground">Multi-OEM fleet telemetry intelligence</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.dev" autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <Button className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
            {err && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 flex-none" /> {err}
              </motion.p>
            )}
          </form>

          <div className="mt-6 border-t border-border pt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            Demo tenant &middot; admin@fleetnorm.dev / Admin@123
            <br />
            viewer@fleetnorm.dev / Viewer@123
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
