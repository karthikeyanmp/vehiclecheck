import { useEffect, useState } from 'react';
import { api } from '../../api.js';

function sum(rows, key) {
  return rows.reduce((t, r) => t + Number(r[key] || 0), 0);
}

export function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/admin/summary').then(setSummary).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="page"><div className="error">{error}</div></div>;
  if (!summary) return <div className="page">Loading…</div>;

  const { districtTotals, byStation, byCheckpoint } = summary;

  return (
    <div className="page">
      <h1>District Departure / Return Monitoring</h1>
      <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
        Vehicles and people that left the district for the event, and how many are back.
        Tracked for districts with a checkpoint (Thanjavur).
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
        <h2>By District Checkpoint</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          Grouped by the checkpoint a vehicle first departed through.
        </p>
        <table>
          <thead>
            <tr>
              <th>Checkpoint</th><th>District</th>
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

      <a className="secondary" style={{ display: 'inline-block', textDecoration: 'none' }} href={api.fileUrl('/api/admin/export.csv')}>
        Export all registrations (CSV)
      </a>
    </div>
  );
}
