import { useEffect, useState } from 'react';
import { api } from '../../api.js';

export function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/admin/summary').then(setSummary).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="page"><div className="error">{error}</div></div>;
  if (!summary) return <div className="page">Loading…</div>;

  const t = summary.totals;

  return (
    <div className="page">
      <h1>Dashboard</h1>

      <div className="summary-grid">
        <div className="summary-tile"><div className="n">{t.total}</div><div className="label">Total Registered</div></div>
        <div className="summary-tile"><div className="n">{t.currently_inside}</div><div className="label">Currently Inside</div></div>
        <div className="summary-tile"><div className="n">{t.exited}</div><div className="label">Exited</div></div>
        <div className="summary-tile"><div className="n">{t.not_arrived}</div><div className="label">Not Yet Arrived</div></div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>By Entry Point</h2>
        <table>
          <thead><tr><th>Entry Point</th><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            {summary.byEntryPoint.map((r, i) => (
              <tr key={i}><td>{r.entry_point}</td><td>{r.current_status}</td><td>{r.n}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>By Police Station</h2>
        <table>
          <thead><tr><th>Station</th><th>District</th><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            {summary.byStation.map((r, i) => (
              <tr key={i}><td>{r.station_name}</td><td>{r.district}</td><td>{r.current_status}</td><td>{r.n}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>District Departure / Return Monitoring</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          How many vehicles and people left the district to attend the event, and how many have returned.
          Tracked only for districts with a checkpoint (Thanjavur, for now).
        </p>
        <table>
          <thead>
            <tr>
              <th>District</th>
              <th>Left (total)</th>
              <th>Returned</th>
              <th>Still out</th>
              <th>Not yet departed</th>
            </tr>
          </thead>
          <tbody>
            {summary.districtTotals.map((r, i) => (
              <tr key={i}>
                <td>{r.district}</td>
                <td>{r.left_total} vehicles / {r.persons_left_total} persons</td>
                <td>{r.returned} vehicles / {r.persons_returned} persons</td>
                <td>{r.departed} vehicles / {r.persons_departed} persons</td>
                <td>{r.not_departed} vehicles</td>
              </tr>
            ))}
            {summary.districtTotals.length === 0 && (
              <tr><td colSpan={5} style={{ color: '#888' }}>No district checkpoints configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <a className="secondary" style={{ display: 'inline-block', textDecoration: 'none' }} href={api.fileUrl('/api/admin/export.csv')}>
        Export all registrations (CSV)
      </a>
    </div>
  );
}
