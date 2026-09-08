import { Fragment, useEffect, useState } from 'react';
import { api, byLabel } from '../../api.js';

const emptyForm = {
  username: '', password: '', full_name: '', role: 'registrar',
  police_station_id: '', entry_point_id: '', district_checkpoint_ids: [],
};

const ROLE_LABEL = {
  admin: 'Super Admin',
  registrar: 'Registering Officer',
  gate_scanner: 'Gate Personnel',
  district_scanner: 'District Checkpoint Officer',
};

export function Users() {
  const [users, setUsers] = useState([]);
  const [stations, setStations] = useState([]);
  const [entryPoints, setEntryPoints] = useState([]);
  const [districtCheckpoints, setDistrictCheckpoints] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  function load() {
    api.get('/api/users').then(setUsers).catch((e) => setError(e.message));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get('/api/master-data/police-stations').then((d) => setStations(byLabel(d, (x) => x.station_name))).catch(() => {});
    api.get('/api/master-data/entry-points').then((d) => setEntryPoints(byLabel(d))).catch(() => {});
    api.get('/api/master-data/district-checkpoints').then((d) => setDistrictCheckpoints(byLabel(d))).catch(() => {});
  }, []);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function toggleCreateCheckpoint(id) {
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
    await api.patch(`/api/users/${u.id}`, { active: !u.active }).catch((e) => setError(e.message));
    load();
  }

  function startEdit(u) {
    setError('');
    setEditId(u.id);
    setDraft({
      full_name: u.full_name,
      police_station_id: u.police_station_id ? String(u.police_station_id) : '',
      entry_point_id: u.entry_point_id ? String(u.entry_point_id) : '',
      district_checkpoint_ids: (u.checkpoints || []).map((c) => String(c.id)),
      password: '',
    });
  }

  function setDraftField(k, v) { setDraft((d) => ({ ...d, [k]: v })); }

  function toggleDraftCheckpoint(id) {
    setDraft((d) => {
      const set = new Set(d.district_checkpoint_ids.map(String));
      set.has(String(id)) ? set.delete(String(id)) : set.add(String(id));
      return { ...d, district_checkpoint_ids: [...set] };
    });
  }

  async function saveEdit(u) {
    setError('');
    if (u.role === 'registrar' && !draft.police_station_id) {
      setError('A registering officer must have a police station.');
      return;
    }
    if (u.role === 'gate_scanner' && !draft.entry_point_id) {
      setError('A gate officer must have an assigned entry/exit point.');
      return;
    }
    if (u.role === 'district_scanner' && draft.district_checkpoint_ids.length === 0) {
      setError('A district officer needs at least one assigned checkpoint.');
      return;
    }
    const payload = {
      full_name: draft.full_name,
      police_station_id: draft.police_station_id || null,
    };
    if (u.role === 'gate_scanner') payload.entry_point_id = draft.entry_point_id || null;
    if (u.role === 'district_scanner') payload.district_checkpoint_ids = draft.district_checkpoint_ids;
    if (draft.password) payload.password = draft.password;
    try {
      await api.patch(`/api/users/${u.id}`, payload);
      setEditId(null);
      setDraft(null);
      load();
    } catch (err) { setError(err.message); }
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
                    <input type="checkbox" style={{ width: 'auto' }}
                      checked={form.district_checkpoint_ids.map(String).includes(String(dc.id))}
                      onChange={() => toggleCreateCheckpoint(dc.id)} />
                    {dc.name} ({dc.district})
                  </label>
                ))}
                {districtCheckpoints.length === 0 && <span style={{ color: '#888' }}>Add checkpoints in Master Data first.</span>}
              </div>
            </div>
          )}
        </div>
        {error && !editId && <div className="error">{error}</div>}
        <button className="primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create account'}</button>
      </form>

      <div className="card">
        <h2>Existing accounts</h2>
        {error && editId && <div className="error">{error}</div>}
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Station</th><th>Assigned to</th><th>Active</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
                <tr>
                  <td>{u.username}</td>
                  <td>{u.full_name}</td>
                  <td>{ROLE_LABEL[u.role] || u.role}</td>
                  <td>{u.station_name || '—'}</td>
                  <td>
                    {u.entry_point_name
                      || (u.checkpoints?.length ? u.checkpoints.map((c) => c.name).join(', ') : '—')}
                  </td>
                  <td>{u.active ? 'Yes' : 'No'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="secondary" onClick={() => (editId === u.id ? setEditId(null) : startEdit(u))}>
                      {editId === u.id ? 'Close' : 'Edit'}
                    </button>{' '}
                    <button className="secondary" onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>

                {editId === u.id && draft && (
                  <tr>
                    <td colSpan={7} style={{ background: '#f8f9fc' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 640 }}>
                        <div>
                          <label>Full name</label>
                          <input value={draft.full_name} onChange={(e) => setDraftField('full_name', e.target.value)} />
                        </div>
                        <div>
                          <label>Police Station{u.role === 'registrar' ? '' : ' (optional)'}</label>
                          <select value={draft.police_station_id} onChange={(e) => setDraftField('police_station_id', e.target.value)}>
                            {u.role !== 'registrar' && <option value="">None</option>}
                            {u.role === 'registrar' && <option value="" disabled>Select…</option>}
                            {stations.map((s) => <option key={s.id} value={s.id}>{s.station_name} ({s.district})</option>)}
                          </select>
                        </div>

                        {u.role === 'gate_scanner' && (
                          <div>
                            <label>Assigned Entry / Exit Point</label>
                            <select value={draft.entry_point_id} onChange={(e) => setDraftField('entry_point_id', e.target.value)}>
                              <option value="" disabled>Select…</option>
                              {entryPoints.map((ep) => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
                            </select>
                          </div>
                        )}

                        <div>
                          <label>Reset password (leave blank to keep)</label>
                          <input type="password" value={draft.password} onChange={(e) => setDraftField('password', e.target.value)} placeholder="min 10 chars" />
                        </div>

                        {u.role === 'district_scanner' && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Assigned Checkpoints</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                              {districtCheckpoints.map((dc) => (
                                <label key={dc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, margin: 0 }}>
                                  <input type="checkbox" style={{ width: 'auto' }}
                                    checked={draft.district_checkpoint_ids.map(String).includes(String(dc.id))}
                                    onChange={() => toggleDraftCheckpoint(dc.id)} />
                                  {dc.name} ({dc.district})
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button className="primary" style={{ marginTop: 0 }} onClick={() => saveEdit(u)}>Save changes</button>{' '}
                        <button className="secondary" onClick={() => { setEditId(null); setDraft(null); }}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
