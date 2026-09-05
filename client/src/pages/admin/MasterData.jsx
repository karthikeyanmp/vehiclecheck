import { useEffect, useState } from 'react';
import { api } from '../../api.js';

export function MasterData() {
  const [stations, setStations] = useState([]);
  const [entryPoints, setEntryPoints] = useState([]);
  const [districtCheckpoints, setDistrictCheckpoints] = useState([]);
  const [newStation, setNewStation] = useState({ district: '', station_name: '' });
  const [newEntryPoint, setNewEntryPoint] = useState({ name: '', district: 'Madurai' });
  const [newCheckpoint, setNewCheckpoint] = useState({ name: '', district: 'Thanjavur' });
  const [error, setError] = useState('');

  function load() {
    api.get('/api/master-data/police-stations').then(setStations).catch((e) => setError(e.message));
    api.get('/api/master-data/entry-points').then(setEntryPoints).catch((e) => setError(e.message));
    api.get('/api/master-data/district-checkpoints').then(setDistrictCheckpoints).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function addStation(e) {
    e.preventDefault();
    try {
      await api.post('/api/master-data/police-stations', newStation);
      setNewStation({ district: '', station_name: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function addEntryPoint(e) {
    e.preventDefault();
    try {
      await api.post('/api/master-data/entry-points', newEntryPoint);
      setNewEntryPoint({ name: '', district: 'Madurai' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function addCheckpoint(e) {
    e.preventDefault();
    try {
      await api.post('/api/master-data/district-checkpoints', newCheckpoint);
      setNewCheckpoint({ name: '', district: newCheckpoint.district });
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="page">
      <h1>Master Data</h1>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Police Stations</h2>
        <table>
          <thead><tr><th>District</th><th>Station</th></tr></thead>
          <tbody>{stations.map((s) => <tr key={s.id}><td>{s.district}</td><td>{s.station_name}</td></tr>)}</tbody>
        </table>
        <form onSubmit={addStation} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input placeholder="District" value={newStation.district} onChange={(e) => setNewStation((s) => ({ ...s, district: e.target.value }))} required />
          <input placeholder="Station name" value={newStation.station_name} onChange={(e) => setNewStation((s) => ({ ...s, station_name: e.target.value }))} required />
          <button className="secondary" type="submit">Add</button>
        </form>
      </div>

      <div className="card">
        <h2>Entry Points (Madurai gates)</h2>
        <table>
          <thead><tr><th>Name</th><th>District</th></tr></thead>
          <tbody>{entryPoints.map((ep) => <tr key={ep.id}><td>{ep.name}</td><td>{ep.district}</td></tr>)}</tbody>
        </table>
        <form onSubmit={addEntryPoint} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input placeholder="Entry point name" value={newEntryPoint.name} onChange={(e) => setNewEntryPoint((s) => ({ ...s, name: e.target.value }))} required />
          <input placeholder="District" value={newEntryPoint.district} onChange={(e) => setNewEntryPoint((s) => ({ ...s, district: e.target.value }))} />
          <button className="secondary" type="submit">Add</button>
        </form>
      </div>

      <div className="card">
        <h2>District Checkpoints (home-district departure/return)</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          Only Thanjavur is active for now — adding a checkpoint for another district here is enough
          to enable it, no other setup needed. Create a matching "District Checkpoint Officer" account
          under Users once a checkpoint exists.
        </p>
        <table>
          <thead><tr><th>Name</th><th>District</th></tr></thead>
          <tbody>{districtCheckpoints.map((dc) => <tr key={dc.id}><td>{dc.name}</td><td>{dc.district}</td></tr>)}</tbody>
        </table>
        <form onSubmit={addCheckpoint} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input placeholder="Checkpoint name" value={newCheckpoint.name} onChange={(e) => setNewCheckpoint((s) => ({ ...s, name: e.target.value }))} required />
          <input placeholder="District" value={newCheckpoint.district} onChange={(e) => setNewCheckpoint((s) => ({ ...s, district: e.target.value }))} required />
          <button className="secondary" type="submit">Add</button>
        </form>
      </div>
    </div>
  );
}
