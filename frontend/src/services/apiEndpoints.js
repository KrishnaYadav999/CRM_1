function encodePathValue(value) {
  return encodeURIComponent(String(value || '').trim());
}

const API_ENDPOINTS = {
  auth: {
    me: '/auth/me',
    claimMilestone: (key) => `/auth/milestones/${encodePathValue(key)}/claim`,
    password: '/auth/me/password',
    requestOtp: '/auth/request-otp',
    verifyOtp: '/auth/verify-otp',
    resendOtp: '/auth/resend-otp',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    logout: '/auth/logout',
    activityHeartbeat: '/auth/activity-heartbeat',
    auditLogs: '/auth/admin/logs',
    superAdminOverview: '/auth/superadmin/overview',
    userProductivityReport: '/auth/superadmin/productivity-report',
    userWorkReport: (id) => `/auth/superadmin/users/${encodePathValue(id)}/work-report`,
    users: '/auth/users',
    roles: '/auth/roles',
    adminUsers: '/auth/admin/users',
    createUser: '/auth/admin/create-user',
    adminUser: (id) => `/auth/admin/users/${encodePathValue(id)}`
  },
  leads: {
    list: '/leads',
    companySearch: '/leads/search/company',
    create: '/leads',
    bulk: '/leads/bulk',
    detail: (id) => `/leads/${encodePathValue(id)}`
    ,history: (id) => `/leads/${encodePathValue(id)}/history`
    ,emailHistory: (id) => `/leads/${encodePathValue(id)}/history/email`
    ,claimRoyalty: (id) => `/leads/${encodePathValue(id)}/royalty-claims`
    ,duplicateApprovals: '/leads/duplicate-approvals'
    ,duplicateApproval: (id) => `/leads/duplicate-approvals/${encodePathValue(id)}`
    ,serviceCatalog: '/leads/service-catalog'
    ,dropdownOptions: '/leads/dropdown-options'
    ,serviceCatalogCategories: '/leads/service-catalog/categories'
    ,serviceCatalogServices: (category) => `/leads/service-catalog/categories/${encodePathValue(category)}/services`
    ,temporaryAssignment: (id) => `/leads/${encodePathValue(id)}/temporary-assignments`
    ,temporaryAssignmentDecision: (approvalId) => `/leads/temporary-assignments/${encodePathValue(approvalId)}`
    ,purchaseOrderApprovalDecision: (id) => `/leads/purchase-order-approvals/${encodePathValue(id)}`
  },
  clients: {
    list: '/clients',
    catalog: '/clients/discovery/catalog',
    discoverySearch: '/clients/discovery/search',
    discoveryServices: '/clients/discovery/services',
    create: '/clients',
    bulk: '/clients/bulk',
    bulkUpdateYears: '/clients/years/bulk',
    cpcbOnboarding: '/clients/onboarding/cpcb',
    pendingApprovals: '/clients/pending-approvals',
    approveAllPendingClients: '/clients/pending-approvals/clients/approve-all',
    detail: (id) => `/clients/${encodePathValue(id)}`,
    approval: (id) => `/clients/${encodePathValue(id)}/approval`,
    complianceReview: (id) => `/clients/${encodePathValue(id)}/compliance-review`,
    complianceReviewSection: (id, sectionKey) => `/clients/${encodePathValue(id)}/compliance-review/sections/${encodePathValue(sectionKey)}`,
    complianceReviewDecision: (id) => `/clients/${encodePathValue(id)}/compliance-review/decision`,
    annualReturn: (id) => `/clients/${encodePathValue(id)}/annual-return`
    ,annualReturnPoStatus: (id) => `/clients/${encodePathValue(id)}/annual-return/po-status`
    ,purchaseData: (id) => `/clients/${encodePathValue(id)}/purchase-data`
    ,purchaseChecklist: (id) => `/clients/${encodePathValue(id)}/purchase-data/checklist`
    ,purchaseScreenshots: (id) => `/clients/${encodePathValue(id)}/purchase-data/screenshots`
    ,purchaseImport: (id, source) => `/clients/${encodePathValue(id)}/purchase-imports/${encodePathValue(source)}`
    ,purchaseRows: (id) => `/clients/${encodePathValue(id)}/purchase-data/rows`
    ,purchaseReconciliation: (id) => `/clients/${encodePathValue(id)}/purchase-reconciliation`
    ,purchaseErrors: (id, source) => `/clients/${encodePathValue(id)}/purchase-imports/${encodePathValue(source)}/errors`
    ,purchaseSubmit: (id) => `/clients/${encodePathValue(id)}/purchase-data/submit`
    ,purchaseManagerReview: (id) => `/clients/${encodePathValue(id)}/purchase-data/manager-review`
    ,purchaseComplianceReview: (id) => `/clients/${encodePathValue(id)}/purchase-data/compliance-review`
    ,salesData: (id) => `/clients/${encodePathValue(id)}/sales-data`
    ,salesChecklist: (id) => `/clients/${encodePathValue(id)}/sales-data/checklist`
    ,salesScreenshots: (id) => `/clients/${encodePathValue(id)}/sales-data/screenshots`
    ,salesImport: (id, source) => `/clients/${encodePathValue(id)}/sales-imports/${encodePathValue(source)}`
    ,salesRows: (id) => `/clients/${encodePathValue(id)}/sales-data/rows`
    ,salesReconciliation: (id) => `/clients/${encodePathValue(id)}/sales-reconciliation`
    ,salesSubmit: (id) => `/clients/${encodePathValue(id)}/sales-data/submit`
    ,salesManagerReview: (id) => `/clients/${encodePathValue(id)}/sales-data/manager-review`
    ,salesComplianceReview: (id) => `/clients/${encodePathValue(id)}/sales-data/compliance-review`
    ,purchaseEmailProof: (id) => `/clients/${encodePathValue(id)}/purchase-proof/email`
  },
  purchaseProofs: {
    detail: (id) => `/purchase-proofs/${encodePathValue(id)}`,
    download: (id) => `/purchase-proofs/${encodePathValue(id)}/download`,
    attachment: (id, attachmentId) => `/purchase-proofs/${encodePathValue(id)}/attachments/${encodePathValue(attachmentId)}/download`
  },
  quotations: {
    list: '/quotations',
    create: '/quotations',
    bulk: '/quotations/bulk',
    serviceCategories: '/quotations/service-categories',
    piboCategories: '/quotations/pibo-categories',
    dropdownOptions: '/quotations/dropdown-options',
    approveAllPending: '/quotations/pending-approvals/approve-all',
    detail: (id) => `/quotations/${encodePathValue(id)}`,
    approval: (id) => `/quotations/${encodePathValue(id)}/approval`,
    byLead: (leadId) => `/leads/${encodePathValue(leadId)}/quotations`
  },
  proformaInvoices: {
    list: '/proforma-invoices',
    create: '/proforma-invoices',
    detail: (id) => `/proforma-invoices/${encodePathValue(id)}`
  },
  annualReturns: {
    list: '/annual-returns'
  },
  notifications: {
    list: '/notifications',
    create: '/notifications',
    detail: (id) => `/notifications/${encodePathValue(id)}`,
    clear: (id) => `/notifications/${encodePathValue(id)}`
  },
  calendarItems: {
    list: '/calendar-items',
    create: '/calendar-items',
    detail: (id) => `/calendar-items/${encodePathValue(id)}`
  },
  supportTickets: {
    list: '/support-tickets',
    create: '/support-tickets',
    detail: (id) => `/support-tickets/${encodePathValue(id)}`
  },
  teams: {
    list: '/teams',
    create: '/teams',
    detail: (id) => `/teams/${encodePathValue(id)}`
  },
  internalTickets: {
    list: '/internal-tickets',
    create: '/internal-tickets',
    detail: (id) => `/internal-tickets/${encodePathValue(id)}`,
    call: (id) => `/internal-tickets/${encodePathValue(id)}/call`
  },
  healthReports: {
    list: '/health-report-assignments',
    create: '/health-report-assignments',
    assign: (id) => `/health-report-assignments/${encodePathValue(id)}/assign`
  },
  activityLogs: { list: '/activity-logs', stats: '/activity-logs/stats', filters: '/activity-logs/filters', detail: (id) => `/activity-logs/${encodePathValue(id)}` }
};

export { API_ENDPOINTS };
export default API_ENDPOINTS;
