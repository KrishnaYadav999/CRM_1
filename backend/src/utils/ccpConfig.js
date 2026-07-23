const DEFAULT_PRODUCTION_API_BASE_URL = 'https://ccp-62b2.onrender.com/api';
const DEFAULT_DEVELOPMENT_API_BASE_URL = 'http://localhost:8081/api';

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function ccpApiBaseUrl() {
  const configured = trimUrl(process.env.CCP_API_BASE_URL || process.env.CCP_API_URL);
  if (configured) return configured.replace(/\/ccp$/i, '');
  return process.env.NODE_ENV === 'production'
    ? DEFAULT_PRODUCTION_API_BASE_URL
    : DEFAULT_DEVELOPMENT_API_BASE_URL;
}

function ccpApiUrl(path = '') {
  return `${ccpApiBaseUrl()}/${String(path).replace(/^\/+/, '')}`;
}

function ccpHeaders({ json = false } = {}) {
  const sharedSecret = String(process.env.CCP_SHARED_SECRET || '').trim();
  const apiKey = String(process.env.CCP_SHARED_API_KEY || process.env.CCP_API_KEY || sharedSecret).trim();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(apiKey ? { 'x-ccp-api-key': apiKey } : {}),
    ...(sharedSecret ? { 'x-ccp-secret': sharedSecret } : {})
  };
}

module.exports = { ccpApiBaseUrl, ccpApiUrl, ccpHeaders };
