import { QrScannerPanel } from '../../components/QrScannerPanel.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const STATUS_LABELS = {
  not_arrived: 'Not Arrived',
  verified_entered: 'Entered',
  verified_exited: 'Exited',
};

export function Scanner() {
  const { user } = useAuth();

  const assignment = (
    <div style={{ fontSize: 14 }}>
      {user.policeStationName && <div>Station: <strong>{user.policeStationName}</strong></div>}
      <div>Entry / exit point: <strong>{user.entryPointName || '—'}</strong></div>
    </div>
  );

  return (
    <QrScannerPanel
      title="Gate Scanner"
      lookupUrl="/api/scan/lookup"
      verifyUrl="/api/scan/verify"
      statusField="currentStatus"
      statusLabels={STATUS_LABELS}
      mismatchField="gateMismatch"
      mismatchMessage="This permit is assigned to a different entry point. Use judgement before allowing entry here."
      renderExtra={(lookup) => <p>Allowed entry point: {lookup.allowedEntryPointName}</p>}
      headerControls={assignment}
    />
  );
}
