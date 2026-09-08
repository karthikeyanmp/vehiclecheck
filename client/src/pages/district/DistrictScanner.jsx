import { useEffect, useState } from 'react';
import { QrScannerPanel } from '../../components/QrScannerPanel.jsx';
import { api, byLabel } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const STATUS_LABELS = {
  not_departed: 'Not Departed',
  departed: 'Departed',
  returned: 'Returned',
};

// Border check-post monitoring: a vehicle leaving Thanjavur district through
// its assigned check post and returning through the same one. The officer
// works only their assigned check posts and picks which one they're at; it's
// sent with every scan.
export function DistrictScanner() {
  const { user } = useAuth();
  const [checkPosts, setCheckPosts] = useState(byLabel(user.assignedCheckpoints || []));
  const [checkpointId, setCheckpointId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/district-scan/checkpoints')
      .then((cps) => {
        setCheckPosts(byLabel(cps));
        if (cps.length === 1) setCheckpointId(String(cps[0].id)); // auto-pick when there's only one
      })
      .catch((e) => setError(e.message));
  }, []);

  const selector = (
    <div style={{ fontSize: 14 }}>
      {user.policeStationName && <div style={{ marginBottom: 8 }}>Station: <strong>{user.policeStationName}</strong></div>}
      <label>Check post you are at (your assigned posts only)</label>
      <select value={checkpointId} onChange={(e) => setCheckpointId(e.target.value)}>
        <option value="" disabled>Select check post…</option>
        {checkPosts.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {checkPosts.length === 0 && <div className="error">No check posts assigned to your account — ask an admin.</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );

  return (
    <QrScannerPanel
      title="Check Post Scan"
      lookupUrl="/api/district-scan/lookup"
      verifyUrl="/api/district-scan/verify"
      statusField="districtStatus"
      statusLabels={STATUS_LABELS}
      mismatchField="checkPostMismatch"
      mismatchMessage="This vehicle's permit is for a different check post. Use judgement before allowing it through."
      renderExtra={(lookup) => <p>Permit check post: {lookup.allowedCheckPostName}</p>}
      headerControls={selector}
      extraBody={{ checkpointId: checkpointId || undefined }}
      ready={!!checkpointId}
      notReadyMessage="Select which check post you are at before scanning."
    />
  );
}
