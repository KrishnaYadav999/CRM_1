const BUSINESS_DAYS = 7;
const IST_OFFSET_MS = 330 * 60 * 1000;
const LEGACY_WINDOW_MS = 10 * 60 * 1000;

function addBusinessDaysInIst(start, days = BUSINESS_DAYS) {
  const date = new Date(new Date(start).getTime() + IST_OFFSET_MS);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid provisional closure date');
  for (let added = 0; added < days;) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) added += 1;
  }
  return new Date(date.getTime() - IST_OFFSET_MS);
}

function normalizeProvisionalClosure(row, previous = {}, now = new Date()) {
  if (row?.poStatus !== 'provisional') return row;
  let expiresAt;
  const previousExpiry = new Date(previous.provisionalCloseExpiresAt);
  if (previous.poStatus === 'provisional' && !Number.isNaN(previousExpiry.getTime())) {
    expiresAt = previous.provisionalCloseDeadlineBusinessDays === BUSINESS_DAYS
      ? previousExpiry
      : addBusinessDaysInIst(new Date(previousExpiry.getTime() - LEGACY_WINDOW_MS));
  } else {
    // Only the server starts the clock. Ignore dates supplied by clients.
    expiresAt = addBusinessDaysInIst(now);
  }
  return { ...row, provisionalCloseExpiresAt: expiresAt.toISOString(), provisionalCloseDeadlineBusinessDays: BUSINESS_DAYS };
}

module.exports = { BUSINESS_DAYS, addBusinessDaysInIst, normalizeProvisionalClosure };
