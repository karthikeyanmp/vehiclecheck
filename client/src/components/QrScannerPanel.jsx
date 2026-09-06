import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../api.js';

const READER_ID = 'qr-reader';

/**
 * Shared camera-scan + lookup/verify flow used by both the Madurai event
 * gate scanner and the district checkpoint scanner — same interaction, just
 * pointed at different endpoints and status vocabularies.
 *
 * @param {string} title
 * @param {string} lookupUrl - e.g. '/api/scan/lookup'
 * @param {string} verifyUrl - e.g. '/api/scan/verify'
 * @param {string} statusField - key on the lookup response, e.g. 'currentStatus'
 * @param {Record<string,string>} statusLabels - status value -> human label
 * @param {string} [mismatchField] - key on the lookup response for the warning flag
 * @param {string} [mismatchMessage] - shown when mismatchField is true
 * @param {(lookup: object) => import('react').ReactNode} [renderExtra] - extra detail lines specific to this checkpoint type
 * @param {import('react').ReactNode} [headerControls] - rendered above the camera (e.g. a checkpoint selector)
 * @param {object} [extraBody] - merged into every lookup/verify request body
 * @param {boolean} [ready=true] - when false, scanning is disabled (e.g. no checkpoint picked yet)
 * @param {string} [notReadyMessage] - shown when ready is false
 */
export function QrScannerPanel({
  title, lookupUrl, verifyUrl, statusField, statusLabels, mismatchField, mismatchMessage, renderExtra,
  headerControls, extraBody, ready = true, notReadyMessage,
}) {
  const scannerRef = useRef(null);
  const resultRef = useRef(null);
  const handlingRef = useRef(false); // guards against repeat decodes of one frame
  const [scanning, setScanning] = useState(false);
  const [lastToken, setLastToken] = useState(null);
  const [lookup, setLookup] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // As soon as a scan resolves, bring the result into view — the camera stays
  // paused on the QR otherwise and the officer has to scroll to see the data.
  useLayoutEffect(() => {
    if (lookup || error) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [lookup, error]);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  async function startScanning() {
    setError('');
    setLookup(null);
    setMessage('');
    setLastToken(null);
    handlingRef.current = false;
    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 260 },
        (decodedText) => {
          if (handlingRef.current) return; // one decode per scan
          handlingRef.current = true;
          scanner.pause(true); // freeze immediately — safe to call from the callback
          handleScanned(decodedText);
        },
      );
      setScanning(true);
    } catch (err) {
      setError(`Camera error: ${err.message || err}`);
    }
  }

  async function stopScanning() {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch { /* already stopped */ }
    scannerRef.current = null;
    setScanning(false);
  }

  async function handleScanned(token) {
    setLastToken(token);
    try {
      const res = await api.post(lookupUrl, { token, ...extraBody });
      setLookup(res);
    } catch (err) {
      setError(err.message);
      setLookup(null);
    }
  }

  async function verify(action) {
    if (!lastToken) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post(verifyUrl, { token: lastToken, action, ...extraBody });
      setMessage(`Marked "${statusLabels[action] || action}" successfully.`);
      setLookup((l) => (l ? { ...l, [statusField]: res[statusField], nextAction: null } : l));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function scanNext() {
    setLookup(null);
    setMessage('');
    setError('');
    setLastToken(null);
    handlingRef.current = false;
    // The scanner is only paused (see the decode callback), so resume it
    // rather than tearing down and re-initialising the camera.
    if (scannerRef.current) scannerRef.current.resume();
    else startScanning();
  }

  const status = lookup?.[statusField];
  const mismatch = mismatchField && lookup?.[mismatchField];

  return (
    <div className="page">
      <h1>{title}</h1>
      <div className="card">
        {headerControls && <div style={{ marginBottom: 16 }}>{headerControls}</div>}
        {!ready && <div className="error">{notReadyMessage || 'Make a selection above to start scanning.'}</div>}
        {!scanning && <button className="primary" onClick={startScanning} disabled={!ready}>Start Camera</button>}
        {scanning && !lookup && <button className="secondary" onClick={stopScanning}>Stop Camera</button>}
        {/* Kept mounted while a result shows (scanner is only paused), just
            collapsed so the officer sees the data, not the frozen frame. */}
        <div
          id={READER_ID}
          style={lookup
            ? { height: 0, overflow: 'hidden' }
            : { maxWidth: 360, marginTop: scanning ? 16 : 0 }}
        />
      </div>

      <div ref={resultRef} />

      {error && <div className="card error">{error}</div>}

      {lookup && (
        <div className="card">
          <div style={{ display: 'flex', gap: 20 }}>
            <img
              className="scan-result-photo"
              src={api.fileUrl(lookup.photoUrl)}
              alt="Applicant"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            />
            <div>
              <h2>{lookup.applicantName}</h2>
              <p>Vehicle: <strong>{lookup.vehicleNumber}</strong> ({lookup.vehicleType})</p>
              <p>Persons traveling: {lookup.numPersonsTraveling}</p>
              {renderExtra?.(lookup)}
              <p>Status: <span className={`status-pill status-${status}`}>{statusLabels[status] || status}</span></p>
            </div>
          </div>

          {mismatch && <div className="gate-mismatch">⚠ {mismatchMessage}</div>}

          {message && <div className="success">{message}</div>}

          <div style={{ marginTop: 12 }}>
            {lookup.nextAction ? (
              <button className="primary" disabled={busy} onClick={() => verify(lookup.nextAction)}>
                {busy ? 'Submitting…' : `Verify & Mark ${statusLabels[lookup.nextAction] || lookup.nextAction}`}
              </button>
            ) : (
              <p style={{ color: '#666' }}>No further action available for this permit.</p>
            )}
            <button className="secondary" style={{ marginLeft: 10 }} onClick={scanNext}>Scan Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
