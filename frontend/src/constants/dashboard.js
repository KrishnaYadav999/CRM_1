import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileText,
  Gauge,
  Home,
  Megaphone,
  LifeBuoy,
  MessagesSquare,
  UserRound,
  Users,
  BarChart3
} from 'lucide-react'

export const roles = ['operation', 'admin', 'superadmin', 'manager', 'compliance', 'sales', 'accounts']
export const adminRoles = ['admin', 'superadmin']
export const isComplianceRole = (role = '') => String(role).trim().toLowerCase().replace(/[\s_-]+/g, '').includes('compliance')
export const defaultTeams = ['No team assigned', 'Operations', 'Compliance', 'Sales', 'Accounts', 'Client Success', 'Management']

export const roleLabels = {
  operation: 'Operation',
  admin: 'Admin',
  superadmin: 'Super Admin',
  manager: 'Manager',
  compliance: 'Compliance Manager',
  sales: 'Sales',
  accounts: 'Accounts'
}

export const defaultUserForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  avatarUrl: '',
  role: 'operation',
  team: 'No team assigned',
  teamId: '',
  managerId: '',
  operationHeadId: '',
  isActive: true
}

export const navSections = [
  {
    label: 'Operations',
    items: [
      {
        label: 'Home',
        icon: Home,
        children: [
          { label: 'Dashboard', icon: Gauge, path: '/dashboard', roles: adminRoles },
          { label: 'Super Admin Dashboard', icon: Gauge, path: '/superadmin-dashboard', roles: adminRoles },
          { label: 'MIS', icon: BarChart3, path: '/mis', roles: [...adminRoles, 'manager', 'operation head', 'operations head'] },
          { label: 'Pending Approval', icon: Clock3, path: '/pending-approval', roles: [...adminRoles, 'compliance'], complianceFamily: true },
          {
            label: 'Pending Leads',
            icon: ClipboardList,
            roles: adminRoles,
            children: [
              { label: 'Lead Open', icon: Clock3, path: '/pending-leads/open' },
              { label: 'Lead Close', icon: ClipboardList, path: '/pending-leads/closed' }
            ]
          },
          { label: 'Notifications', icon: Bell, path: '/notifications' },
          { label: 'Announcements', icon: Megaphone, path: '/announcements' },
          { label: 'Calendar', icon: CalendarDays, path: '/calendar' },
          { label: 'User Management', icon: Users, path: '/dashboard/users' }
        ]
      }
    ]
  },
  {
    label: 'Customer Hub',
    items: [
      {
        label: 'Customer Hub',
        icon: BriefcaseBusiness,
        children: [
          { label: 'Lead Generation', icon: ClipboardList, path: '/sales/lead-generation' },
          { label: 'Client Master', icon: UserRound, path: '/sales/client-master' },
          { label: 'Health Report Check', icon: ClipboardList, path: '/sales/health-report-check' },
          { label: 'Add Quotation', icon: FileText, path: '/sales/quotations?mode=add' },
          { label: 'Proforma Invoice', icon: FileText, path: '/sales/proforma-invoices' }
        ]
      }
    ]
  },
  {
    label: 'Help',
    items: [
      {
        label: 'Help Yourself',
        icon: FileText,
        path: '/help-yourself'
      },
      {
        label: 'Internal Tickets',
        icon: MessagesSquare,
        path: '/internal-tickets'
      },
      {
        label: 'Support Tickets',
        icon: LifeBuoy,
        path: '/support-tickets'
      }
    ]
  }
]
