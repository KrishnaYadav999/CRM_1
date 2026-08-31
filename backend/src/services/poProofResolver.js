const text = (value) => String(value ?? '').trim();

const URL_FIELDS = [
  'poFileUrl', 'poProofUrl', 'poDocumentUrl', 'poUploadUrl', 'poAttachmentUrl',
  'uploadedDocumentUrl', 'documentUrl', 'fileUrl', 'secureUrl', 'secure_url', 'url'
];

const NAME_FIELDS = [
  'poFileName', 'poProofName', 'poDocumentName', 'poUploadName', 'poAttachmentName',
  'uploadedDocumentName', 'documentName', 'fileName', 'originalName', 'name'
];

const FILE_FIELDS = [
  'poProof', 'poFile', 'poDocument', 'poUpload', 'poAttachment',
  'uploadedDocument', 'document', 'file', 'attachment'
];

function firstText(source, fields) {
  if (!source || typeof source !== 'object') return '';
  for (const field of fields) {
    const value = text(source[field]);
    if (value && value !== '[object Object]') return value;
  }
  return '';
}

function resolvePoProof(source = {}, ...fallbacks) {
  const candidates = [source, ...fallbacks].filter((value) => value && typeof value === 'object');
  for (const candidate of candidates) {
    const directUrl = firstText(candidate, URL_FIELDS);
    if (directUrl) return { url: directUrl, name: firstText(candidate, NAME_FIELDS) };
    for (const field of FILE_FIELDS) {
      const nested = candidate[field];
      if (!nested || typeof nested !== 'object') continue;
      const nestedUrl = firstText(nested, URL_FIELDS);
      if (nestedUrl) return { url: nestedUrl, name: firstText(nested, NAME_FIELDS) || firstText(candidate, NAME_FIELDS) };
    }
  }
  return { url: '', name: '' };
}

module.exports = { resolvePoProof };
