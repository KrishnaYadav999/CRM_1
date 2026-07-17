import api from './api'
import { API_ENDPOINTS } from './apiEndpoints'

function normalizeCollection(payload, key) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.[key])) return payload[key]
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.[key])) return payload.data[key]
  if (Array.isArray(payload?.result?.[key])) return payload.result[key]
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}

function isFilled(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function firstFilled(...values) {
  return values.find(isFilled) ?? ''
}

function normalizeYesNo(value) {
  if (value === true) return 'Yes'
  const raw = String(value || '').trim().toLowerCase()
  return ['yes', 'y', 'true', '1'].includes(raw) ? 'Yes' : 'No'
}

function normalizeCcpLead(row = {}) {
  const data = row.data || {}
  const basic = data.basic || row.basic || {}
  const contact = data.contact || row.contact || {}
  const address = data.address || data.registeredAddress || row.address || row.registeredAddress || {}
  const importMeta = data.importMeta || row.importMeta || {}

  const sourceLeadId = firstFilled(row.sourceLeadId, row._id, row.id, row.mongoId, row.uniqueId, row.leadId)
  const leadCode = firstFilled(row.leadCode, row.uniqueId, row.leadId, row.code, row.sourceLeadId, sourceLeadId)
  const company = firstFilled(
    row.company,
    row.companyName,
    row.clientName,
    row.name,
    basic.company,
    basic.companyName,
    basic.clientLegalName,
    basic.tradeName
  )

  return {
    ...row,
    sourceLeadId,
    leadCode,
    company,
    status: firstFilled(row.status, row.leadStatus, row.workflowStatus, row.stage, 'Draft'),
    industryType: firstFilled(row.industryType, row.industry, basic.industryType, basic.industry),
    eprCategory: firstFilled(row.eprCategory, row.epr, basic.eprCategory),
    piboCategory: firstFilled(row.piboCategory, row.pibo, basic.piboCategory),
    servicesOffered: firstFilled(row.servicesOffered, row.service, row.services, basic.servicesOffered),
    addressLine1: firstFilled(row.addressLine1, row.address, row.address1, address.addressLine1, address.line1, address.address),
    addressLine2: firstFilled(row.addressLine2, row.address2, address.addressLine2, address.line2),
    addressLine3: firstFilled(row.addressLine3, row.address3, address.addressLine3, address.line3),
    state: firstFilled(row.state, address.state),
    city: firstFilled(row.city, address.city),
    pinCode: firstFilled(row.pinCode, row.pin, row.pincode, address.pinCode, address.pin, address.pincode),
    gstNumber: firstFilled(row.gstNumber, row.gstin, row.gst, basic.gstNumber, basic.gstin, basic.gst),
    existingClient: normalizeYesNo(firstFilled(row.existingClient, row.isExistingClient)),
    website: firstFilled(row.website, basic.website),
    contactPerson: firstFilled(row.contactPerson, row.contactName, contact.contactPerson, contact.name),
    designation: firstFilled(row.designation, contact.designation),
    emails: firstFilled(row.emails, row.email, contact.emails, contact.email),
    mobileNo1: firstFilled(row.mobileNo1, row.mobile1, row.mobile, row.phone, contact.mobileNo1, contact.mobile, contact.phone),
    mobileNo2: firstFilled(row.mobileNo2, row.mobile2, contact.mobileNo2),
    source: firstFilled(row.source, importMeta.source, 'ccp'),
    assignedToText: firstFilled(row.assignedToText, row.assignedTo?.name, importMeta.assignedTo),
    importedCreatedBy: firstFilled(row.importedCreatedBy, row.createdBy?.name, row.createdBy, importMeta.createdBy),
    importedCreatedAt: firstFilled(row.importedCreatedAt, row.createdAt, importMeta.createdAt),
    importedUpdatedAt: firstFilled(row.importedUpdatedAt, row.updatedAt, importMeta.updatedAt)
  }
}

function normalizeRows(rows, key) {
  if (key === 'leads') return rows.map(normalizeCcpLead)
  return rows
}

async function fetchCcpCollection(path, key) {
  const response = await api.get(API_ENDPOINTS.ccp.collection(path))
  const payload = response.data || {}
  const rows = normalizeRows(normalizeCollection(payload, key), key)

  return {
    data: {
      ...payload,
      ok: payload.ok !== false,
      [key]: rows,
      source: payload.source || 'ccp-live'
    }
  }
}

export function fetchCcpLeads() {
  return fetchCcpCollection('leads', 'leads')
}

export function fetchCcpClients() {
  return fetchCcpCollection('clients', 'clients')
}

export function fetchCcpLeadHistory(id, identifiers = {}) {
  const params = Object.fromEntries(Object.entries({ leadCode: identifiers.leadCode, company: identifiers.company }).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '').map(([key, value]) => [key, String(value).trim()]))
  return api.get(API_ENDPOINTS.ccp.leadHistory(id), { params })
}

export function recordCcpIntroductionEmail(id, payload = {}) {
  const body = Object.fromEntries(Object.entries({ leadCode: payload.leadCode, company: payload.company, recipient: payload.recipient }).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '').map(([key, value]) => [key, String(value).trim()]))
  return api.post(API_ENDPOINTS.ccp.emailHistory(id), body)
}

export default api
