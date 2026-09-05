import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const HOME_BY_ROLE = {
  admin: '/admin',
  registrar: '/registrar',
  gate_scanner: '/gate',
  district_scanner: '/district-checkpoint',
};

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(username, password);
      navigate(HOME_BY_ROLE[user.role] || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-narrow">
      <div className="card">
        <h1>Sign in</h1>
        <p style={{ color: '#666', fontSize: 13 }}>Emmanuel Sekaran Remembrance Day — Vehicle Permit System</p>
        <form onSubmit={onSubmit}>
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
