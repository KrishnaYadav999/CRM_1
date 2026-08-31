import * as XLSX from '../../frontend/node_modules/xlsx/xlsx.mjs';
import fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

XLSX.set_fs(fsSync);

const outputDir = new URL('./', import.meta.url);
const outputPath = new URL('CRM_Lead_Bulk_Upload_Template_With_Dummy_Data.xlsx', outputDir);
const outputFile = fileURLToPath(outputPath);

const headers = [
  'Communication Mode', 'Lead ID', 'Status', 'Company', 'Industry', 'Service Category', 'Business Category', 'Applicant Type', 'Sub Applicant Type',
  'Services Offered', 'Applicable Services', 'Financial Year', 'Address', 'Address Line 2', 'Address Line 3', 'Landmark',
  'State', 'City', 'PIN', 'Existing Client', 'Website', 'Salutation', 'Contact Person', 'Designation', 'Email',
  'Emails Sent Count', 'Last Email Sent', 'Mobile 1', 'Mobile 2', 'WhatsApp No', 'LinkedIn URL', 'Business Card URL', 'Referred By', 'Source', 'Notes',
  'Assigned To', 'Assigned By', 'Created By', 'Lead Date', 'Next Follow-Up Date', 'Next Follow-Up Time',
  'Follow-Up Remarks', 'Form Started At', 'Assign Reached At', 'Submitted At', 'Lead Fill Duration', 'Created At', 'Updated At'
];

const blankSystemFields = {
  'Lead ID': '', 'Emails Sent Count': 0, 'Last Email Sent': '', 'Business Card URL': '',
  'Assigned To': '', 'Assigned By': '', 'Created By': '', 'Form Started At': '',
  'Assign Reached At': '', 'Submitted At': '', 'Lead Fill Duration': '', 'Created At': '', 'Updated At': ''
};

