// Dev utility: renders one certificate with fake data, with no DB required,
// so you can eyeball the layout/font shaping after touching src/services/certificate.js.
// Usage: node scripts/render-sample-certificate.js [output.pdf]
import 'dotenv/config';
import fs from 'node:fs';
import { renderPermitPdf } from '../src/services/certificate.js';

const outPath = process.argv[2] || 'sample-certificate.pdf';

const fakeReg = {
  permit_number: 'ESR26-000001',
  vehicle_number: 'TN 58 AB 1234',
  applicant_name: 'முருகன்',
  applicant_mobile: '9876543210',
  district: 'தஞ்சாவூர்',
  station_name: 'தஞ்சாவூர் நகர்',
  qr_token: 'sample-qr-token-for-preview-only',
  all_entry_points: ['காரைக்குடி', 'சிவகங்கை', 'மானாமதுரை', 'பார்த்திபனூர்', 'பரமக்குடி'],
};

const pdf = await renderPermitPdf(fakeReg);
fs.writeFileSync(outPath, pdf);
console.log(`Wrote ${outPath} (${pdf.length} bytes) — open it in a PDF viewer to check the layout.`);
