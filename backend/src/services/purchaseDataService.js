const crypto = require('node:crypto');

const PURCHASE_CHECKLIST_PARTICULARS = [
  'Received from client',
  'Partially Data received',
  'Complete Data Received',
  'Work In Process',
  'Ready to upload',
  'Partially Complete',
  'Nil Upload',
  'Client Approval on data',
  'Upload Complete'
];

const CATEGORIES = ['Cat-I', 'Cat-II', 'Cat-III', 'Cat-IV'];
const HEADER_ALIASES = {
  financialYear: ['financialyear', 'fy'],
  entityName: ['nameofentity', 'entityname', 'nameoftheentity'],
  registrationType: ['registrationtype', 'registrationstatus', 'registeredunregistered'],
  gstin: ['gstin', 'gstnumber', 'gstno'],
  invoiceNumber: ['invoicenumber', 'invoiceno'],
  invoiceDate: ['invoicedate'],
  portalReferenceNumber: ['portalreferencenumber', 'portalreferenceno', 'portalrefno'],
  plasticCategory: ['categoryofplastic', 'plasticcategory', 'category'],
  materialType: ['plasticmaterialtype', 'materialtype', 'typeofplasticmaterial'],
  baseQuantity: ['quantitytpa', 'quantity', 'purchasequantity', 'plasticquantitytpa', 'totalquantitytpa'],
  portalQuantity: ['totalplasticqtytons', 'totalplasticqtyton', 'totalplasticqty', 'plasticquantitytons', 'uploadedquantity', 'quantitytpa'],
  gstPaid: ['gstpaid', 'gstamount'],
  state: ['state', 'stateut'],
  uploadStatus: ['uploadstatus', 'status'],
  uploadDate: ['uploaddate', 'portaluploaddate'],
  remarks: ['remarks', 'remark', 'notes']
};

function text(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function normalizeHeader(value) { return text(value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function normalizeEntityName(value) {
  return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(private|pvt|limited|ltd|llp)\b/g, '').replace(/\s+/g, ' ').trim();
}
function normalizeMaterial(value) {
  const normalized = text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bplastic\b/g, '').trim();
  const aliases = { polyethyleneterephthalate: 'pet', highdensitypolyethylene: 'hdpe', lowdensitypolyethylene: 'ldpe', polypropylene: 'pp' };
  const joined = normalized.replace(/\s+/g, '');
  return aliases[joined] || normalized;
}
function normalizeRegistrationType(value) {
  const normalized = normalizeHeader(value);
  if (normalized.includes('unregistered') || normalized.includes('unregister')) return 'Unregistered';
  if (normalized === 'registered' || normalized === 'register') return 'Registered';
  return '';
}
function normalizeCategory(value) {
  const normalized = normalizeHeader(value).replace(/^category/, 'cat');
  if (['cati', 'cat1'].includes(normalized)) return 'Cat-I';
  if (['catii', 'cat2'].includes(normalized)) return 'Cat-II';
  if (['catiii', 'cat3'].includes(normalized)) return 'Cat-III';
  if (['cativ', 'cat4'].includes(normalized)) return 'Cat-IV';
  return '';
}
function parseNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}
function parseDate(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  const raw = text(value);
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
function validFinancialYear(value) { return /^20\d{2}-\d{2}$/.test(text(value)); }
function validGstin(value) { return !value || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(text(value)); }

function buildHeaderMap(row = {}, source = 'base') {
  const keys = Object.keys(row);
  const map = {};
  keys.forEach((header) => {
    const normalized = normalizeHeader(header);
    Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
      if (map[field] || !aliases.includes(normalized)) return;
      if (field === 'baseQuantity' && source !== 'base') return;
      if (field === 'portalQuantity' && source !== 'portal') return;
      map[field] = header;
    });
  });
  return map;
}

function duplicateKey(row, source) {
  if (source === 'portal' && row.portalReferenceNumber) return [row.financialYear, row.portalReferenceNumber.toLowerCase()].join('|');
  const common = [row.financialYear, row.entityKey, row.gstin.toLowerCase(), row.plasticCategory, row.materialKey];
  if (source === 'base') common.splice(3, 0, row.invoiceNumber.toLowerCase());
  else common.push(String(row.quantity));
  return common.join('|');
}

