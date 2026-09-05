import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { qrTokenToPngBuffer } from './qr.js';

const TAMIL_FONT = path.resolve('src/fonts/NotoSansTamil-Regular.ttf');
const EMBLEM_PATH = path.resolve('src/assets/tn-police-emblem.png');
const INK = '#0b1f4b';

// Fixed for this event; make this a per-registration field if the template
// is ever reused for a different function.
const EVENT_TITLE_TA = 'இமானுவேல் சேகரன் நினைவு நாள் : 11.09.2026';

/**
 * Renders the TN Police vehicle permit as a landscape PDF, matching the
 * paper sample: emblem + title bar, event banner, then a label/value field
 * block (entry-route list beside the signature block, as in the sample),
 * with the QR code filling the "வாகன அனுமதி எண்" box in place of a
 * hand-written permit number.
 *
 * All vertical positions are computed from what was actually drawn above
 * them (nothing is placed at a fixed absolute Y), so the card border and
 * footer always land after the real content instead of overlapping it.
 *
 * @param {object} reg - joined registration + station + entry-point row
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
    const margin = 40;
    const cardX = margin;
    const cardW = pageW - margin * 2;
    const cardTop = 36;
    const innerX = cardX + 26;
    const innerW = cardW - 52;

    let y = cardTop + 20;

    // --- Top row: vehicle no. (left) / emblem (center) / permit-no. box with QR (right) ---
    const qrBoxW = 100;
    const qrBoxX = cardX + cardW - 26 - qrBoxW;
    doc.fontSize(11).text(`வாகன எண். : ${reg.vehicle_number}`, innerX, y);
    doc.fontSize(10).text('வாகன அனுமதி எண்.', qrBoxX - 20, y, { width: qrBoxW + 40, align: 'center' });

    if (fs.existsSync(EMBLEM_PATH)) {
      doc.image(EMBLEM_PATH, pageW / 2 - 32, y - 6, { width: 64 });
    }

    const qrBoxTop = y + 18;
    doc.rect(qrBoxX, qrBoxTop, qrBoxW, qrBoxW).lineWidth(1).stroke(INK);
    doc.image(qrPng, qrBoxX + 5, qrBoxTop + 5, { width: qrBoxW - 10 });

    y = qrBoxTop + qrBoxW + 18;

    // --- Title ---
    doc.fontSize(24).text('தமிழ்நாடு காவல்துறை', cardX, y, { width: cardW, align: 'center' });
    y += 32;
    doc.fontSize(14).text('வாகன அனுமதி சீட்டு', cardX, y, { width: cardW, align: 'center' });
    y += 24;

    doc.moveTo(cardX, y).lineTo(cardX + cardW, y).lineWidth(1.2).stroke(INK);
    y += 14;

    // --- Event banner ---
    doc.fontSize(18).text(EVENT_TITLE_TA, cardX, y, { width: cardW, align: 'center' });
    y += 30;

    doc.moveTo(cardX, y).lineTo(cardX + cardW, y).lineWidth(1.2).stroke(INK);
    y += 18;

    // --- Field block ---
    const labelW = 190;
    const colonX = innerX + labelW;
    const valueX = colonX + 20;
    const valueW = innerX + innerW - valueX;
    const rowGap = 30;

    function field(label, value, { gap = rowGap, valueWidth = valueW } = {}) {
      const startY = y;
      doc.fontSize(12).text(label, innerX, y, { width: labelW });
      doc.text(':', colonX, y);
      doc.text(value || '', valueX, y, { width: valueWidth });
      y = startY + gap;
      return startY;
    }

    field('பெயர்', reg.applicant_name);
    field('கைபேசி எண்', reg.applicant_mobile);
    field('மாவட்டம்', reg.district);
    field('உட்கோட்டம் மற்றும்\nகாவல் நிலையம்', reg.station_name, { gap: 42 });

    // Entry route (left) beside the signature block (right), as in the
    // sample — computed side by side so neither one's height can overrun
    // and collide with the other.
    const sigColW = 230;
    const sigColX = innerX + innerW - sigColW;
    const routeColW = sigColX - valueX - 16;

    const rowStartY = y;
    doc.fontSize(12).text('நுழையும் வழி', innerX, y, { width: labelW });
    doc.text(':', colonX, y);
    const entryPoints = reg.all_entry_points || [];
    const entryLines = entryPoints
      .map((name, i) => `${i + 1}. ${name}${i < entryPoints.length - 1 ? ',' : '.'}`)
      .join('\n');
    doc.text(entryLines, valueX, y, { width: routeColW });
    const routeBottom = doc.y;

    doc.fontSize(11)
      .text('காவல் துறை உட்கோட்ட அதிகாரி,', sigColX, rowStartY, { width: sigColW, align: 'center' })
      .text('(கையொப்பம்)', sigColX, doc.y + 6, { width: sigColW, align: 'center' })
      .text('அலுவலக முத்திரை', sigColX, doc.y + 6, { width: sigColW, align: 'center' });
    const sigBottom = doc.y;

    y = Math.max(routeBottom, sigBottom) + 12;

    field('வெளியேறும் வழி', 'அதே வழியில்');

    // --- Footer: what the applicant should carry, printed below the card ---
    doc.fontSize(9).fillColor('#555').text(
      `அனுமதி எண்: ${reg.permit_number}`,
      cardX,
      y + 14,
      { width: cardW, align: 'center' },
    );

    // --- Card border, drawn last now that the real content height is known ---
    const cardBottom = y + 8;
    doc.rect(cardX, cardTop, cardW, cardBottom - cardTop).lineWidth(2).stroke(INK);

    doc.end();
  });
}
