function requireCcpSecret(req, res, next) {
  const expectedSecret = String(process.env.CCP_SHARED_SECRET || '').trim();
  if (!expectedSecret) {
    return res.status(503).json({ ok: false, error: 'CCP shared secret is not configured' });
  }
  const providedSecret = String(req.get('x-ccp-secret') || '').trim();
  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Invalid CCP secret' });
  }
  return next();
}

module.exports = { requireCcpSecret };
