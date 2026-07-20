const express = require('express');

const router = express.Router();
const DEFAULT_LOGO_URL = 'https://crm.ananttattva.com/assets/at-logo-CTH78yrR.svg';
let cachedLogo = null;
let cachedContentType = 'image/svg+xml';

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
