import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { qrTokenToPngBuffer } from './qr.js';

const TAMIL_FONT = path.resolve('src/fonts/NotoSansTamil-Regular.ttf');
const EMBLEM_PATH = path.resolve('src/assets/policelogo.jpg');
const INK = '#0b1f4b';

// Fixed for this event; make this a per-registration field if the template
// is ever reused for a different function.
const EVENT_TITLE_TA = 'இமானுவேல் சேகரன் நினைவு நாள் : 11.09.2026';

/**
 * Renders the TN Police vehicle permit as a landscape A4 PDF, split down the
 * middle: the left half carries the permit details (applicant, station, the
 * one allowed entry/exit route for this vehicle), the right half is a large
 * QR code with the permit number and signature block beneath it.
 *
 * Left-side vertical positions flow from `doc.y` after each block (nothing is
 * placed at a fixed absolute Y), so the content can't overrun; the right side
 * is laid out from the top for the QR and pinned to the bottom for the
 * signature.
 *
 * @param {object} reg - joined registration row; needs entry_point_name and station_name
 * @returns {Promise<Buffer>}
 */
export async function renderPermitPdf(reg) {
  const qrPng = await qrTokenToPngBuffer(reg.qr_token);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Tamil', TAMIL_FONT);
    doc.font('Tamil').fillColor(INK);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 28;
    const cardX = margin;
    const cardY = margin;
    const cardW = pageW - margin * 2;
    const cardH = pageH - margin * 2;
    const pad = 22;

    // Card border + centre divider (left 58% details, right 42% QR).
    doc.rect(cardX, cardY, cardW, cardH).lineWidth(2).stroke(INK);
    const dividerX = cardX + Math.round(cardW * 0.58);
    doc.moveTo(dividerX, cardY).lineTo(dividerX, cardY + cardH).lineWidth(1).stroke(INK);

    // ---------------- LEFT: details ----------------
    const lx = cardX + pad;
    const lw = dividerX - cardX - pad * 2;
    let y = cardY + pad;

    if (fs.existsSync(EMBLEM_PATH)) {
      doc.image(EMBLEM_PATH, lx, y, { width: 52 });
    }
    doc.fontSize(18).text('தமிழ்நாடு காவல்துறை', lx + 64, y + 2, { width: lw - 64 });
    doc.fontSize(12).text('வாகன அனுமதி சீட்டு', lx + 64, doc.y + 4, { width: lw - 64 });
    y = Math.max(y + 52, doc.y) + 10;

    doc.moveTo(lx, y).lineTo(lx + lw, y).lineWidth(1).stroke(INK);
    y += 12;

    doc.fontSize(13).text(EVENT_TITLE_TA, lx, y, { width: lw, align: 'center' });
    y = doc.y + 10;

    doc.moveTo(lx, y).lineTo(lx + lw, y).lineWidth(1).stroke(INK);
    y += 14;

    // Label / value rows. Both sides are measured so a wrapped value can't
    // collide with the next row.
    const labelW = 128;
    const valueX = lx + labelW + 12;
    const valueW = lx + lw - valueX;

    function field(label, value, { gap = 12 } = {}) {
      const startY = y;
      doc.fontSize(11).text(label, lx, startY, { width: labelW });
      const labelBottom = doc.y;
      doc.text(':', lx + labelW, startY);
      doc.text(value || '—', valueX, startY, { width: valueW });
      y = Math.max(labelBottom, doc.y) + gap;
    }

    field('வாகன எண்', reg.vehicle_number);
    field('பெயர்', reg.applicant_name);
    field('கைபேசி எண்', reg.applicant_mobile);
    field('மாவட்டம்', reg.district);
    field('உட்கோட்டம் / காவல் நிலையம்', reg.station_name);
    field('பயணிகள் எண்ணிக்கை', String(reg.num_persons_traveling ?? 1));
    field('நுழையும் வழி', reg.entry_point_name);
    field('வெளியேறும் வழி', 'அதே வழியில்');

    // ---------------- RIGHT: QR + permit number + signature ----------------
    const rx = dividerX + pad;
    const rw = cardX + cardW - pad - rx;
    let ry = cardY + pad + 4;

    doc.fontSize(12).text('வாகன அனுமதி எண்', rx, ry, { width: rw, align: 'center' });
    ry = doc.y + 10;

    const qrSize = Math.min(rw, 250);
    const qrX = rx + (rw - qrSize) / 2;
    doc.rect(qrX, ry, qrSize, qrSize).lineWidth(1).stroke(INK);
    doc.image(qrPng, qrX + 6, ry + 6, { width: qrSize - 12 });
    ry += qrSize + 14;

    doc.fontSize(13).text(reg.permit_number, rx, ry, { width: rw, align: 'center' });
    ry = doc.y + 4;
    doc.fontSize(9).fillColor('#555')
      .text('இந்த QR குறியீட்டை நுழைவு வாயிலில் காட்டவும்', rx, ry, { width: rw, align: 'center' });
    doc.fillColor(INK);

    // Signature block pinned near the bottom of the card.
    const sigTop = cardY + cardH - pad - 46;
    doc.fontSize(10)
      .text('காவல் துறை உட்கோட்ட அதிகாரி', rx, sigTop, { width: rw, align: 'center' })
      .text('(கையொப்பம் / அலுவலக முத்திரை)', rx, doc.y + 6, { width: rw, align: 'center' });

    doc.end();
  });
}
