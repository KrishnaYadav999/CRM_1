const SERVICES = ['New Registration', 'Account Closure', 'Annual Return Filling', 'Audits - Producer/ PWP', 'Category 1 – EOL', 'Category 1 – Recycling', 'Category 2 – EOL', 'Category 2 – Recycling', 'Category 3 – EOL', 'Category 3 – Recycling', 'CIPET Registration Advisory', 'Consulting', 'Corporate training & awareness Consulting', 'Credit Procurement', 'CTO/CCA Renewal and Amendment', 'Data Uploading', 'E-Certificate Registration', 'Environmental Statement Form V', 'EPR KAVACH', 'Marking and labelling QR Code', 'Name Change Application – GPCB'];
const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function normalizeYear(value) {
  const match = String(value || '').trim().match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/);
  if (!match || Number(match[2].slice(-2)) !== (Number(match[1]) + 1) % 100) return '';
  return `${match[1]}-${match[2].slice(-2)}`;
}
function buildOverall(records, deactivations = [], selectedYear = '') {
  const inactive = new Set(deactivations.filter((row) => row.status === 'INACTIVE').map((row) => row.companyKey));
  const services = [...SERVICES];
  const serviceName = (value) => {
    const raw = String(value || '').trim();
    const key = normalize(raw).replace('filing', 'filling');
    const known = services.find((name) => normalize(name) === key);
    if (known) return known;
    if (raw && !services.includes(raw)) services.push(raw);
    return raw;
  };
  const years = new Map();
  for (const record of records) {
    if (!record.isClosed) continue;
    const year = normalizeYear(record.financialYear);
    if (!year) continue;
    if (!years.has(year)) years.set(year, new Map());
    const clients = years.get(year);
    const key = String(record.companyIdentity || record.clientName || record.leadId).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!clients.has(key)) clients.set(key, { key, name: record.clientName, clientId: record.clientId, inactive: inactive.has(key), types: new Map() });
    const client = clients.get(key);
    const type = record.subApplicantType && record.subApplicantType !== 'Not specified' ? record.subApplicantType : record.applicantType;
    const types = new Set([type || 'Not specified']);
    if (record.applicantType && !['pibo', 'simp', 'notspecified'].includes(normalize(record.applicantType))) types.add(record.applicantType);
    for (const entry of types) {
      if (!client.types.has(entry)) client.types.set(entry, new Set());
      (record.services || []).forEach((service) => { const name = serviceName(service.name); if (name) client.types.get(entry).add(name); });
    }
  }
  const yearOptions = [...years.keys()].sort();
  const financialYear = normalizeYear(selectedYear) || yearOptions.at(-1) || '';
  const current = [...(years.get(financialYear)?.values() || [])];
  const types = new Set(['Producer', 'Brand Owner', 'PWP', 'Importer', ...current.flatMap((client) => [...client.types.keys()])]);
  const groups = [...types].map((type) => {
    const clients = current.filter((client) => [...client.types.keys()].some((entry) => normalize(entry) === normalize(type))).map((client) => {
      const taken = new Set([...client.types].filter(([entry]) => normalize(entry) === normalize(type)).flatMap(([, names]) => [...names]));
      return { key: client.key, name: client.name, clientId: client.clientId, inactive: client.inactive, services: Object.fromEntries(services.map((service) => [service, taken.has(service) ? 1 : 0])) };
    });
    return { type, count: clients.length, services: Object.fromEntries(services.map((service) => [service, clients.reduce((sum, client) => sum + client.services[service], 0)])), clients };
  }).filter((group, index, all) => all.findIndex((other) => normalize(other.type) === normalize(group.type)) === index);
  const trends = yearOptions.map((year) => { const clients = [...years.get(year).values()]; const inactiveCount = clients.filter((client) => client.inactive).length; return { year, clients: clients.length, active: clients.length - inactiveCount, inactive: inactiveCount }; });
  return { financialYear, yearOptions, services, groups, trends, summary: { clients: current.length, active: current.filter((client) => !client.inactive).length, inactive: current.filter((client) => client.inactive).length, services: current.reduce((sum, client) => sum + new Set([...client.types.values()].flatMap((names) => [...names])).size, 0) } };
}
module.exports = { buildOverall, normalizeYear };
