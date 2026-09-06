import { useEffect, useState } from 'react';
import { api } from '../../api.js';

const emptyForm = {
  username: '', password: '', full_name: '', role: 'registrar',
  police_station_id: '', entry_point_id: '', district_checkpoint_ids: [],
};

export function Users() {
  const [users, setUsers] = useState([]);
  const [stations, setStations] = useState([]);
  const [entryPoints, setEntryPoints] = useState([]);
  const [districtCheckpoints, setDistrictCheckpoints] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // user id whose checkpoints are being edited
  const [editIds, setEditIds] = useState([]);

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

  function toggleCheckpoint(id) {
    setForm((f) => {
      const set = new Set(f.district_checkpoint_ids.map(String));
      set.has(String(id)) ? set.delete(String(id)) : set.add(String(id));
      return { ...f, district_checkpoint_ids: [...set] };
    });
  }

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/users', {
        ...form,
        police_station_id: form.police_station_id || undefined,
        entry_point_id: form.entry_point_id || undefined,
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

  function startEditCheckpoints(u) {
    setEditingUser(u.id);
    setEditIds((u.checkpoints || []).map((c) => String(c.id)));
  }

  async function saveCheckpoints(userId) {
    setError('');
    try {
      await api.patch(`/api/users/${userId}`, { district_checkpoint_ids: editIds });
      setEditingUser(null);
      load();
    } catch (err) { setError(err.message); }
  }

  function toggleEditId(id) {
    setEditIds((cur) => {
      const set = new Set(cur.map(String));
      set.has(String(id)) ? set.delete(String(id)) : set.add(String(id));
      return [...set];
    });
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

          {(form.role === 'gate_scanner' || form.role === 'district_scanner') && (
            <div>
              <label>Police Station (shown to the officer — optional)</label>
              <select value={form.police_station_id} onChange={(e) => setField('police_station_id', e.target.value)}>
                <option value="">None</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.station_name} ({s.district})</option>)}
              </select>
            </div>
          )}

          {form.role === 'gate_scanner' && (
            <div>
              <label>Assigned Entry / Exit Point</label>
              <select value={form.entry_point_id} onChange={(e) => setField('entry_point_id', e.target.value)} required>
                <option value="" disabled>Select…</option>
                {entryPoints.map((ep) => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
              </select>
            </div>
          )}

          {form.role === 'district_scanner' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Assigned Checkpoints (the officer can only work these)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                {districtCheckpoints.map((dc) => (
                  <label key={dc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, margin: 0 }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={form.district_checkpoint_ids.map(String).includes(String(dc.id))}
                      onChange={() => toggleCheckpoint(dc.id)}
                    />
                    {dc.name} ({dc.district})
                  </label>
                ))}
                {districtCheckpoints.length === 0 && <span style={{ color: '#888' }}>Add checkpoints in Master Data first.</span>}
              </div>
            </div>
          )}
        </div>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create account'}</button>
      </form>

      <div className="card">
        <h2>Existing accounts</h2>
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Station</th><th>Assigned to</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.full_name}</td>
                <td>{u.role}</td>
                <td>{u.station_name || '—'}</td>
                <td>
                  {u.role === 'district_scanner' && editingUser === u.id ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {districtCheckpoints.map((dc) => (
                        <label key={dc.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400, margin: 0 }}>
                          <input type="checkbox" style={{ width: 'auto' }}
                            checked={editIds.map(String).includes(String(dc.id))}
                            onChange={() => toggleEditId(dc.id)} />
                          {dc.name}
                        </label>
                      ))}
                    </div>
                  ) : u.entry_point_name
                    || (u.checkpoints?.length ? u.checkpoints.map((c) => c.name).join(', ') : '—')}
                </td>
                <td>{u.active ? 'Yes' : 'No'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {u.role === 'district_scanner' && (
                    editingUser === u.id ? (
                      <>
                        <button className="secondary" onClick={() => saveCheckpoints(u.id)}>Save</button>{' '}
                        <button className="secondary" onClick={() => setEditingUser(null)}>Cancel</button>{' '}
                      </>
                    ) : (
                      <><button className="secondary" onClick={() => startEditCheckpoints(u)}>Checkpoints</button>{' '}</>
                    )
                  )}
                  <button className="secondary" onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
