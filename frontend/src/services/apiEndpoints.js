function encodePathValue(value) {
  return encodeURIComponent(String(value || '').trim());
}

const API_ENDPOINTS = {
  auth: {
    me: '/auth/me',
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
  },
  clients: {
    list: '/clients',
    create: '/clients',
    bulk: '/clients/bulk',
    bulkUpdateYears: '/clients/years/bulk',
    pendingApprovals: '/clients/pending-approvals',
    approveAllPendingClients: '/clients/pending-approvals/clients/approve-all',
    detail: (id) => `/clients/${encodePathValue(id)}`,
    approval: (id) => `/clients/${encodePathValue(id)}/approval`,
    annualReturn: (id) => `/clients/${encodePathValue(id)}/annual-return`
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
    detail: (id) => `/notifications/${encodePathValue(id)}`
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
  }
};

export { API_ENDPOINTS };
export default API_ENDPOINTS;
