const Lead = require('../models/Lead');
const { getVisibleUserScope, ownerFilter } = require('../utils/visibilityScope');

const REQUIRED_FIELDS = ['status', 'company', 'piboCategory', 'servicesOffered', 'addressLine1', 'state', 'city', 'pinCode'];
const LEAD_CODE_PREFIX = 'ATPL-LEAD-';

function cleanBody(body) {
  const data = {};
  [
    'communicationMode',
    'sourceLeadId',
    'status',
    'company',
    'industryType',
    'eprCategory',
    'piboCategory',
    'servicesOffered',
    'addressLine1',
    'addressLine2',
    'addressLine3',
    'landmark',
    'state',
    'city',
    'pinCode',
    'existingClient',
    'website',
    'salutation',
    'contactPerson',
    'designation',
    'emails',
    'emailsSentCount',
    'lastEmailSent',
    'mobileNo1',
    'mobileNo2',
    'businessCardUrl',
    'referredBy',
    'source',
    'notes',
    'assignedTo',
    'assignedToText',
    'assignedBy',
    'importedCreatedBy',
    'leadDate',
    'nextFollowUpDate',
    'nextFollowUpTime',
    'followUpRemarks',
    'importedCreatedAt',
    'importedUpdatedAt',
    'workflowStatus'
  ].forEach((key) => {
    if (body[key] !== undefined) {
      const value = typeof body[key] === 'string' ? body[key].trim() : body[key];
      if (key === 'assignedTo' && !value) return;
      data[key] = key === 'emailsSentCount' ? Number(value) || 0 : value;
    }
  });
  return data;
}

function validateSubmittedLead(data) {
  const missing = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missing.length) return `Missing required fields: ${missing.join(', ')}`;
  return '';
}

async function getNextLeadCode() {
  const latest = await Lead.findOne({ leadCode: { $exists: true, $ne: '' } })
    .sort({ leadCode: -1 })
    .select('leadCode')
    .lean();
  const latestNumber = Number.parseInt(String(latest?.leadCode || '').replace(LEAD_CODE_PREFIX, ''), 10) || 0;
  return `${LEAD_CODE_PREFIX}${String(latestNumber + 1).padStart(4, '0')}`;
}

async function createLeadRecord(rawBody, userId) {
  const data = cleanBody(rawBody);
  data.workflowStatus = data.workflowStatus === 'submitted' ? 'submitted' : 'draft';

  if (data.workflowStatus === 'submitted') {
    const error = validateSubmittedLead(data);
    if (error) {
      const validationError = new Error(error);
      validationError.statusCode = 400;
      throw validationError;
    }
  }

  return Lead.create({ ...data, leadCode: await getNextLeadCode(), createdBy: userId });
}

exports.listLeads = async (req, res) => {
  const scope = await getVisibleUserScope(req.user);
  const leads = await Lead.find(ownerFilter(scope, 'createdBy', 'assignedTo', [
    'assignedToText'
  ]))
    .populate('assignedTo', 'name email avatarUrl role')
    .sort({ leadCode: 1, createdAt: 1 });
  res.json({ ok: true, leads });
};

exports.createLead = async (req, res) => {
  try {
    const lead = await createLeadRecord(req.body, req.user?._id);
    res.status(201).json({ ok: true, lead });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to save lead' });
  }
};

exports.updateLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const data = cleanBody(req.body);
    data.workflowStatus = data.workflowStatus === 'submitted' ? 'submitted' : (data.workflowStatus || lead.workflowStatus || 'draft');

    if (data.workflowStatus === 'submitted') {
      const error = validateSubmittedLead({ ...lead.toObject(), ...data });
      if (error) return res.status(400).json({ error });
    }

    Object.assign(lead, data);
    await lead.save();
    res.json({ ok: true, lead });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to update lead' });
  }
};

exports.bulkCreateLeads = async (req, res) => {
  const rows = Array.isArray(req.body.leads) ? req.body.leads : [];
  if (!rows.length) return res.status(400).json({ error: 'No leads provided' });

  const leads = [];
  const failures = [];

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const lead = await createLeadRecord(rows[index], req.user?._id);
      leads.push(lead);
    } catch (err) {
      failures.push({
        row: index + 1,
        error: err.message || 'Unable to save lead'
      });
    }
  }

  res.status(failures.length && !leads.length ? 400 : 201).json({
    ok: failures.length === 0,
    imported: leads.length,
    failed: failures.length,
    leads,
    failures
  });
};
