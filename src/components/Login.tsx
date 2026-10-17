import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const ok = await login(username, password);

    setSubmitting(false);
    if (!ok) setError("Invalid username or password.");
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="app-brand-mark">DT</div>
          <div>
            <h1>UAV Engine Digital Twin</h1>
            <span>Sign in to continue</span>
          </div>
        </div>

        <label>
          Username
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>

        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>

        <p className="login-hint">
          First run? Default account: <code>admin / admin123</code> — change this before your demo.
        </p>
      </form>
    </div>
  );
}