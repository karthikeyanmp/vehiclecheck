import { Fragment, useEffect, useState } from 'react';
import { api, byLabel } from '../../api.js';
import { ROLE_LABEL } from '../../roles.js';

const emptyForm = {
  username: '', password: '', full_name: '', role: 'registrar',
  police_station_id: '', check_post_ids: [],
};

export function Users() {
  const [users, setUsers] = useState([]);
  const [stations, setStations] = useState([]);
  const [checkPosts, setCheckPosts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  function load() {
    api.get('/api/users').then(setUsers).catch((e) => setError(e.message));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get('/api/master-data/police-stations').then((d) => setStations(byLabel(d, (x) => x.station_name))).catch(() => {});
    api.get('/api/master-data/entry-points').then((d) => setCheckPosts(byLabel(d))).catch(() => {});
  }, []);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function toggleCreateCheckPost(id) {
    setForm((f) => {
      const set = new Set(f.check_post_ids.map(String));
      set.has(String(id)) ? set.delete(String(id)) : set.add(String(id));
      return { ...f, check_post_ids: [...set] };
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

  async function removeUser(u) {
    setDeleteError('');
    if (!window.confirm(
      `Delete the account "${u.username}" (${u.full_name})?\n\n`
      + 'This permanently removes the account. It cannot be undone. '
      + 'Disable it instead if you only want to block sign-in.',
    )) return;
    try {
      await api.del(`/api/users/${u.id}`);
      if (editId === u.id) { setEditId(null); setDraft(null); }
      load();
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  function startEdit(u) {
    setError('');
    setEditId(u.id);
    setDraft({
      full_name: u.full_name,
      police_station_id: u.police_station_id ? String(u.police_station_id) : '',
      check_post_ids: (u.checkpoints || []).map((c) => String(c.id)),
      password: '',
    });
  }

  function setDraftField(k, v) { setDraft((d) => ({ ...d, [k]: v })); }

  function toggleDraftCheckPost(id) {
    setDraft((d) => {
      const set = new Set(d.check_post_ids.map(String));
      set.has(String(id)) ? set.delete(String(id)) : set.add(String(id));
      return { ...d, check_post_ids: [...set] };
    });
  }

  async function saveEdit(u) {
    setError('');
    if (u.role === 'registrar' && !draft.police_station_id) {
      setError('A registering officer must have a police station.');
      return;
    }
    if (u.role === 'district_scanner' && draft.check_post_ids.length === 0) {
      setError('A check post officer needs at least one assigned check post.');
      return;
    }
    const payload = {
      full_name: draft.full_name,
      police_station_id: draft.police_station_id || null,
    };
    if (u.role === 'district_scanner') payload.check_post_ids = draft.check_post_ids;
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
              <option value="district_scanner">Check Post Officer</option>
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

          {form.role === 'district_scanner' && (
            <div>
              <label>Police Station (shown to the officer — optional)</label>
              <select value={form.police_station_id} onChange={(e) => setField('police_station_id', e.target.value)}>
                <option value="">None</option>
                {stations.map((s) => <option key={s.id} value={s.id}>{s.station_name} ({s.district})</option>)}
              </select>
            </div>
          )}

          {form.role === 'district_scanner' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Assigned Check Posts (the officer can only work these)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                {checkPosts.map((cp) => (
                  <label key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, margin: 0 }}>
                    <input type="checkbox" style={{ width: 'auto' }}
                      checked={form.check_post_ids.map(String).includes(String(cp.id))}
                      onChange={() => toggleCreateCheckPost(cp.id)} />
                    {cp.name}
                  </label>
                ))}
                {checkPosts.length === 0 && <span style={{ color: '#888' }}>Add check posts in Master Data first.</span>}
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
        {deleteError && <div className="error">{deleteError}</div>}
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
                    <button className="secondary" onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>{' '}
                    <button className="danger" onClick={() => removeUser(u)}>Delete</button>
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

                        <div>
                          <label>Reset password (leave blank to keep)</label>
                          <input type="password" value={draft.password} onChange={(e) => setDraftField('password', e.target.value)} placeholder="min 10 chars" />
                        </div>

                        {u.role === 'district_scanner' && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label>Assigned Check Posts</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                              {checkPosts.map((cp) => (
                                <label key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, margin: 0 }}>
                                  <input type="checkbox" style={{ width: 'auto' }}
                                    checked={draft.check_post_ids.map(String).includes(String(cp.id))}
                                    onChange={() => toggleDraftCheckPost(cp.id)} />
                                  {cp.name}
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
