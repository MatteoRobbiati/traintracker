import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <div className="app-main muted">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
