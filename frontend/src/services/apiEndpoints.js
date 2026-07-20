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
    users: '/auth/users',
    adminUsers: '/auth/admin/users',
    createUser: '/auth/admin/create-user',
    adminUser: (id) => `/auth/admin/users/${encodePathValue(id)}`
  },
  leads: {
    list: '/leads',
    create: '/leads',
    bulk: '/leads/bulk',
    detail: (id) => `/leads/${encodePathValue(id)}`
    ,history: (id) => `/leads/${encodePathValue(id)}/history`
    ,emailHistory: (id) => `/leads/${encodePathValue(id)}/history/email`
  },
  clients: {
    list: '/clients',
    create: '/clients',
    bulk: '/clients/bulk',
    pendingApprovals: '/clients/pending-approvals',
    approveAllPendingClients: '/clients/pending-approvals/clients/approve-all',
    detail: (id) => `/clients/${encodePathValue(id)}`,
    approval: (id) => `/clients/${encodePathValue(id)}/approval`,
    annualReturn: (id) => `/clients/${encodePathValue(id)}/annual-return`
  },
  quotations: {
    list: '/quotations',
    create: '/quotations',
    serviceCategories: '/quotations/service-categories',
    piboCategories: '/quotations/pibo-categories',
    approveAllPending: '/quotations/pending-approvals/approve-all',
    syncCcp: '/quotations/sync-ccp',
    detail: (id) => `/quotations/${encodePathValue(id)}`,
    approval: (id) => `/quotations/${encodePathValue(id)}/approval`,
    byLead: (leadId) => `/leads/${encodePathValue(leadId)}/quotations`
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
  teams: {
    list: '/teams',
    create: '/teams',
    detail: (id) => `/teams/${encodePathValue(id)}`
  },
  ccp: {
    leads: '/ccp/leads',
    clients: '/ccp/clients',
    createLead: '/integrations/ccp/leads',
    bulkCreateLeads: '/integrations/ccp/leads/bulk',
    updateLead: (id) => `/integrations/ccp/leads/${encodePathValue(id)}`,
    createClient: '/integrations/ccp/clients',
    bulkCreateClients: '/integrations/ccp/clients/bulk',
    bulkUpdateClientYears: '/integrations/ccp/clients/years/bulk',
    updateClient: (id) => `/integrations/ccp/clients/${encodePathValue(id)}`,
    leadHistory: (id) => `/ccp/leads/${encodePathValue(id)}/history`,
    emailHistory: (id) => `/ccp/leads/${encodePathValue(id)}/history/email`,
    collection: (path) => `/ccp/${encodePathValue(path)}`
  }
};

export { API_ENDPOINTS };
export default API_ENDPOINTS;
