import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const emptyPassenger = { name: '', age: '', gender: '' };
const emptyForm = {
  vehicle_number: '',
  vehicle_type: 'four_wheeler',
  applicant_name: '',
  applicant_age: '',
  applicant_mobile: '',
  district: 'Thanjavur', // most applicants are from Thanjavur — prefilled, still editable
  num_persons_traveling: 1,
  allowed_entry_point_id: '',
  police_station_id: '',
};

/**
 * Prints the certificate PDF via a hidden same-origin iframe (works in
 * Chrome/Edge/Firefox); falls back to opening it in a new tab if the
 * browser blocks the scripted print.
 */
function printCertificate(registrationId) {
  const url = api.fileUrl(`/api/registrations/${registrationId}/certificate.pdf`);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(url, '_blank', 'noopener');
    }
    setTimeout(() => iframe.remove(), 60000);
  };
  document.body.appendChild(iframe);
}

// Registrars are tied to one station server-side (it's read off their JWT),
// so only admin needs to pick a station here — an admin account isn't
// scoped to a single station the way a registrar is.
export function NewRegistration() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';

  const [entryPoints, setEntryPoints] = useState([]);
  const [stations, setStations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [coPassengers, setCoPassengers] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [rc, setRc] = useState(null);
  const [vehiclePhoto, setVehiclePhoto] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/master-data/entry-points').then(setEntryPoints).catch((e) => setError(e.message));
    if (isAdmin) {
      api.get('/api/master-data/police-stations').then(setStations).catch((e) => setError(e.message));
    }
  }, [isAdmin]);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function updatePassenger(i, field, value) {
    setCoPassengers((list) => list.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) fd.append(k, v);
      if (photo) fd.append('applicant_photo', photo);
      if (rc) fd.append('rc_copy', rc);
      if (vehiclePhoto) fd.append('vehicle_photo', vehiclePhoto);
      fd.append('co_passengers', JSON.stringify(coPassengers.filter((p) => p.name)));

      const res = await api.postForm('/api/registrations', fd);
      setResult(res);
      setForm(emptyForm);
      setCoPassengers([]);
      setPhoto(null);
      setRc(null);
      setVehiclePhoto(null);
      e.target.reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>New Registration</h1>
      <form className="card" onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label>Vehicle Number</label>
            <input value={form.vehicle_number} onChange={(e) => setField('vehicle_number', e.target.value)} required placeholder="TN 58 AB 1234" />
          </div>
          <div>
            <label>Vehicle Type</label>
            <select value={form.vehicle_type} onChange={(e) => setField('vehicle_type', e.target.value)}>
              <option value="two_wheeler">Two Wheeler</option>
              <option value="four_wheeler">Four Wheeler</option>
            </select>
          </div>
          <div>
            <label>Applicant Name</label>
            <input value={form.applicant_name} onChange={(e) => setField('applicant_name', e.target.value)} required />
          </div>
          <div>
            <label>Applicant Age</label>
            <input type="number" min="0" value={form.applicant_age} onChange={(e) => setField('applicant_age', e.target.value)} />
          </div>
          <div>
            <label>Applicant Mobile</label>
            <input value={form.applicant_mobile} onChange={(e) => setField('applicant_mobile', e.target.value)} required pattern="[0-9]{10}" title="10-digit mobile number" />
          </div>
          <div>
            <label>District (applicant's home district)</label>
            <input value={form.district} onChange={(e) => setField('district', e.target.value)} required />
          </div>
          <div>
            <label>No. of Persons Traveling</label>
            <input type="number" min="1" value={form.num_persons_traveling} onChange={(e) => setField('num_persons_traveling', e.target.value)} required />
          </div>
          {isAdmin && (
            <div>
              <label>Police Station (registering this vehicle)</label>
              <select value={form.police_station_id} onChange={(e) => setField('police_station_id', e.target.value)} required>
                <option value="" disabled>Select…</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.station_name} ({s.district})</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label>Allowed Entry Point</label>
            <select value={form.allowed_entry_point_id} onChange={(e) => setField('allowed_entry_point_id', e.target.value)} required>
              <option value="" disabled>Select…</option>
              {entryPoints.map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.name} ({ep.district})</option>
              ))}
            </select>
          </div>
          <div>
            <label>Applicant Photo (optional)</label>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files[0] || null)} />
            <small style={{ color: '#888' }}>On a phone/tablet this opens the camera.</small>
          </div>
          <div>
            <label>RC Photo (optional)</label>
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setRc(e.target.files[0] || null)} />
            <small style={{ color: '#888' }}>Photograph the RC, or attach an image/PDF on desktop.</small>
          </div>
          <div>
            <label>Vehicle Photo (optional)</label>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setVehiclePhoto(e.target.files[0] || null)} />
            <small style={{ color: '#888' }}>On a phone/tablet this opens the camera.</small>
          </div>
        </div>

        <h2 style={{ marginTop: 20 }}>Co-passengers (optional)</h2>
        {coPassengers.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
            <input placeholder="Name" value={p.name} onChange={(e) => updatePassenger(i, 'name', e.target.value)} />
            <input placeholder="Age" type="number" value={p.age} onChange={(e) => updatePassenger(i, 'age', e.target.value)} />
            <input placeholder="Gender" value={p.gender} onChange={(e) => updatePassenger(i, 'gender', e.target.value)} />
            <button type="button" className="secondary" onClick={() => setCoPassengers((l) => l.filter((_, idx) => idx !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setCoPassengers((l) => [...l, { ...emptyPassenger }])}>+ Add co-passenger</button>

        {error && <div className="error">{error}</div>}
        {result && (
          <div className="success" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>Registered — Permit #{result.permitNumber}.</span>
            <button type="button" className="primary" style={{ marginTop: 0 }} onClick={() => printCertificate(result.id)}>
              Print Certificate
            </button>
            <a href={api.fileUrl(`/api/registrations/${result.id}/certificate.pdf`)} target="_blank" rel="noreferrer">
              Open PDF
            </a>
          </div>
        )}
        <div>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Register & Generate Permit'}</button>
        </div>
      </form>
    </div>
  );
}
