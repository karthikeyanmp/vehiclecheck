import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const LINKS_BY_ROLE = {
  registrar: [
    { to: '/registrar/new', label: 'New Registration' },
    { to: '/registrar', label: 'My Registrations' },
  ],
  gate_scanner: [{ to: '/gate', label: 'Scan Gate' }],
  district_scanner: [{ to: '/district-checkpoint', label: 'District Checkpoint' }],
  admin: [
    { to: '/admin', label: 'Dashboard' },
    { to: '/admin/registrations', label: 'Registrations' },
    { to: '/admin/registrations/new', label: 'New Registration' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/master-data', label: 'Master Data' },
  ],
};

export function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <nav className="nav">
      <span className="nav-brand">
        <img src="/police-logo.jpg" alt="Tamil Nadu Police" />
        Vehicle Permit — Emmanuel Sekaran Day
      </span>
      <div className="nav-links">
        {(LINKS_BY_ROLE[user.role] || []).map((l) => (
          <NavLink key={l.to} to={l.to} end className={({ isActive }) => (isActive ? 'active' : undefined)}>
            {l.label}
          </NavLink>
        ))}
      </div>
      <div className="nav-user">
        <span>{user.fullName} ({user.role})</span>
        <button onClick={() => { logout(); navigate('/login'); }}>Log out</button>
      </div>
    </nav>
  );
}
