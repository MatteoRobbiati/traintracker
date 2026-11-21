import { useState, type FormEvent } from "react";
import { LogoMark } from "../components/icons";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { signIn, session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError(error);
    else navigate("/");
  }

  return (
    <div className="auth-wrap page">
      <div className="auth-card">
      <span className="brand-mark">
        <LogoMark width={22} height={22} />
      </span>
      <h1>Log in</h1>
      <p className="muted" style={{ marginBottom: 20 }}>Welcome back. Time to train.</p>
      <form className="form-grid panel" onSubmit={handleSubmit}>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="primary lg" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16 }}>
        No account yet? <Link to="/signup">Sign up</Link>
      </p>
      </div>
    </div>
  );
}
