import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

export function Registrations() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // registration id being edited
  const [entryPoints, setEntryPoints] = useState([]);
  const [editValue, setEditValue] = useState('');

  function load() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    api.get(`/api/registrations?${params}`).then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, [search, status]);
  useEffect(() => {
    api.get('/api/master-data/entry-points').then(setEntryPoints).catch(() => {});
  }, []);

  function startEdit(row) {
    setEditing(row.id);
    setEditValue(String(row.allowed_entry_point_id || ''));
  }

  async function saveEdit(id) {
    try {
      await api.patch(`/api/registrations/${id}`, { allowed_entry_point_id: Number(editValue) });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>All Registrations</h1>
      <div className="toolbar">
        <Link className="secondary" style={{ textDecoration: 'none' }} to="/admin/registrations/new">+ New Registration</Link>
        <input style={{ maxWidth: 280 }} placeholder="Search vehicle no. / name / mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="not_arrived">Not Arrived</option>
          <option value="verified_entered">Inside</option>
          <option value="verified_exited">Exited</option>
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Permit #</th><th>Vehicle</th><th>Applicant</th><th>Mobile</th>
              <th>Station</th><th>Entry Point</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.permit_number}</td>
                <td>{r.vehicle_number}</td>
                <td>{r.applicant_name}</td>
                <td>{r.applicant_mobile}</td>
                <td>{r.station_name}</td>
                <td>
                  {editing === r.id ? (
                    <select value={editValue} onChange={(e) => setEditValue(e.target.value)}>
                      {entryPoints.map((ep) => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
                    </select>
                  ) : r.allowed_entry_point_name}
                </td>
                <td><span className={`status-pill status-${r.current_status}`}>{r.current_status}</span></td>
                <td>
                  {editing === r.id ? (
                    <>
                      <button className="secondary" onClick={() => saveEdit(r.id)}>Save</button>{' '}
                      <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="secondary" onClick={() => startEdit(r)}>Edit gate</button>{' '}
                      <a href={api.fileUrl(`/api/registrations/${r.id}/certificate.pdf`)} target="_blank" rel="noreferrer">Certificate</a>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} style={{ color: '#888' }}>No matching registrations.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: '#888', fontSize: 12 }}>Every edit here is written to the admin edit log with your username and timestamp.</p>
    </div>
  );
}