function normalizePurchaseRows(rawRows = [], source = 'base', selectedYear = '') {
  const usableRows = (Array.isArray(rawRows) ? rawRows : []).filter((row) => row && typeof row === 'object' && Object.values(row).some((value) => text(value)));
  if (!usableRows.length) {
    const error = new Error('The selected file has no usable purchase rows.'); error.code = 'EMPTY_FILE'; throw error;
  }
  const headerMap = buildHeaderMap(usableRows[0], source);
  const quantityField = source === 'base' ? 'baseQuantity' : 'portalQuantity';
  const required = ['financialYear', 'entityName', 'registrationType', 'plasticCategory', 'materialType', quantityField];
  const missingHeaders = required.filter((field) => !headerMap[field]);
  if (missingHeaders.length) {
    const error = new Error(`Missing required headers: ${missingHeaders.join(', ')}`); error.code = 'MISSING_HEADERS'; error.missingHeaders = missingHeaders; throw error;
  }
  const seen = new Set();
  const validationErrors = [];
  const normalizedRows = usableRows.map((original, index) => {
    const read = (field) => headerMap[field] ? original[headerMap[field]] : '';
    const financialYear = text(read('financialYear'));
    const entityName = text(read('entityName'));
    const registrationType = normalizeRegistrationType(read('registrationType'));
    const gstin = text(read('gstin')).toUpperCase();
    const plasticCategory = normalizeCategory(read('plasticCategory'));
    const materialType = text(read('materialType'));
    const quantity = parseNumber(read(quantityField));
    const gstValue = read('gstPaid');
    const gstPaid = gstValue === '' || gstValue === null || gstValue === undefined ? 0 : parseNumber(gstValue);
    const rawDate = source === 'base' ? read('invoiceDate') : read('uploadDate');
    const parsedDate = parseDate(rawDate);
    const messages = [];
    const add = (field, message, severity = 'error') => { messages.push({ field, message, severity }); validationErrors.push({ rowNumber: index + 2, field, value: read(field), message, severity }); };
    if (!validFinancialYear(financialYear)) add('financialYear', 'Financial Year must use YYYY-YY.');
    else if (selectedYear && financialYear !== selectedYear) add('financialYear', `Financial Year must match ${selectedYear}.`);
    if (!entityName) add('entityName', 'Name of Entity is required.');
    else if (entityName.length > 200) add('entityName', 'Name of Entity is too long.');
    if (!registrationType) add('registrationType', 'Registration Type must be Registered or Unregistered.');
    if (gstin && !validGstin(gstin)) add('gstin', 'GSTIN format is invalid.');
    if (registrationType === 'Registered' && !gstin) add('gstin', 'GSTIN is recommended for Registered entities.', 'warning');
    if (!plasticCategory) add('plasticCategory', 'Category must be Cat-I, Cat-II, Cat-III or Cat-IV.');
    if (!materialType) add('materialType', 'Plastic Material Type is required.');
    if (quantity === null) add(quantityField, 'Quantity must be numeric.');
    else if (quantity < 0) add(quantityField, 'Quantity cannot be negative.');
    else if (quantity === 0) add(quantityField, 'Zero quantity should be reviewed.', 'warning');
    if (gstPaid === null) add('gstPaid', 'GST Paid must be numeric.');
    else if (gstPaid < 0) add('gstPaid', 'GST Paid cannot be negative.');
    if (rawDate !== '' && !parsedDate) add(source === 'base' ? 'invoiceDate' : 'uploadDate', 'Date is invalid.');
    const row = {
      rowNumber: index + 2, financialYear, entityName, entityKey: normalizeEntityName(entityName), registrationType, gstin,
      invoiceNumber: text(read('invoiceNumber')), invoiceDate: source === 'base' ? parsedDate : '',
      portalReferenceNumber: text(read('portalReferenceNumber')), plasticCategory, materialType, materialKey: normalizeMaterial(materialType),
      quantity: quantity ?? 0, gstPaid: gstPaid ?? 0, state: text(read('state')), uploadStatus: text(read('uploadStatus')),
      uploadDate: source === 'portal' ? parsedDate : '', remarks: text(read('remarks')), source, original, validationMessages: messages.map((item) => item.message)
    };
    const hasError = messages.some((item) => item.severity === 'error');
    const key = duplicateKey(row, source);
    if (!hasError && seen.has(key)) {
      add('duplicate', 'Exact duplicate row found in this file.');
      row.validationMessages.push('Exact duplicate row found in this file.');
      row.validationStatus = 'Duplicate';
    } else {
      if (!hasError) seen.add(key);
      row.validationStatus = hasError ? 'Invalid' : messages.length ? 'Warning' : 'Valid';
    }
    return row;
  });
  const acceptedRows = normalizedRows.filter((row) => ['Valid', 'Warning'].includes(row.validationStatus));
  return {
    headerMap, normalizedRows, acceptedRows, validationErrors,
    totalRows: normalizedRows.length,
    validRowCount: normalizedRows.filter((row) => row.validationStatus === 'Valid').length,
    warningRowCount: normalizedRows.filter((row) => row.validationStatus === 'Warning').length,
    invalidRowCount: normalizedRows.filter((row) => row.validationStatus === 'Invalid').length,
    duplicateRowCount: normalizedRows.filter((row) => row.validationStatus === 'Duplicate').length,
    totalQuantity: acceptedRows.reduce((sum, row) => sum + row.quantity, 0),
    totalGst: acceptedRows.reduce((sum, row) => sum + row.gstPaid, 0)
  };
}

