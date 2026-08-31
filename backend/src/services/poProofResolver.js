const text = (value) => String(value ?? '').trim();

const URL_FIELDS = [
  'poFileUrl', 'poProofUrl', 'poDocumentUrl', 'poUploadUrl', 'poAttachmentUrl',
  'uploadedDocumentUrl', 'documentUrl', 'fileUrl', 'secureUrl', 'secure_url', 'url'
];

const NAME_FIELDS = [
  'poFileName', 'poProofName', 'poDocumentName', 'poUploadName', 'poAttachmentName',
  'uploadedDocumentName', 'documentName', 'fileName', 'originalName', 'name'
];

const MIME_FIELDS = ['poFileMimeType', 'poProofMimeType', 'mimeType', 'contentType', 'type'];
const SIZE_FIELDS = ['poFileSize', 'poProofSize', 'fileSize', 'bytes', 'size'];

const FILE_FIELDS = [
  'poProof', 'poFile', 'poDocument', 'poUpload', 'poAttachment',
  'uploadedDocument', 'document', 'file', 'attachment'
];

function firstText(source, fields) {
  if (!source || typeof source !== 'object') return '';
  for (const field of fields) {
    const raw = source[field];
    if (raw === null || raw === undefined) continue;
    if (Array.isArray(raw)) continue;
    if (typeof raw === 'object') continue;
    const value = text(raw);
    if (!value) continue;
    if (/\[object/.test(value)) continue;
    return value;
  }
  return '';
}

function resolvePoProof(source = {}, ...fallbacks) {
  const candidates = [source, ...fallbacks].filter((value) => value && typeof value === 'object');
  for (const candidate of candidates) {
    const directUrl = firstText(candidate, URL_FIELDS);
    if (directUrl) return { url: directUrl, name: firstText(candidate, NAME_FIELDS), mimeType: firstText(candidate, MIME_FIELDS), size: firstText(candidate, SIZE_FIELDS) };
    for (const field of FILE_FIELDS) {
      const nested = candidate[field];
      if (!nested || typeof nested !== 'object') continue;
      const nestedUrl = firstText(nested, URL_FIELDS);
      if (nestedUrl) return { url: nestedUrl, name: firstText(nested, NAME_FIELDS) || firstText(candidate, NAME_FIELDS), mimeType: firstText(nested, MIME_FIELDS) || firstText(candidate, MIME_FIELDS), size: firstText(nested, SIZE_FIELDS) || firstText(candidate, SIZE_FIELDS) };
    }
  }
  return { url: '', name: '', mimeType: '', size: '' };
}

function approvalRows(payload = {}) {
  if (Array.isArray(payload.poYearRows)) return payload.poYearRows;
  if (Array.isArray(payload.poRows)) return payload.poRows;
  if (Array.isArray(payload.purchaseOrders)) return payload.purchaseOrders;
  return [];
}

function samePoNumber(left, right) {
  const leftNumber = text(left?.poNumber);
  const rightNumber = text(right?.poNumber);
  return Boolean(leftNumber && rightNumber && leftNumber === rightNumber);
}

function indexedEntryForPo(entries, rowIndex, normalizedRow) {
  const entry = entries[rowIndex];
  if (!entry) return null;
  const expectedPoNumber = text(normalizedRow?.poNumber);
  const indexedPoNumber = text(entry.poNumber);
  return !expectedPoNumber || !indexedPoNumber || samePoNumber(entry, normalizedRow) ? entry : null;
}

function resolveApprovalPoProof({ approval = {}, normalizedRow = {}, rowIndex = 0 } = {}) {
  const payload = approval.payload || {};
  const rows = approvalRows(payload);
  const manifest = Array.isArray(payload.poProofManifest) ? payload.poProofManifest : [];
  const poNumber = text(normalizedRow.poNumber);
  const proof = resolvePoProof(
    normalizedRow,
    indexedEntryForPo(rows, rowIndex, normalizedRow),
    rows.find((row) => poNumber && samePoNumber(row, normalizedRow)),
    indexedEntryForPo(manifest, rowIndex, normalizedRow),
    manifest.find((row) => poNumber && samePoNumber(row, normalizedRow)),
    payload,
    approval
  );
  return {
    poFileUrl: proof.url,
    poFileName: proof.name,
    poFileMimeType: proof.mimeType,
    poFileSize: proof.size !== '' && Number.isFinite(Number(proof.size)) ? Number(proof.size) : null,
    hasPoFileUrl: Boolean(proof.url)
  };
}

module.exports = { resolvePoProof, resolveApprovalPoProof };
