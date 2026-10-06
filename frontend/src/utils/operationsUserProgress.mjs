const key = (value) => String(value || '').trim().toLowerCase()
const identity = (value) => value && typeof value === 'object'
  ? [value._id, value.id, value.userId, value.email, value.name].map(key).filter(Boolean)
  : [key(value)].filter(Boolean)

export function getOperationsStatusDates(row = {}) {
  const client = row.client || {}
  const approval = client.operationsSla || row.approval || {}
  const status = key(approval.approvalStatus || client.adminControls?.approvalStatus)
  const decisionAt = approval.actionAt || approval.decisionAt || approval.correctionStartedAt
  const submittedAt = client.submittedAt || approval.createdAt
  return {
    compliance: decisionAt && status !== 'pending'
      ? { label: 'Reviewed', value: decisionAt }
      : submittedAt ? { label: 'Submitted', value: submittedAt }
        : { label: 'Created', value: client.createdAt || null },
    po: { label: 'PO date', value: row.hasPo ? row.poDetails?.poDate || null : null }
  }
}

export function isOperationsStaff(user = {}) {
  const active = user.isActive
  if (active === false || active === 0 || ['false', '0', 'inactive'].includes(key(active))) return false
  const roles = [user.role, ...(Array.isArray(user.roles) ? user.roles : [])].map(key)
  return roles.some((role) => /^(operation|operations|operations executive|operation executive|manager)$/.test(role))
    || /\boperations?\b/.test(key(user.team?.name || user.team || user.department))
}

export function allocationOwnerKeys(client = {}) {
  const allocations = client.serviceAllocations || client.data?.serviceAllocations || {}
  return [...new Set(Object.values(allocations).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return identity(entry)
    return [entry.userId, entry.userIdString, entry.user, entry.assignedTo, entry.assigneeId,
      entry.assignedUserId, entry._id, entry.id, entry.value, entry.userName, entry.email].flatMap(identity)
  }))]
}

export function permanentStaffOwnerKeys(client = {}) {
  const data = client.data && typeof client.data === 'object' ? client.data : {}
  const lead = client.selectedLead && typeof client.selectedLead === 'object'
    ? client.selectedLead
    : (data.selectedLeadSnapshot && typeof data.selectedLeadSnapshot === 'object' ? data.selectedLeadSnapshot : {})
  const serviceId = String(client.assignedServiceId || data.assignedServiceId || data.selectedLeadSnapshot?.assignedServiceId || '')
  const assignments = (Array.isArray(lead.assignments) ? lead.assignments : [])
    .filter((assignment) => !serviceId || String(assignment?.assignedServiceId || assignment?.serviceAssignmentId || '') === serviceId)
  return [...new Set([
    lead.assignedStaff, lead.assignedStaffText, lead.assignedStaffEmail,
    client.assignedStaff, client.assignedStaffText, client.assignedStaffEmail,
    ...assignments.flatMap((assignment) => [assignment?.assignedStaff, assignment?.assignedStaffText, assignment?.assignedStaffEmail])
  ].flatMap(identity))]
}

function date(value) {
  const parsed = value ? new Date(value).getTime() : NaN
  return Number.isFinite(parsed) ? parsed : null
}

// Match the correction policy used by the backend: skip first/third Saturdays in IST.
export function addCorrectionHours(start, hours) {
  let cursor = date(start)
  if (cursor === null) return null
  let remaining = hours * 3600000
  while (remaining > 0) {
    const ist = new Date(cursor + 19800000)
    const next = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1) - 19800000
    if (ist.getUTCDay() === 6 && [1, 3].includes(Math.ceil(ist.getUTCDate() / 7))) { cursor = next; continue }
    const step = Math.min(remaining, next - cursor)
    cursor += step
    remaining -= step
  }
  return cursor
}

export function getOperationsSla(record = {}, now = Date.now()) {
  const permanent = key(record.reminderFlag) === 'permanent_red'
  const resolved = key(record.correctionStatus) === 'resolved' || key(record.approvalStatus) === 'approved' || key(record.reminderFlag) === 'green'
  const correctionStart = date(record.correctionStartedAt)
  const redAt = date(record.redFlagAt || record.correctionBreachedAt)
  const due48 = date(record.correctionDueAt) ?? (correctionStart !== null ? addCorrectionHours(correctionStart, 48) : redAt)
  const business = Boolean(correctionStart !== null || record.correctionDeadlinePolicy)
  const due72 = due48 === null ? null : business ? addCorrectionHours(due48, 24) : due48 + 24 * 3600000
  const due96 = date(record.greenFlagDeadline) ?? (due48 === null ? null : business ? addCorrectionHours(due48, 48) : due48 + 48 * 3600000)
  return Object.fromEntries([[48, due48], [72, due72], [96, due96]].map(([hours, due]) => [hours,
    { breached: permanent || (!resolved && due !== null && now >= due), due, known: permanent || due !== null }
  ]))
}

