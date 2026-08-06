const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const DEFAULT_LOGO_URL = 'https://crm.ananttattva.com/assets/at-logo-CTH78yrR.svg';
let cachedLogo = null;
let cachedContentType = 'image/svg+xml';

router.post('/cloudinary-signature', requireAuth, (req, res) => {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) return res.status(503).json({ error: 'Cloudinary storage is not configured.' });

  const safeFolder = String(req.body?.folder || 'crm/uploads')
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 120) || 'crm/uploads';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${safeFolder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  return res.json({ cloudName, apiKey, timestamp, folder: safeFolder, signature });
});

router.get('/brand-logo', async (req, res) => {
  try {
    if (!cachedLogo) {
      const response = await fetch(String(process.env.MAIL_LOGO_URL || DEFAULT_LOGO_URL));
      if (!response.ok) throw new Error(`Logo server returned ${response.status}`);
      cachedLogo = Buffer.from(await response.arrayBuffer());
      cachedContentType = response.headers.get('content-type') || 'image/svg+xml';
    }
    res.set({ 'Content-Type': cachedContentType, 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' });
    return res.send(cachedLogo);
  } catch (error) {
    return res.status(502).json({ error: 'Company logo is temporarily unavailable' });
  }
});

module.exports = router;
