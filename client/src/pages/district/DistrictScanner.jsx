import { QrScannerPanel } from '../../components/QrScannerPanel.jsx';

const STATUS_LABELS = {
  not_departed: 'Not Departed',
  departed: 'Departed',
  returned: 'Returned',
};

// District boundary monitoring — separate from the Madurai event gates in
// gate/Scanner.jsx. Tracks a vehicle leaving and returning through its home
// district's checkpoint (Thanjavur only, for now).
export function DistrictScanner() {
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
    />
  );
}
