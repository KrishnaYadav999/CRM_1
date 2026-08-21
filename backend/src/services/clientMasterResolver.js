function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function plainRecord(record = {}) {
  return typeof record?.toObject === 'function' ? record.toObject() : record;
}

function stringId(value) {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value.toHexString === 'function') return String(value.toHexString()).trim();
  const nested = value._id || value.id || value.leadId;
  if (nested) return stringId(nested);
  const serialized = String(value).trim();
  return serialized === '[object Object]' ? '' : serialized;
}

function firstText(...values) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim());
  return value === undefined ? '' : String(value).trim();
}

function getClientMasterId(record = {}) {
  const raw = plainRecord(record);
  return stringId(raw._id || raw.id);
}

function getSelectedLeadId(record = {}) {
  const raw = plainRecord(record);
  return [
    raw.selectedLead,
    raw.data?.selectedLead,
    raw.data?.selectedLeadSnapshot?.id,
    raw.data?.selectedLeadSnapshot?.sourceLeadId
  ].map(stringId).find(Boolean) || '';
}

function getAssignedServiceId(record = {}) {
  const raw = plainRecord(record);
  return firstText(
    raw.assignedServiceId,
    raw.data?.assignedServiceId,
    raw.data?.selectedLeadSnapshot?.assignedServiceId
  );
}

function getCompanyName(record = {}) {
  const raw = plainRecord(record);
  return firstText(
    raw.data?.basic?.clientLegalName,
    raw.data?.basic?.tradeName,
    raw.data?.companyOverview?.companyName,
    raw.data?.importMeta?.companyName,
    raw.data?.selectedLeadSnapshot?.company,
    raw.selectedLead?.company,
    raw.clientLegalName,
    raw.tradeName,
    raw.companyName
  );
}

function normalizeClientMaster(record = {}) {
  const raw = plainRecord(record);
  const data = isObject(raw.data) ? raw.data : {};
  const assignedServiceId = getAssignedServiceId(raw);
  return {
    clientMasterId: getClientMasterId(raw),
    selectedLead: getSelectedLeadId(raw),
    leadCode: firstText(
      raw.selectedLead?.leadCode,
      data.selectedLeadSnapshot?.leadCode,
      data.importMeta?.leadNumber,
      data.importMeta?.uniqueId
    ),
    assignedServiceId: assignedServiceId || null,
    companyName: getCompanyName(raw),
    piboCategory: firstText(data.basic?.piboCategory, data.selectedLeadSnapshot?.piboCategory, data.selectedLeadSnapshot?.subApplicantType, raw.piboCategory),
    eprCategory: firstText(data.basic?.eprCategory, data.selectedLeadSnapshot?.eprCategory, data.selectedLeadSnapshot?.serviceCategory, raw.eprCategory),
    servicesOffered: firstText(data.basic?.servicesOffered, data.selectedLeadSnapshot?.servicesOffered, raw.servicesOffered),
    plantUnit: firstText(data.selectedLeadSnapshot?.plantUnit, data.basic?.plantUnit, raw.plantUnit),
    industryType: firstText(data.selectedLeadSnapshot?.industryType, data.basic?.companyIndustry, raw.industryType),
    applicantType: firstText(data.selectedLeadSnapshot?.applicantType, data.selectedLeadSnapshot?.piboParent, raw.applicantType),
    cpcbPortalRegistered: typeof data.cpcbOnboarding?.cpcbPortalRegistered === 'boolean'
      ? data.cpcbOnboarding.cpcbPortalRegistered
      : undefined,
    cpcbApplicationStatus: firstText(data.cpcbOnboarding?.cpcbApplicationStatus) || null,
    workflowStatus: firstText(raw.workflowStatus, 'draft'),
    legacy: !assignedServiceId
  };
}

const SCOPED_OBJECT_SECTIONS = [
  'cpcb', 'registeredAddress', 'communicationAddress', 'otp', 'authorised', 'coordinating'
];
const SCOPED_ARRAY_SECTIONS = [
  'cpcbScreenshots', 'otpContacts', 'authorisedPersons', 'coordinatingPersons'
];

function resolveClientMasterData(record = {}, requestedAssignedServiceId = '') {
  const raw = plainRecord(record);
  const stored = isObject(raw.data) ? raw.data : {};
  const data = { ...stored };
  const assignedServiceId = firstText(requestedAssignedServiceId, getAssignedServiceId(raw));

  // Some migrated documents predate the `data` envelope. Copy only known form
  // sections; the API never needs to guess or expose unrelated root fields.
  [
    'companyOverview', 'basic', 'registeredAddress', 'communicationAddress',
    'compliance', 'msmeRows', 'cte', 'cpcb', 'cpcbScreenshots', 'processDiagrams',
    'otp', 'otpContacts', 'authorised', 'authorisedPersons', 'coordinating',
    'coordinatingPersons', 'importMeta', 'selectedLeadSnapshot'
  ].forEach((key) => {
    if (data[key] === undefined && raw[key] !== undefined) data[key] = raw[key];
  });

  if (!assignedServiceId) return data;
  const cpcbScope = data.cpcbDataByAssignedServiceId?.[assignedServiceId];
  const serviceScope = data.serviceDetailsByAssignedServiceId?.[assignedServiceId];

  SCOPED_OBJECT_SECTIONS.forEach((section) => {
    const directCpcbScope = section === 'cpcb' && isObject(cpcbScope) && !isObject(cpcbScope.cpcb)
      ? cpcbScope
      : undefined;
    const specific = serviceScope?.[section] || cpcbScope?.[section] || directCpcbScope;
    if (isObject(specific)) data[section] = { ...(isObject(data[section]) ? data[section] : {}), ...specific };
  });
  SCOPED_ARRAY_SECTIONS.forEach((section) => {
    const specific = serviceScope?.[section] || cpcbScope?.[section];
    if (Array.isArray(specific)) data[section] = specific;
  });
  return data;
}

module.exports = {
  getAssignedServiceId,
  getClientMasterId,
  getCompanyName,
  getSelectedLeadId,
  normalizeClientMaster,
  resolveClientMasterData
};