const rows = [
  {
    ...blankSystemFields,
    'Communication Mode': 'Referral', Status: 'Potential - Unregistered', Company: 'DEMO GREEN PACKAGING PRIVATE LIMITED', Industry: 'Packaging Manufacture',
    'Service Category': 'EPR - Plastic Waste', 'Business Category': 'EPR Consultancy', 'Applicant Type': 'PIBO', 'Sub Applicant Type': 'Producer',
    'Services Offered': 'New Registration', 'Applicable Services': 'Registration', 'Financial Year': '2025-26',
    Address: '101 Demo Industrial Estate', 'Address Line 2': 'Phase 1', 'Address Line 3': '', Landmark: 'Near Sample Circle',
    State: 'Gujarat', City: 'Ahmedabad', PIN: '380015', 'Existing Client': 'No', Website: 'https://greenpackaging.example.com',
    Salutation: 'Mr.', 'Contact Person': 'Demo Contact One', Designation: 'Compliance Manager', Email: 'contact.one@example.com',
    'Mobile 1': '0000000000', 'Mobile 2': '', 'WhatsApp No': '0000000000', 'LinkedIn URL': '', 'Referred By': 'Demo Referral', Source: 'Referral',
    Notes: 'DUMMY DATA — replace before upload.', 'Lead Date': '2026-08-20', 'Next Follow-Up Date': '2026-08-25', 'Next Follow-Up Time': '11:00',
    'Follow-Up Remarks': 'Demo follow-up for registration requirement.'
  },
  {
    ...blankSystemFields,
    'Communication Mode': 'Referral', Status: 'Potential - Unregistered', Company: 'DEMO GREEN PACKAGING PRIVATE LIMITED', Industry: 'Packaging Manufacture',
    'Service Category': 'EPR - Plastic Waste', 'Business Category': 'EPR Consultancy', 'Applicant Type': 'PIBO', 'Sub Applicant Type': 'Producer',
    'Services Offered': 'Annual Return Filling', 'Applicable Services': 'Annual Return', 'Financial Year': '2025-26',
    Address: '101 Demo Industrial Estate', 'Address Line 2': 'Phase 1', 'Address Line 3': '', Landmark: 'Near Sample Circle',
    State: 'Gujarat', City: 'Ahmedabad', PIN: '380015', 'Existing Client': 'No', Website: 'https://greenpackaging.example.com',
    Salutation: 'Mr.', 'Contact Person': 'Demo Contact One', Designation: 'Compliance Manager', Email: 'contact.one@example.com',
    'Mobile 1': '0000000000', 'Mobile 2': '', 'WhatsApp No': '0000000000', 'LinkedIn URL': '', 'Referred By': 'Demo Referral', Source: 'Referral',
    Notes: 'DUMMY DATA — same company repeats to add a second service row.', 'Lead Date': '2026-08-20', 'Next Follow-Up Date': '2026-08-25', 'Next Follow-Up Time': '11:30',
    'Follow-Up Remarks': 'Demo follow-up for annual return requirement.'
  },
  {
    ...blankSystemFields,
    'Communication Mode': 'Web Database', Status: 'Potential - Registered', Company: 'DEMO RETAIL BRANDS LIMITED', Industry: 'Consumer Goods',
    'Service Category': 'EPR - Plastic Waste', 'Business Category': 'EPR Consultancy', 'Applicant Type': 'PIBO', 'Sub Applicant Type': 'Brand Owner',
    'Services Offered': 'Annual Return Filling', 'Applicable Services': 'Annual Return', 'Financial Year': '2024-25',
    Address: '22 Example Business Park', 'Address Line 2': 'Andheri East', 'Address Line 3': '', Landmark: 'Opposite Demo Metro',
    State: 'Maharashtra', City: 'Mumbai', PIN: '400001', 'Existing Client': 'Yes', Website: 'https://retailbrands.example.com',
    Salutation: 'Ms.', 'Contact Person': 'Demo Contact Two', Designation: 'Compliance Officer', Email: 'contact.two@example.com',
    'Mobile 1': '0000000000', 'Mobile 2': '', 'WhatsApp No': '0000000000', 'LinkedIn URL': '', 'Referred By': '', Source: 'Website',
    Notes: 'DUMMY DATA — replace before upload.', 'Lead Date': '2026-08-19', 'Next Follow-Up Date': '2026-08-26', 'Next Follow-Up Time': '14:30',
    'Follow-Up Remarks': 'Demo discussion regarding annual return filing.'
  },
  {
    ...blankSystemFields,
    'Communication Mode': 'TeleCalling', Status: 'Potential - Unregistered', Company: 'DEMO IMPORT SOLUTIONS LLP', Industry: 'Manufacturing',
    'Service Category': 'EPR - Plastic Waste', 'Business Category': 'EPR Consultancy', 'Applicant Type': 'PIBO', 'Sub Applicant Type': 'Importer',
    'Services Offered': 'New Registration', 'Applicable Services': 'Registration', 'Financial Year': '2026-27',
    Address: '8 Sample Technology Layout', 'Address Line 2': 'Whitefield', 'Address Line 3': '', Landmark: 'Near Example Gate',
    State: 'Karnataka', City: 'Bengaluru', PIN: '560001', 'Existing Client': 'No', Website: 'https://importsolutions.example.com',
    Salutation: 'Mr.', 'Contact Person': 'Demo Contact Three', Designation: 'Director', Email: 'contact.three@example.com',
    'Mobile 1': '0000000000', 'Mobile 2': '', 'WhatsApp No': '0000000000', 'LinkedIn URL': '', 'Referred By': '', Source: 'Cold Call',
    Notes: 'DUMMY DATA — replace before upload.', 'Lead Date': '2026-08-18', 'Next Follow-Up Date': '2026-08-27', 'Next Follow-Up Time': '10:15',
    'Follow-Up Remarks': 'Demo follow-up for importer registration.'
  }
];

