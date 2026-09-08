import { useEffect, useState } from 'react';
import { api } from '../../api.js';

function sum(rows, key) {
  return rows.reduce((t, r) => t + Number(r[key] || 0), 0);
}

export function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/admin/summary').then(setSummary).catch((e) => setError(e.message));
    api.get('/api/admin/users-report').then(setStaff).catch(() => {});
  }, []);

  if (error) return <div className="page"><div className="error">{error}</div></div>;
  if (!summary) return <div className="page">Loading…</div>;

  const { districtTotals, byStation, byCheckpoint } = summary;

  return (
    <div className="page">
      <h1>District Departure / Return Monitoring</h1>
      <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
        Vehicles and people that left the district for the event, and how many are back.
        Tracked for districts with a check post (Thanjavur).
      </p>

      <div className="summary-grid">
        <div className="summary-tile">
          <div className="n">{sum(districtTotals, 'left_total')}</div>
          <div className="label">Left the district<br />({sum(districtTotals, 'persons_left')} persons)</div>
        </div>
        <div className="summary-tile">
          <div className="n">{sum(districtTotals, 'returned')}</div>
          <div className="label">Returned<br />({sum(districtTotals, 'persons_returned')} persons)</div>
        </div>
        <div className="summary-tile">
          <div className="n">{sum(districtTotals, 'still_out')}</div>
          <div className="label">Still out<br />({sum(districtTotals, 'persons_still_out')} persons)</div>
        </div>
        <div className="summary-tile">
          <div className="n">{sum(districtTotals, 'not_left')}</div>
          <div className="label">Not left yet</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>By Police Station</h2>
        <table>
          <thead>
            <tr>
              <th>Station</th><th>District</th>
              <th>Not left</th><th>Left</th><th>Returned</th><th>Still out</th>
              <th>Persons left</th><th>Persons returned</th>
            </tr>
          </thead>
          <tbody>
            {byStation.map((r, i) => (
              <tr key={i}>
                <td>{r.station_name}</td><td>{r.district}</td>
                <td>{r.not_left}</td><td>{r.left_total}</td><td>{r.returned}</td><td>{r.still_out}</td>
                <td>{r.persons_left}</td><td>{r.persons_returned}</td>
              </tr>
            ))}
            {byStation.length === 0 && (
              <tr><td colSpan={8} style={{ color: '#888' }}>No registrations from a monitored district yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>By Check Post</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          Grouped by the check post a vehicle first departed through.
        </p>
        <table>
          <thead>
            <tr>
              <th>Check Post</th><th>District</th>
              <th>Left via here</th><th>Returned</th><th>Not returned</th>
              <th>Persons left</th><th>Persons returned</th>
            </tr>
          </thead>
          <tbody>
            {byCheckpoint.map((r, i) => (
              <tr key={i}>
                <td>{r.checkpoint}</td><td>{r.district}</td>
                <td>{r.left_via}</td><td>{r.returned}</td><td>{r.still_out}</td>
                <td>{r.persons_left}</td><td>{r.persons_returned}</td>
              </tr>
            ))}
            {byCheckpoint.length === 0 && (
              <tr><td colSpan={7} style={{ color: '#888' }}>No departures scanned yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ marginBottom: 0 }}>Staff Directory</h2>
          <a className="secondary" style={{ textDecoration: 'none' }} href={api.fileUrl('/api/admin/users-report.csv')}>
            Download CSV
          </a>
        </div>
        <p style={{ color: '#666', fontSize: 13 }}>Every account, its role, police station, and assigned check posts.</p>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Username</th><th>Role</th>
              <th>Police Station</th><th>Assigned Check Posts</th><th>Active</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.username}>
                <td>{u.full_name}</td>
                <td>{u.username}</td>
                <td>{u.role_label}</td>
                <td>{u.police_station || '—'}</td>
                <td>{u.check_posts || '—'}</td>
                <td>{u.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td colSpan={6} style={{ color: '#888' }}>No user accounts.</td></tr>}
          </tbody>
        </table>
      </div>

      <a className="secondary" style={{ display: 'inline-block', textDecoration: 'none' }} href={api.fileUrl('/api/admin/export.csv')}>
        Export all registrations (CSV)
      </a>
    </div>
  );
}
