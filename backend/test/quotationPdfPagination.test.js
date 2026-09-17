const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/utils/quotationPdf.js'), 'utf8');
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('Long quotations preserve content height and break at complete rows', async () => {
  const { quotationPageRanges } = await modulePromise;
  const ranges = quotationPageRanges(2600, 1000, [300, 780, 1080, 1700, 2050, 2400]);
  assert.deepEqual(ranges, [{ start: 0, end: 780 }, { start: 780, end: 1700 }, { start: 1700, end: 2600 }]);
  assert.equal(ranges.reduce((sum, range) => sum + range.end - range.start, 0), 2600);
  assert.ok(ranges.every(({ start, end }) => end > start && end - start <= 1000));
});

test('A block taller than A4 still exports completely without an infinite loop', async () => {
  const { quotationPageRanges } = await modulePromise;
  assert.deepEqual(quotationPageRanges(2500, 1000, []), [{ start: 0, end: 1000 }, { start: 1000, end: 2000 }, { start: 2000, end: 2500 }]);
});

test('Short quotation pages retain their original size without extra pages', async () => {
  const { quotationPageRanges } = await modulePromise;
  assert.deepEqual(quotationPageRanges(750, 1000, [250, 600]), [{ start: 0, end: 750 }]);
  assert.deepEqual(quotationPageRanges(2000, 1000, [1000, 2000]), [{ start: 0, end: 1000 }, { start: 1000, end: 2000 }]);
});
