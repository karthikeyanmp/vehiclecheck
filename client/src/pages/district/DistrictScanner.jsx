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
// Tracks a vehicle leaving and returning through its home district's
// checkpoint. Thanjavur has several exit/return points, so the officer
// picks which one they're at; it's sent with every scan.
export function DistrictScanner() {
  const { user } = useAuth();
  const [checkpoints, setCheckpoints] = useState([]);
  const [checkpointId, setCheckpointId] = useState(
    user.districtCheckpointId ? String(user.districtCheckpointId) : '',
  );
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/master-data/district-checkpoints').then(setCheckpoints).catch((e) => setError(e.message));
  }, []);

  const selector = (
    <>
      <label>Checkpoint you are at</label>
      <select value={checkpointId} onChange={(e) => setCheckpointId(e.target.value)}>
        <option value="" disabled>Select checkpoint…</option>
        {checkpoints.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.district})</option>
        ))}
      </select>
      {error && <div className="error">{error}</div>}
    </>
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
