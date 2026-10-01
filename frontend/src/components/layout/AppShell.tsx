import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-8 py-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
