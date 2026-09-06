import { useEffect, useState } from 'react';
import { QrScannerPanel } from '../../components/QrScannerPanel.jsx';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const STATUS_LABELS = {
  not_departed: 'Not Departed',
  departed: 'Departed',
  returned: 'Returned',
};

// District boundary monitoring — separate from the Madurai event gates.
// The officer works only their assigned checkpoints and picks which one
// they're at; it's sent with every scan.
export function DistrictScanner() {
  const { user } = useAuth();
  const [checkpoints, setCheckpoints] = useState(user.assignedCheckpoints || []);
  const [checkpointId, setCheckpointId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/district-scan/checkpoints')
      .then((cps) => {
        setCheckpoints(cps);
        if (cps.length === 1) setCheckpointId(String(cps[0].id)); // auto-pick when there's only one
      })
      .catch((e) => setError(e.message));
  }, []);

  const selector = (
    <div style={{ fontSize: 14 }}>
      {user.policeStationName && <div style={{ marginBottom: 8 }}>Station: <strong>{user.policeStationName}</strong></div>}
      <label>Checkpoint you are at (your assigned points only)</label>
      <select value={checkpointId} onChange={(e) => setCheckpointId(e.target.value)}>
        <option value="" disabled>Select checkpoint…</option>
        {checkpoints.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.district ? ` (${c.district})` : ''}</option>
        ))}
      </select>
      {checkpoints.length === 0 && <div className="error">No checkpoints assigned to your account — ask an admin.</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );

  return (
    <QrScannerPanel
      title="District Checkpoint"
      lookupUrl="/api/district-scan/lookup"
      verifyUrl="/api/district-scan/verify"
      statusField="districtStatus"
      statusLabels={STATUS_LABELS}
      mismatchField="districtMismatch"
      mismatchMessage="This vehicle's registered home district doesn't match this checkpoint. Use judgement before proceeding."
      renderExtra={(lookup) => <p>Registered district: {lookup.registrationDistrict}</p>}
      headerControls={selector}
      extraBody={{ checkpointId: checkpointId || undefined }}
      ready={!!checkpointId}
      notReadyMessage="Select which checkpoint you are at before scanning."
    />
  );
}
