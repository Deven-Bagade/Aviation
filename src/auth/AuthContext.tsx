import React, { createContext, useContext, useEffect, useState } from "react";
import {
  AuthUser,
  getCurrentSession,
  login as loginRequest,
  logout as logoutRequest,
  Role,
  hasAtLeastRole
} from "./authStore";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  can: (minRole: Role) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentSession().then((session) => {
      setUser(session);
      setLoading(false);
    });
  }, []);

  const login = async (username: string, password: string) => {
    const result = await loginRequest(username, password);
    setUser(result);
    return result !== null;
  };

  const logout = () => {
    logoutRequest();
    setUser(null);
  };

  const can = (minRole: Role) => hasAtLeastRole(user, minRole);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}