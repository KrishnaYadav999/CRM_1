function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CCP_SHARED_SECRET) headers['x-ccp-secret'] = process.env.CCP_SHARED_SECRET;
  return headers;
}

async function postJsonToCcp(url, payload, fallbackError) {
  const syncUrl = String(url || '').trim();
  if (!syncUrl) return { ok: false, skipped: true, error: 'CCP sync URL is not configured' };

  try {
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: body.error || body.message || fallbackError
      };
    }

    return { ok: true, status: response.status, response: body };
  } catch (err) {
    return { ok: false, error: err.message || fallbackError };
  }
}

module.exports = { buildHeaders, postJsonToCcp };
