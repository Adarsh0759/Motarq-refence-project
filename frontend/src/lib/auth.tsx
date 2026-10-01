import React, { createContext, useContext, useState, useCallback } from 'react';
import { api, getToken, setToken } from '@/lib/api';
import type { LoginResponse, Role } from '@/lib/types';

interface AuthState {
  authed: boolean;
  role: Role;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(!!getToken());
  const [role, setRole] = useState<Role>((localStorage.getItem('fn_role') as Role) || 'viewer');

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
    setToken(r.access_token);
    localStorage.setItem('fn_role', r.role);
    setRole(r.role);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    setToken('');
    localStorage.removeItem('fn_role');
    setAuthed(false);
  }, []);

  return <AuthContext.Provider value={{ authed, role, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
