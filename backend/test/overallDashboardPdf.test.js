const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOverall } = require('../src/services/overallDashboard');

test('PDF includes both charts, every FY, scope and paginated service columns', async () => {
  const { createOverallDashboardPdf } = await import('../../frontend/src/utils/overallDashboardPdf.mjs');
  const services = ['New Registration', 'Consulting', 'Account Closure', 'Annual Filling', 'Category 1 – EOL', 'Category 2 – EOL', 'Category 3 – EOL', 'Credit Procurement'];
  const data = buildOverall(services.map((name) => ({ clientName: 'Scoped client', applicantType: 'PIBO', subApplicantType: 'Producer', financialYear: '2027-28', isClosed: true, services: [{ name }] })));
  data.visibility = 'team';
  const { doc, filename } = await createOverallDashboardPdf(data, { generatedAt: new Date('2026-10-03T10:00:00Z') });
  assert.equal(filename, 'Overall-Dashboard-2026-10-03.pdf');
  assert.equal(doc.getNumberOfPages(), 5);
  const content = doc.internal.pages.flat().join('\n');
  for (const label of ['Client portfolio by financial year', 'Client growth trend', 'My team and my clients', '2025-26', '2026-27', '2027-28', 'Service columns 1 of 2', 'Service columns 2 of 2', 'Annual Return', 'Producer']) assert.ok(content.includes(label), label);
  const text = [...content.matchAll(/\(([^()]*)\) Tj/g)].map((match) => match[1]).join(' ');
  assert.ok(text.includes('Annual Return Filling / Annual Filling'));
  assert.ok(content.includes('No clients with closed purchase orders'));
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('PDF repeats table headings and splits very long applicant tables across pages', async () => {
  const { createOverallDashboardPdf } = await import('../../frontend/src/utils/overallDashboardPdf.mjs');
  const data = buildOverall([{ clientName: 'One', applicantType: 'PIBO', subApplicantType: 'Producer', financialYear: '2025-26', isClosed: true, services: [{ name: 'Consulting' }] }]);
  data.yearSections[0].groups = Array.from({ length: 80 }, (_, index) => ({ type: `Applicant group ${index}`, count: 1, services: { Consulting: 1 } }));
  const { doc } = await createOverallDashboardPdf(data);
  assert.ok(doc.getNumberOfPages() > 3);
  const pages = doc.internal.pages.slice(2).map((page) => page.join('\n'));
  assert.ok(pages.every((page) => page.includes('Applicant / Sub-applicant type')));
  assert.ok(pages.at(-1).includes('Applicant group 79'));
});
