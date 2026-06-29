import axios from 'axios'

const DEFAULT_CCP_API_URL = 'https://ccp-henna.vercel.app/api'

function ccpApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_CCP_API_URL
  const legacyBaseUrl = import.meta.env.VITE_CCP_API_BASE_URL
  const baseUrl = configuredUrl || legacyBaseUrl?.replace(/\/ccp\/?$/, '') || DEFAULT_CCP_API_URL
  return String(baseUrl).replace(/\/+$/, '')
}

const ccpApi = axios.create({
  baseURL: ccpApiBaseUrl(),
  timeout: 3500,
  headers: {
    Accept: 'application/json'
  }
})

const CCP_CACHE_PREFIX = 'crm.ccp.direct.cache.v2'

function readCcpCache(key) {
  const cacheKey = `${CCP_CACHE_PREFIX}.${key}`
  const stores = [window.sessionStorage, window.localStorage].filter(Boolean)

  for (const store of stores) {
    try {
      const parsed = JSON.parse(store.getItem(cacheKey) || '[]')
      if (Array.isArray(parsed) && parsed.length) return parsed
    } catch (error) {
      /* cache miss */
    }
  }

  return []
}

function writeCcpCache(key, rows) {
  if (!Array.isArray(rows) || !rows.length) return

  const cacheKey = `${CCP_CACHE_PREFIX}.${key}`
  for (const store of [window.sessionStorage, window.localStorage].filter(Boolean)) {
    try {
      store.setItem(cacheKey, JSON.stringify(rows))
    } catch (error) {
      /* cache only */
    }
  }
}

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
  try {
    const response = await ccpApi.get(`/ccp/${path}`)
    const payload = response.data || {}
    const rows = normalizeRows(normalizeCollection(payload, key), key)
    if (rows.length) writeCcpCache(key, rows)
    const cachedRows = rows.length ? [] : readCcpCache(key)

    return {
      data: {
        ok: payload.ok !== false,
        [key]: rows.length ? rows : cachedRows,
        source: rows.length ? 'ccp-direct' : cachedRows.length ? 'ccp-cache' : 'ccp-direct'
      }
    }
  } catch (error) {
    const cachedRows = readCcpCache(key)

    return {
      data: {
        ok: cachedRows.length > 0,
        [key]: cachedRows,
        error: error.message || `Unable to fetch CCP ${path}`,
        source: cachedRows.length ? 'ccp-cache' : 'ccp-direct'
      }
    }
  }
}

export function fetchCcpLeads() {
  return fetchCcpCollection('leads', 'leads')
}

export function fetchCcpClients() {
  return fetchCcpCollection('clients', 'clients')
}

export default ccpApi
