function text(value) {
  return String(value || '').trim();
}

function normalizeCompanyIdentity(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\bPRIVATE\s+LIMITED\b/g, ' PVT LTD ')
    .replace(/\bLIMITED\b/g, ' LTD ')
    .replace(/\bCORPORATION\b/g, ' CORP ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  normalizeCompanyIdentity
};
