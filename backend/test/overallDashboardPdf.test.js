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
  assert.equal(doc.getNumberOfPages(), 7);
  const content = doc.internal.pages.flat().join('\n');
  for (const label of ['Client portfolio by financial year', 'Client growth trend', 'My team and my clients', '2025-26', '2026-27', '2027-28', 'Service columns 1 of 2', 'Service columns 2 of 2', 'Annual Return', 'Producer']) assert.ok(content.includes(label), label);
  const text = [...content.matchAll(/\(([^()]*)\) Tj/g)].map((match) => match[1]).join(' ');
  assert.ok(text.includes('Annual Return Filling'));
  assert.ok(content.includes('No clients with closed purchase orders'));
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('PDF repeats table headings and splits very long applicant tables across pages', async () => {
  const { createOverallDashboardPdf } = await import('../../frontend/src/utils/overallDashboardPdf.mjs');
  const data = buildOverall([{ clientName: 'One', applicantType: 'PIBO', subApplicantType: 'Producer', financialYear: '2025-26', isClosed: true, services: [{ name: 'Consulting' }] }]);
  data.yearSections[0].groups = Array.from({ length: 80 }, (_, index) => ({ type: `Applicant group ${index}`, count: 1, services: { Consulting: 1 } }));
  const { doc } = await createOverallDashboardPdf(data);
  assert.ok(doc.getNumberOfPages() > 3);
  const pages = doc.internal.pages.slice(2).map((page) => page.join('\n')).filter((page) => page.includes('Applicant / Sub-applicant service matrix'));
  assert.ok(pages.every((page) => page.includes('Applicant / Sub-applicant type')));
  assert.ok(pages.at(-1).includes('Applicant group 79'));
});

test('PDF includes every client and reference with group-specific service icons and repeated headings', async () => {
  const { createOverallDashboardPdf } = await import('../../frontend/src/utils/overallDashboardPdf.mjs');
  const records = Array.from({ length: 65 }, (_, index) => ({ clientName: `Client ${String(index).padStart(3, '0')}`, leadNumber: `ATPL-LEAD-${index}`, applicantType: 'PIBO', subApplicantType: 'Producer', financialYear: '2025-26', isClosed: true, services: [{ name: index % 2 ? 'Consulting' : 'New Registration' }] }));
  records.push({ clientName: 'Unclosed client', subApplicantType: 'Producer', financialYear: '2025-26', isClosed: false, services: [{ name: 'Consulting' }] });
  const data = buildOverall(records, [{ companyKey: 'client 000', status: 'INACTIVE' }]);
  const { doc } = await createOverallDashboardPdf(data);
  const pages = doc.internal.pages.slice(3).map((page) => page.join('\n'));
  const content = pages.join('\n');
  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.includes('Client service details') && page.includes('(Status)')));
  for (let index = 0; index < 65; index++) assert.ok(content.includes(`Client ${String(index).padStart(3, '0')}`));
  assert.ok(content.includes('ATPL-LEAD-64'));
  assert.ok(content.includes('(Inactive)'));
  assert.ok(content.includes('(Active)'));
  assert.ok(!content.includes('Unclosed client'));
  // Both icon backgrounds are drawn as vectors, avoiding unsupported Unicode glyphs.
  assert.ok(content.includes('0.82 0.98 0.9 rg'));
  assert.ok(content.includes('1. 0.95 0.95 rg'));
});
