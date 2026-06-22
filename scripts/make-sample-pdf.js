'use strict';

// Generates data/sample-commission.pdf: a mock manufacturer commission
// statement so the PDF import can be demoed (and tested) without a real file.
// Run: node scripts/make-sample-pdf.js
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const rows = [
  ['A1 Insulation', '184,200', '4,200.50'],
  ['Alpha Lumber Co', '142,500', '3,100.00'],
  ['Celltech', '128,900', '2,750.00'],
  ['Gadsden Building Supply', '96,400', '1,900.25'],
  ['Huntsville Drywall', '74,800', '1,500.00'],
  ['Redstone Contractors', '61,200', '1,200.00'],
  ['NCS', '49,000', '980.00'],
  ['Birmingham Wholesale', '32,100', '640.00'],
  ['Cullman Lumber', '25,500', '510.00'],
  ['Decatur Supply', '15,000', '300.00'],
  ['Madison Roofing', '7,500', '150.00'],
];

(async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const gray = rgb(0.35, 0.35, 0.35);
  const xName = 50; const xSales = 360; const xComm = 470;

  let y = 740;
  page.drawText('SOUDAL USA', { x: xName, y, size: 18, font: bold });
  y -= 20;
  page.drawText('Sales Commission Statement', { x: xName, y, size: 11, font: reg, color: gray });
  y -= 15;
  page.drawText('Rep Agency: Compton Sales    Period: June 2026    Statement #SD-2026-06', { x: xName, y, size: 10, font: reg, color: gray });
  y -= 30;

  page.drawText('Account', { x: xName, y, size: 10, font: bold });
  page.drawText('Net Sales', { x: xSales, y, size: 10, font: bold });
  page.drawText('Commission', { x: xComm, y, size: 10, font: bold });
  y -= 6;
  page.drawLine({ start: { x: xName, y }, end: { x: 545, y }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) });
  y -= 16;

  let totalComm = 0;
  for (const [name, sales, comm] of rows) {
    page.drawText(name, { x: xName, y, size: 10, font: reg });
    page.drawText('$' + sales, { x: xSales, y, size: 10, font: reg });
    page.drawText('$' + comm, { x: xComm, y, size: 10, font: reg });
    totalComm += Number(comm.replace(/,/g, ''));
    y -= 18;
  }

  y -= 4;
  page.drawLine({ start: { x: xName, y }, end: { x: 545, y }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) });
  y -= 16;
  page.drawText('TOTAL', { x: xName, y, size: 10, font: bold });
  page.drawText('$' + totalComm.toLocaleString('en-US', { minimumFractionDigits: 2 }), { x: xComm, y, size: 10, font: bold });

  const bytes = await doc.save();
  const out = path.join(__dirname, '..', 'data', 'sample-commission.pdf');
  fs.writeFileSync(out, bytes);
  console.log('wrote', out);
})().catch((e) => { console.error(e); process.exit(1); });
