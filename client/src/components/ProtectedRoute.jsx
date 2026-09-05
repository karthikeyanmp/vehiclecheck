import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Frontend route gating is a convenience only — the real enforcement is
 * server-side (every API route checks role again). This just avoids
 * flashing a screen the user's role can't do anything with.
 */
export function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
