import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { signUp, session } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signUp(email, password, name);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    // If email confirmation is on, there's no session yet — send them to
    // login with a note instead of straight to the dashboard.
    setDone(true);
    setTimeout(() => navigate("/login"), 1500);
  }

  return (
    <div className="app-main" style={{ maxWidth: 380, marginTop: 60 }}>
      <p className="eyebrow">TrainTrack</p>
      <h1>Sign up</h1>
      {done ? (
        <p className="panel">Account created — check your email if confirmation is required, then log in.</p>
      ) : (
        <form className="form-grid panel" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>
      )}
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
