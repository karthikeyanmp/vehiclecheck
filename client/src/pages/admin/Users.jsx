import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const emptyForm = {
  username: '', password: '', full_name: '', role: 'registrar',
  police_station_id: '', entry_point_id: '', district_checkpoint_id: '',
};

export function Users() {
  const [users, setUsers] = useState([]);
  const [stations, setStations] = useState([]);
  const [entryPoints, setEntryPoints] = useState([]);
  const [districtCheckpoints, setDistrictCheckpoints] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api.get('/api/users').then(setUsers).catch((e) => setError(e.message));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get('/api/master-data/police-stations').then(setStations).catch(() => {});
    api.get('/api/master-data/entry-points').then(setEntryPoints).catch(() => {});
    api.get('/api/master-data/district-checkpoints').then(setDistrictCheckpoints).catch(() => {});
  }, []);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/users', {
        ...form,
        police_station_id: form.police_station_id || undefined,
        entry_point_id: form.entry_point_id || undefined,
        district_checkpoint_id: form.district_checkpoint_id || undefined,
      });
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u) {
    await api.patch(`/api/users/${u.id}`, { active: !u.active });
    load();
  }

  return (
    <div className="page">
      <h1>User Accounts</h1>

      <form className="card" onSubmit={createUser}>
        <h2>Create account</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><label>Username</label><input value={form.username} onChange={(e) => setField('username', e.target.value)} required /></div>
          <div><label>Full name</label><input value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} required /></div>
          <div><label>Temporary password (min 10 chars)</label><input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} required minLength={10} /></div>
          <div>
            <label>Role</label>
            <select value={form.role} onChange={(e) => setField('role', e.target.value)}>
              <option value="registrar">Registering Officer</option>
              <option value="gate_scanner">Gate Personnel</option>
              <option value="district_scanner">District Checkpoint Officer</option>
              <option value="admin">Super Admin</option>
            </select>
          </div>
          {form.role === 'registrar' && (
            <div>
              <label>Police Station</label>
              <select value={form.police_station_id} onChange={(e) => setField('police_station_id', e.target.value)} required>
                <option value="" disabled>Select…</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.station_name} ({s.district})</option>)}
              </select>
            </div>
          )}
          {form.role === 'gate_scanner' && (
            <div>
              <label>Entry Point</label>
              <select value={form.entry_point_id} onChange={(e) => setField('entry_point_id', e.target.value)} required>
                <option value="" disabled>Select…</option>
                {entryPoints.map((ep) => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
              </select>
            </div>
          )}
          {form.role === 'district_scanner' && (
            <div>
              <label>Default Checkpoint (optional — the officer picks one each shift)</label>
              <select value={form.district_checkpoint_id} onChange={(e) => setField('district_checkpoint_id', e.target.value)}>
                <option value="">None</option>
                {districtCheckpoints.map((dc) => <option key={dc.id} value={dc.id}>{dc.name} ({dc.district})</option>)}
              </select>
            </div>
          )}
        </div>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create account'}</button>
      </form>

      <div className="card">
        <h2>Existing accounts</h2>
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Station / Gate / Checkpoint</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.full_name}</td>
                <td>{u.role}</td>
                <td>{u.station_name || u.entry_point_name || u.district_checkpoint_name || '—'}</td>
                <td>{u.active ? 'Yes' : 'No'}</td>
                <td><button className="secondary" onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
