import { useCallback, useEffect, useState } from 'react';
import { api, byLabel } from '../../api.js';

function blankRow(fields) {
  return Object.fromEntries(fields.map((f) => [f.key, f.default ?? '']));
}

function Section({ title, note, basePath, fields }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [newRow, setNewRow] = useState(() => blankRow(fields));

  // Sort each list by its name-ish column (falls back to the first field).
  const sortKey = (fields.find((f) => f.key === 'name' || f.key === 'station_name') || fields[0]).key;
  const load = useCallback(() => {
    api.get(basePath).then((d) => setItems(byLabel(d, (x) => x[sortKey]))).catch((e) => setError(e.message));
  }, [basePath, sortKey]);
  useEffect(load, [load]);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(basePath, newRow);
      setNewRow(blankRow(fields));
      load();
    } catch (err) { setError(err.message); }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setDraft(Object.fromEntries(fields.map((f) => [f.key, item[f.key] ?? ''])));
  }

  async function saveEdit(id) {
    setError('');
    try {
      await api.patch(`${basePath}/${id}`, draft);
      setEditingId(null);
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${fields.map((f) => item[f.key]).join(' / ')}"?`)) return;
    setError('');
    try {
      await api.del(`${basePath}/${item.id}`);
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      {note && <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>{note}</p>}
      {error && <div className="error">{error}</div>}
      <table>
        <thead>
          <tr>
            {fields.map((f) => <th key={f.key}>{f.label}</th>)}
            <th style={{ width: 150 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {fields.map((f) => (
                <td key={f.key}>
                  {editingId === item.id ? (
                    <input
                      value={draft[f.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  ) : item[f.key]}
                </td>
              ))}
              <td>
                {editingId === item.id ? (
                  <>
                    <button className="secondary" onClick={() => saveEdit(item.id)}>Save</button>{' '}
                    <button className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="secondary" onClick={() => startEdit(item)}>Edit</button>{' '}
                    <button className="secondary" onClick={() => remove(item)}>Delete</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={fields.length + 1} style={{ color: '#888' }}>None yet.</td></tr>
          )}
        </tbody>
      </table>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {fields.map((f) => (
          <input
            key={f.key}
            placeholder={f.label}
            value={newRow[f.key]}
            required={f.required !== false}
            onChange={(e) => setNewRow((r) => ({ ...r, [f.key]: e.target.value }))}
          />
        ))}
        <button className="secondary" type="submit">Add</button>
      </form>
    </div>
  );
}

export function MasterData() {
  return (
    <div className="page">
      <h1>Master Data</h1>

      <Section
        title="Police Stations"
        basePath="/api/master-data/police-stations"
        fields={[
          { key: 'district', label: 'District' },
          { key: 'station_name', label: 'Station Name' },
        ]}
      />

      <Section
        title="Entry Points (Madurai gates)"
        basePath="/api/master-data/entry-points"
        fields={[
          { key: 'name', label: 'Name' },
          { key: 'district', label: 'District', default: 'Madurai' },
        ]}
      />

      <Section
        title="District Checkpoints (home-district departure/return)"
        note="Only Thanjavur is active for now — adding a checkpoint for another district here is enough to enable it. Create a matching District Checkpoint Officer account under Users once a checkpoint exists."
        basePath="/api/master-data/district-checkpoints"
        fields={[
          { key: 'name', label: 'Checkpoint Name' },
          { key: 'district', label: 'District', default: 'Thanjavur' },
        ]}
      />

      <p style={{ color: '#888', fontSize: 12 }}>
        An entry that&rsquo;s already used by a registration, scan log, or officer account can&rsquo;t be
        deleted — edit it instead, or remove what references it first.
      </p>
    </div>
  );
}