const helpRows = headers.map((field) => ({
  Field: field,
  Required: field === 'Company' ? 'Yes' : 'No (draft import)',
  Guidance: field === 'Company' ? 'Required. Repeated company names append service rows to one lead.'
    : field === 'PIN' ? 'Use exactly 6 digits. Keep this Excel column formatted as Text.'
      : field === 'Assigned To' ? 'Optional. Enter an exact existing CRM staff name.'
        : field === 'Created By' ? 'Optional. Enter exact active CRM user name, email, or CRM User ID; otherwise leave blank.'
          : field === 'Lead ID' ? 'Leave blank for new leads; CRM generates the Lead ID.'
            : ['Industry', 'Service Category', 'Business Category', 'Applicant Type', 'Sub Applicant Type', 'Services Offered', 'Applicable Services', 'Financial Year'].includes(field)
              ? 'Service-row value. Repeat the company name on another row to add another service.'
              : field.includes('Date') || field.endsWith('At') ? 'Use YYYY-MM-DD; time fields use HH:MM.'
                : 'Optional for draft import. Replace dummy values before upload.'
}));

const allowedRows = [
  ['Field', 'Allowed / Example Values'],
  ['Communication Mode', 'TeleCalling | Referral | Physical Visit | Campaign | Existing Client | Web Database | Webinar | Seminar | Exhibition | Associate Reference | Government'],
  ['Status', 'Potential - Registered | Potential - Unregistered | Existing Client | Existing Client - Not Renewed'],
  ['Business Category', 'EPR Consultancy | EPR Credit'],
  ['Applicant Type', 'PIBO'],
  ['Sub Applicant Type', 'Producer | Importer | Brand Owner | Other'],
  ['Existing Client', 'Yes | No'],
  ['Financial Year', '2023-24 through 2029-30'],
  ['Dates', 'YYYY-MM-DD'],
  ['Times', 'HH:MM (24-hour)']
];

const workbook = XLSX.utils.book_new();
const leadSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
leadSheet['!cols'] = headers.map((header) => ({ wch: Math.max(14, Math.min(34, header.length + 4)) }));
leadSheet['!rows'] = [{ hpt: 28 }, ...rows.map(() => ({ hpt: 34 }))];
leadSheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 1}` };
leadSheet['!freeze'] = { xSplit: 4, ySplit: 1, topLeftCell: 'E2', activePane: 'bottomRight', state: 'frozen' };

const helpSheet = XLSX.utils.json_to_sheet(helpRows);
helpSheet['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 90 }];
helpSheet['!autofilter'] = { ref: `A1:C${helpRows.length + 1}` };

const allowedSheet = XLSX.utils.aoa_to_sheet(allowedRows);
allowedSheet['!cols'] = [{ wch: 28 }, { wch: 110 }];

XLSX.utils.book_append_sheet(workbook, leadSheet, 'Lead Import');
XLSX.utils.book_append_sheet(workbook, helpSheet, 'Help');
XLSX.utils.book_append_sheet(workbook, allowedSheet, 'Allowed Values');

await fs.mkdir(outputDir, { recursive: true });
XLSX.writeFile(workbook, outputFile, { compression: true, cellStyles: true });
const verifiedBook = XLSX.readFile(outputFile, { cellText: true });
assert.deepEqual(verifiedBook.SheetNames, ['Lead Import', 'Help', 'Allowed Values']);
const verifiedRows = XLSX.utils.sheet_to_json(verifiedBook.Sheets['Lead Import'], { defval: '' });
assert.equal(verifiedRows.length, 4);
assert.deepEqual(Object.keys(verifiedRows[0]), headers);
assert.equal(verifiedRows.filter((row) => row.Company === 'DEMO GREEN PACKAGING PRIVATE LIMITED').length, 2);
assert.equal(verifiedRows.every((row) => String(row.Notes).includes('DUMMY DATA')), true);
console.log(JSON.stringify({ outputFile, sheets: verifiedBook.SheetNames, headers: headers.length, dummyRows: verifiedRows.length, repeatedCompanyServiceRows: 2 }, null, 2));