function metric() { return { baseQty: 0, portalQty: 0, qtyDiff: 0, baseGst: 0, portalGst: 0, gstDiff: 0, result: 'Matched' }; }
function addRow(target, row) {
  if (row.source === 'base') { target.baseQty += row.quantity; target.baseGst += row.gstPaid; }
  else { target.portalQty += row.quantity; target.portalGst += row.gstPaid; }
}
function finishMetric(value, tolerance = 0.001) {
  value.qtyDiff = value.baseQty - value.portalQty;
  value.gstDiff = value.baseGst - value.portalGst;
  if (!value.portalQty && value.baseQty) value.result = 'Missing on Portal';
  else if (!value.baseQty && value.portalQty) value.result = 'Extra on Portal';
  else if (value.qtyDiff > tolerance) value.result = 'Short Upload';
  else if (value.qtyDiff < -tolerance) value.result = 'Excess Upload';
  else if (Math.abs(value.gstDiff) > 0.01) value.result = 'GST Mismatch';
  else value.result = 'Matched';
  return value;
}

function reconcilePurchaseRows(baseRows = [], portalRows = [], tolerance = 0.001) {
  const rows = [...baseRows, ...portalRows].filter((row) => ['Valid', 'Warning'].includes(row.validationStatus));
  const categorySummary = Object.fromEntries(CATEGORIES.map((category) => [category, { Registered: metric(), Unregistered: metric(), materials: {} }]));
  const entities = { Registered: new Map(), Unregistered: new Map() };
  const matchGroups = new Map();
  rows.forEach((row) => {
    if (!CATEGORIES.includes(row.plasticCategory) || !['Registered', 'Unregistered'].includes(row.registrationType)) return;
    addRow(categorySummary[row.plasticCategory][row.registrationType], row);
    const materialBucket = categorySummary[row.plasticCategory].materials[row.materialKey] ||= { label: row.materialType, Registered: metric(), Unregistered: metric() };
    addRow(materialBucket[row.registrationType], row);
    const entityKey = row.registrationType === 'Registered' && row.gstin ? `gst:${row.gstin}` : `name:${row.entityKey}`;
    const entityBucket = entities[row.registrationType].get(entityKey) || { name: row.entityName, gstin: row.gstin, ...metric() };
    addRow(entityBucket, row); entities[row.registrationType].set(entityKey, entityBucket);
    const matchKey = [row.registrationType, entityKey, row.plasticCategory, row.materialKey].join('|');
    const matchBucket = matchGroups.get(matchKey) || { entity: row.entityName, gstin: row.gstin, category: row.plasticCategory, material: row.materialType, ...metric() };
    addRow(matchBucket, row); matchGroups.set(matchKey, matchBucket);
  });
  Object.values(categorySummary).forEach((category) => {
    finishMetric(category.Registered, tolerance); finishMetric(category.Unregistered, tolerance);
    Object.values(category.materials).forEach((material) => { finishMetric(material.Registered, tolerance); finishMetric(material.Unregistered, tolerance); });
  });
  const entitySummary = {
    Registered: [...entities.Registered.values()].map((item) => finishMetric(item, tolerance)).sort((a, b) => a.name.localeCompare(b.name)),
    Unregistered: [...entities.Unregistered.values()].map((item) => finishMetric(item, tolerance)).sort((a, b) => a.name.localeCompare(b.name))
  };
  const issues = [];
  [...baseRows, ...portalRows].filter((row) => ['Invalid', 'Duplicate'].includes(row.validationStatus)).forEach((row) => {
    issues.push({ issue: `${row.validationStatus} Row`, severity: 'blocking', source: row.source, rowNumber: row.rowNumber, entity: row.entityName, gstin: row.gstin, category: row.plasticCategory, material: row.materialType, baseQty: row.source === 'base' ? row.quantity : 0, portalQty: row.source === 'portal' ? row.quantity : 0, difference: row.validationMessages.join('; ') });
  });
  matchGroups.forEach((group) => {
    finishMetric(group, tolerance);
    if (group.result === 'Matched') return;
    const blocking = ['Missing on Portal', 'Extra on Portal'].includes(group.result);
    issues.push({ issue: group.result, severity: blocking ? 'blocking' : 'warning', source: blocking ? (group.baseQty ? 'base' : 'portal') : 'both', rowNumber: '', entity: group.entity, gstin: group.gstin, category: group.category, material: group.material, baseQty: group.baseQty, portalQty: group.portalQty, difference: group.qtyDiff, gstDifference: group.gstDiff });
  });
  const totals = finishMetric(rows.reduce((total, row) => { addRow(total, row); return total; }, metric()), tolerance);
  return {
    tolerance, totals, categorySummary, entitySummary, issues,
    blockingIssueCount: issues.filter((issue) => issue.severity === 'blocking').length,
    warningIssueCount: issues.filter((issue) => issue.severity === 'warning').length,
    matchingEntities: [...entitySummary.Registered, ...entitySummary.Unregistered].filter((item) => item.result === 'Matched').length,
    unmatchedEntities: [...entitySummary.Registered, ...entitySummary.Unregistered].filter((item) => item.result !== 'Matched').length
  };
}

