import { QrScannerPanel } from '../../components/QrScannerPanel.jsx';

const STATUS_LABELS = {
  not_arrived: 'Not Arrived',
  verified_entered: 'Entered',
  verified_exited: 'Exited',
};

export function Scanner() {
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
    />
  );
}
