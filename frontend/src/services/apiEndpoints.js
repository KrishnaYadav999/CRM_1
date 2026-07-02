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
    approveAllPending: '/quotations/pending-approvals/approve-all',
    detail: (id) => `/quotations/${encodePathValue(id)}`,
    approval: (id) => `/quotations/${encodePathValue(id)}/approval`
  },
  annualReturns: {
    list: '/annual-returns'
  },
  notifications: {
    list: '/notifications',
    create: '/notifications'
  },
  teams: {
    list: '/teams',
    create: '/teams',
    detail: (id) => `/teams/${encodePathValue(id)}`
  },
  ccp: {
    leads: '/ccp/leads',
    clients: '/ccp/clients',
    collection: (path) => `/ccp/${encodePathValue(path)}`
  }
};

export { API_ENDPOINTS };
export default API_ENDPOINTS;