export function buildOperationsProgressGroups(rows, users, getLegacyKeys, now = Date.now()) {
  const staff = users.filter(isOperationsStaff)
  const groups = new Map(staff.map((user) => [key(user._id || user.id || user.userId || user.email),
    { id: key(user._id || user.id || user.userId || user.email), name: user.name || user.email, rows: [] }]))
  const findOwner = (ownerKeys = []) => {
    for (const ownerKey of ownerKeys) {
      const matched = staff.find((user) => [...identity(user), key(user.crmUserId)].some((token) => token && token === ownerKey))
      if (matched) return matched
    }
    return null
  }
  rows.forEach((row) => {
    const allocationKeys = allocationOwnerKeys(row.client)
    const permanentStaffKeys = permanentStaffOwnerKeys(row.client)
    // A client belongs to exactly one primary/original owner in this report.
    // Prefer the owner already resolved from client-level assignment data;
    // service allocations are used only when no primary owner can be resolved.
    const resolvedOwnerKeys = [...identity(row.user), key(row.user?.crmUserId)].filter(Boolean)
    const legacyKeys = getLegacyKeys(row.client || {})
    const owner = findOwner(permanentStaffKeys) || findOwner(resolvedOwnerKeys) || findOwner(legacyKeys) || findOwner(allocationKeys)
    if (!owner) return
    const group = groups.get(key(owner._id || owner.id || owner.userId || owner.email))
    if (group && !group.rows.some((item) => String(item.id) === String(row.id))) {
      group.rows.push({ ...row, sla: getOperationsSla(row.client?.operationsSla || row.approval || {}, now) })
    }
  })
  return [...groups.values()].map((group) => ({ ...group, total: group.rows.length,
    complianceDone: group.rows.filter((row) => key(row.client?.operationsSla?.approvalStatus || row.client?.adminControls?.approvalStatus) === 'approved').length,
    poDone: group.rows.filter((row) => row.hasPo).length,
    milestones: Object.fromEntries([48, 72, 96].map((hours) => [hours, group.rows.filter((row) => row.sla[hours].breached).length]))
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

export function getOperationsFinalFlag(sla = {}) {
  return [48, 72, 96].every((hours) => sla[hours]?.breached === true) ? 'red' : 'green'
}

function excelText(value, fallback = '') {
  const text = String(value ?? '').trim() || fallback
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function clientContactDetails(row = {}) {
  const client = row.client || {}
  const data = client.data && typeof client.data === 'object' ? client.data : client
  const basic = data.basic || client.basic || {}
  const authorised = data.authorised || client.authorised || {}
  const coordinating = data.coordinating || client.coordinating || {}
  const otp = data.otp || client.otp || {}
  const first = (...values) => values.find((value) => String(value ?? '').trim()) || ''
  return {
    person: first(basic.contactPerson, authorised.name, authorised.personName, coordinating.name, coordinating.personName, client.contactPerson, client.personName),
    email: first(otp.email, authorised.email, coordinating.email, client.email, client.emailId),
    phone: first(otp.mobile, otp.mobileNo, authorised.mobile, authorised.mobileNo, coordinating.mobile, coordinating.mobileNo, client.mobileNo1, client.mobile, client.phone),
    sector: first(basic.sector, basic.industryType, data.sector, data.industryType, client.sector, client.industryType, row.eprCategory)
  }
}

function poRecords(row = {}) {
  const details = row.poDetails || {}
  return Array.isArray(details.records) && details.records.length ? details.records : [details]
}

export function buildOperationsWorkbookData(groups = [], financialYear = 'all') {
  const summary = groups.map((group) => {
    const finalRed = group.rows.filter((row) => getOperationsFinalFlag(row.sla) === 'red').length
    const recordedValues = (field) => [...new Set(group.rows.flatMap((row) => poRecords(row).map((po) => excelText(po[field]))).filter(Boolean))].join(' | ')
    return {
      'Operations User': excelText(group.name, 'Unassigned'),
      'Financial Year Filter': excelText(financialYear, 'All'),
      'Assigned Clients': group.total,
      'Compliance Approved': group.complianceDone,
      'PO Received': group.poDone,
      'PO End Dates': recordedValues('poEndDate'),
      'PO Financial Years': recordedValues('poFinancialYear'),
      'Payment Terms': recordedValues('paymentTerm'),
      '48h+ Red Flags': group.milestones[48],
      '72h+ Red Flags': group.milestones[72],
      '96h+ Red Flags': group.milestones[96],
      'Final Red Flags': finalRed
    }
  })
  const clientBase = (group, row) => {
    const contact = clientContactDetails(row)
    const approval = row.client?.operationsSla?.approvalStatus || row.client?.adminControls?.approvalStatus || 'PENDING'
    const statusDates = getOperationsStatusDates(row)
    return {
      'Operations User': excelText(group.name, 'Unassigned'),
      'Client Name': excelText(row.companyName, 'Unnamed client'),
      'ATPL Code': excelText(row.atplCode, 'Not recorded'),
      'Contact Person': excelText(contact.person, 'Not recorded'),
      'Email': excelText(contact.email, 'Not recorded'),
      'Phone': excelText(contact.phone, 'Not recorded'),
      'Sector': excelText(contact.sector, 'Not recorded'),
      'EPR Category': excelText(row.eprCategory, 'Not recorded'),
      'Applicant Type': excelText(row.category, 'Not recorded'),
      'Sub-applicant Type': excelText(row.subApplicantType, 'Not recorded'),
      'Compliance Status': excelText(String(approval).replace(/_/g, ' ')),
      'Compliance Status Date': excelText(statusDates.compliance.value, 'Not recorded'),
      'PO Status': row.hasPo ? 'Received' : 'Pending',
      '48h+ Flag': row.sla?.[48]?.breached ? 'Red' : row.sla?.[48]?.known ? 'Clear' : 'No correction deadline',
      '48h Due': excelText(row.sla?.[48]?.due ? new Date(row.sla[48].due).toISOString() : '', 'Not recorded'),
      '72h+ Flag': row.sla?.[72]?.breached ? 'Red' : row.sla?.[72]?.known ? 'Clear' : 'No correction deadline',
      '72h Due': excelText(row.sla?.[72]?.due ? new Date(row.sla[72].due).toISOString() : '', 'Not recorded'),
      '96h+ Flag': row.sla?.[96]?.breached ? 'Red' : row.sla?.[96]?.known ? 'Clear' : 'No correction deadline',
      '96h Due': excelText(row.sla?.[96]?.due ? new Date(row.sla[96].due).toISOString() : '', 'Not recorded'),
      'Final Flag': getOperationsFinalFlag(row.sla) === 'red' ? 'Red' : 'Green'
    }
  }
  const uniquePoValues = (records, field, fallback = 'Not recorded') => excelText(
    [...new Set(records.map((po) => po?.[field]).filter((value) => String(value ?? '').trim()))].join(' | '),
    fallback
  )
  // This sheet intentionally contains exactly one row per assigned client so
  // its Received/Pending totals always reconcile with the Operations table.
  const clients = groups.flatMap((group) => group.rows.map((row) => {
    const records = poRecords(row)
    const amounts = records.map((po) => Number(po?.poAmount)).filter((amount) => Number.isFinite(amount))
    return {
      ...clientBase(group, row),
      'PO Record Count': row.hasPo ? records.length : 0,
      'PO Number(s)': uniquePoValues(records.map((po) => ({ ...po, poNumber: po.poNo || po.poNumber })), 'poNumber'),
      'PO Date(s)': uniquePoValues(records, 'poDate'),
      'PO End Date(s)': uniquePoValues(records, 'poEndDate'),
      'PO Financial Year(s)': uniquePoValues(records, 'poFinancialYear'),
      'Payment Term(s)': uniquePoValues(records, 'paymentTerm'),
      'Total PO Amount (INR)': amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) : '',
      'PO Proof Link(s)': uniquePoValues(records.map((po) => ({ ...po, proofLink: po.fileUrl || row.poDetails?.fileUrl })), 'proofLink')
    }
  }))
  // Multiple POs for one client remain available here without inflating the
  // unique-client counts in the Client Details sheet.
  const poDetails = groups.flatMap((group) => group.rows.flatMap((row) => {
    if (!row.hasPo) return []
    return poRecords(row).map((po, index) => ({
      'Operations User': excelText(group.name, 'Unassigned'),
      'Client Name': excelText(row.companyName, 'Unnamed client'),
      'ATPL Code': excelText(row.atplCode, 'Not recorded'),
      'PO Record': index + 1,
      'PO Number': excelText(po.poNo || po.poNumber, 'Not recorded'),
      'PO Date': excelText(po.poDate, 'Not recorded'),
      'PO End Date': excelText(po.poEndDate, 'Not recorded'),
      'PO Financial Year': excelText(po.poFinancialYear, 'Not recorded'),
      'Payment Term': excelText(po.paymentTerm, 'Not recorded'),
      'PO Amount (INR)': Number.isFinite(Number(po.poAmount)) && String(po.poAmount).trim() ? Number(po.poAmount) : '',
      'PO Proof Link': excelText(po.fileUrl || row.poDetails?.fileUrl, 'Not recorded')
    }))
  }))
  return { summary, clients, poDetails }
}

export function getPoFinancialYear(row = {}) {
  return String(row.poDetails?.poFinancialYear || row.poFinancialYear || '').trim()
}

export function selectRowsForPoFinancialYear(rows = [], selected = 'all') {
  if (selected === 'all') return rows
  return rows.flatMap((row) => {
    const details = row.poDetails || {}
    const records = details.records?.length ? details.records : [{ ...details, poFinancialYear: getPoFinancialYear(row) }]
    const matches = records.filter((po) => selected === 'unrecorded' ? !String(po.poFinancialYear || '').trim() : String(po.poFinancialYear || '').trim() === selected)
    return matches.length ? [{ ...row, poFinancialYear: matches[0].poFinancialYear || '', poDetails: { ...details, ...matches[0], records: matches } }] : []
  })
}