function defaultChecklist(existing = []) {
  const map = new Map((Array.isArray(existing) ? existing : []).map((row) => [text(row.particular).toLowerCase(), row]));
  return PURCHASE_CHECKLIST_PARTICULARS.map((particular) => {
    const row = map.get(particular.toLowerCase()) || {};
    return { particular, yesNo: ['Yes', 'No'].includes(row.yesNo) ? row.yesNo : '', date: /^\d{4}-\d{2}-\d{2}$/.test(row.date || '') ? row.date : '', files: Array.isArray(row.files) ? row.files : [], remarks: text(row.remarks) };
  });
}
function checklistRow(purchase, name) { return defaultChecklist(purchase?.checklist).find((row) => row.particular === name) || {}; }
function purchaseReadiness(purchase = {}) {
  const checklist = defaultChecklist(purchase.checklist);
  const nilRow = checklist.find((row) => row.particular === 'Nil Upload') || {};
  const uploadRow = checklist.find((row) => row.particular === 'Upload Complete') || {};
  const receivedRow = checklist.find((row) => row.particular === 'Received from client') || {};
  const yesRows = checklist.filter((row) => row.yesNo === 'Yes');
  const errors = [
    ...yesRows.filter((row) => !row.date).map((row) => `${row.particular}: date is required.`),
    ...yesRows.filter((row) => !row.files.length).map((row) => `${row.particular}: proof is required.`)
  ];
  const nilUpload = nilRow.yesNo === 'Yes';
  if (nilUpload) {
    if (!nilRow.remarks) errors.push('Nil Upload remarks or reason is required.');
    if (!purchase.screenshots?.length) errors.push('Upload All Screenshot evidence is required for Nil Upload.');
  } else {
    if (uploadRow.yesNo !== 'Yes') errors.push("Upload Complete must be Yes.");
    if (!receivedRow.date) errors.push('Received from client date is required.');
    if (!uploadRow.date) errors.push('Upload Complete date is required.');
    if (!purchase.baseUpload || purchase.baseUpload.importStatus !== 'Imported') errors.push('Purchase Base Data is required.');
    if (!purchase.portalUpload || purchase.portalUpload.importStatus !== 'Imported') errors.push('Purchase Portal Upload is required.');
    if (purchase.reconciliation?.blockingIssueCount > 0) errors.push('Blocking reconciliation issues must be resolved.');
  }
  return { ready: errors.length === 0, errors, nilUpload, startDate: receivedRow.date || '', endDate: uploadRow.date || '', warningIssueCount: purchase.reconciliation?.warningIssueCount || 0 };
}
function calculatePurchaseStatus(purchase = {}) {
  if (purchase.complianceVerificationStatus === 'Approved') return 'Fully Approved';
  if (purchase.complianceVerificationStatus === 'Rejected') return 'Compliance Rework Required';
  if (purchase.managerVerificationStatus === 'Approved') return 'Manager Approved';
  if (purchase.managerVerificationStatus === 'Rejected') return 'Rework Required';
  const readiness = purchaseReadiness(purchase);
  if (readiness.nilUpload) return 'Nil Upload';
  if (purchase.baseUpload && purchase.portalUpload) return 'Completed';
  if (purchase.baseUpload || purchase.portalUpload) return 'Partially Uploaded';
  return 'Pending';
}
function checksum(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

module.exports = {
  PURCHASE_CHECKLIST_PARTICULARS, CATEGORIES, normalizeHeader, normalizeEntityName, normalizeMaterial, normalizeRegistrationType,
  normalizeCategory, parseNumber, parseDate, buildHeaderMap, normalizePurchaseRows, reconcilePurchaseRows, defaultChecklist,
  checklistRow, purchaseReadiness, calculatePurchaseStatus, checksum
};
