import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onUnauthorized } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Reviews requests, manages users and roles. */
  isController: boolean;
  /** Gate staff: read-only access to all requests. */
  isAccessAdmin: boolean;
  /** Controller or Access Admin. */
  canViewAll: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: User | null }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // A 401 anywhere means the session ended (logged out elsewhere or disabled).
    onUnauthorized(() => setUser(null));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const data = await api.post<{ user: User }>('/api/auth/login', { email, password, remember });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user, loading, login, logout, refresh, setUser,
      isController: user?.role === 'access_controller',
      isAccessAdmin: user?.role === 'access_admin',
      canViewAll: user?.role === 'access_controller' || user?.role === 'access_admin',
    }),
    [user, loading, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
