const key = (value) => String(value || '').trim().toLowerCase()
const identity = (value) => value && typeof value === 'object'
  ? [value._id, value.id, value.userId, value.email, value.name].map(key).filter(Boolean)
  : [key(value)].filter(Boolean)

export function isOperationsStaff(user = {}) {
  return /^(operation|operations|operations executive|operation executive)$/.test(key(user.role))
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
  rows.forEach((row) => {
    const allocationKeys = allocationOwnerKeys(row.client)
    // Service allocations are authoritative; don't count the creator or manager as the owner.
    const keys = allocationKeys.length ? allocationKeys : getLegacyKeys(row.client || {})
    staff.filter((user) => [...identity(user), key(user.crmUserId)].some((token) => token && keys.includes(token)))
      .forEach((user) => {
        const group = groups.get(key(user._id || user.id || user.userId || user.email))
        if (!group.rows.some((item) => String(item.id) === String(row.id))) {
          group.rows.push({ ...row, sla: getOperationsSla(row.client?.operationsSla || row.approval || {}, now) })
        }
      })
  })
  return [...groups.values()].map((group) => ({ ...group, total: group.rows.length,
    complianceDone: group.rows.filter((row) => key(row.client?.operationsSla?.approvalStatus || row.client?.adminControls?.approvalStatus) === 'approved').length,
    poDone: group.rows.filter((row) => row.hasPo).length,
    milestones: Object.fromEntries([48, 72, 96].map((hours) => [hours, group.rows.filter((row) => row.sla[hours].breached).length]))
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}
