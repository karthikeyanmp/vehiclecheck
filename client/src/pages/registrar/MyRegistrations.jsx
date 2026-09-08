import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const STATUS_LABEL = {
  not_departed: 'Not Departed',
  departed: 'Departed',
  returned: 'Returned',
};

export function MyRegistrations() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  function load() {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get(`/api/registrations${qs}`).then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, [search]);

  return (
    <div className="page">
      <h1>My Station's Registrations</h1>
      {user.policeStationName && (
        <p style={{ marginTop: -8, color: 'var(--muted)' }}>
          Station: <strong>{user.policeStationName}</strong>
        </p>
      )}
      <div className="toolbar">
        <input style={{ maxWidth: 280 }} placeholder="Search vehicle no. / name / mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Permit #</th><th>Vehicle</th><th>Applicant</th><th>Mobile</th>
              <th>Check Post</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.permit_number}</td>
                <td>{r.vehicle_number}</td>
                <td>{r.applicant_name}</td>
                <td>{r.applicant_mobile}</td>
                <td>{r.allowed_entry_point_name}</td>
                <td><span className={`status-pill status-${r.district_status}`}>{STATUS_LABEL[r.district_status] || r.district_status}</span></td>
                <td>
                  <a href={api.fileUrl(`/api/registrations/${r.id}/certificate.pdf`)} target="_blank" rel="noreferrer">Certificate</a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} style={{ color: '#888' }}>No registrations yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
