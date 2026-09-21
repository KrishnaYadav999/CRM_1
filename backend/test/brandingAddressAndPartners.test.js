const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('quotation preview and PDF use the Technocraft House address', () => {
  const page = read('../../frontend/src/pages/Quotations.jsx');
  const address = '1st Floor, A/25, Technocraft House, Road No. 3, MIDC, Andheri East, Mumbai, Maharashtra 400093';

  assert.match(page, new RegExp(`const ANANT_TATTVA_ADDRESS = '${address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.match(page, /<p>\{ANANT_TATTVA_ADDRESS\}<\/p>/);
  assert.match(page, /<p>\$\{escapeHtml\(ANANT_TATTVA_ADDRESS\)\}<\/p>/);
  assert.doesNotMatch(page, /Midas Building|Sahar Plaza|400059/);
});

test('homepage partnership carousel excludes the retired Vadilal artwork', () => {
  const page = read('../../frontend/src/pages/LandingPage.jsx');

  assert.match(page, /\.filter\(\(client\) => client !== 3\)/);
  assert.match(page, /aria-label="All 53 client logos/);
});
