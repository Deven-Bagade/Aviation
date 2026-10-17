import React from "react";
import { useAuth } from "../auth/AuthContext";
import Login from "./Login";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="login-screen">Loading…</div>;
  if (!user) return <Login />;

  return <>{children}</>;
}