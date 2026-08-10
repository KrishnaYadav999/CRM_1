const Lead = require('../models/Lead');
const User = require('../models/User');

const leadCodePattern = /^(?:ATPL-LEAD-|ATPL-)?0*409$/i;

async function correctTataMotorsLeadCreator() {
  const lead = await Lead.findOne({
    company: /^TATA MOTORS LIMITED$/i,
    $or: [{ leadCode: leadCodePattern }, { sourceLeadId: leadCodePattern }, { externalLeadId: leadCodePattern }]
  });
  if (!lead) return { updated: false, reason: 'lead_not_found' };

  const creator = await User.findOne({ name: /^GAURAV CHANDRA$/i, isActive: { $ne: false } }).select('_id name email').lean();
  if (!creator) return { updated: false, reason: 'creator_not_found' };
  if (String(lead.createdBy || '') === String(creator._id)
    && String(lead.createdByName || '').toUpperCase() === 'GAURAV CHANDRA') {
    return { updated: false, reason: 'already_correct' };
  }

  lead.createdBy = creator._id;
  lead.createdByCrmUserId = String(creator._id);
  lead.createdByName = creator.name;
  lead.createdByEmail = String(creator.email || '').toLowerCase();
  lead.importedCreatedBy = creator.name;
  await lead.save();
  return { updated: true, leadCode: lead.leadCode, company: lead.company, createdBy: creator.name };
}

async function applyKnownDataCorrections() {
  const result = await correctTataMotorsLeadCreator();
  if (result.updated) console.log('Applied guarded CRM data correction', result);
  return result;
}

module.exports = { applyKnownDataCorrections, correctTataMotorsLeadCreator };
