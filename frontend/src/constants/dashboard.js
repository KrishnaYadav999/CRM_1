import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileStack,
  FileText,
  Gauge,
  Headphones,
  Home,
  UserRound,
  Users
} from 'lucide-react'

export const roles = ['operation', 'admin', 'superadmin', 'manager', 'compliance', 'sales']
export const adminRoles = ['admin', 'superadmin']
export const defaultTeams = ['No team assigned', 'Operations', 'Compliance', 'Sales', 'Client Success', 'Management']

export const roleLabels = {
  operation: 'Operation',
  admin: 'Admin',
  superadmin: 'Super Admin',
  manager: 'Manager',
  compliance: 'Compliance Manager',
  sales: 'Sales'
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
          { label: 'Dashboard', icon: Gauge, path: '/dashboard' },
          { label: 'Pending Approval', icon: Clock3, path: '/pending-approval' },
          { label: 'Notifications', icon: Bell, path: '/notifications' },
          { label: 'Calendar', icon: CalendarDays, path: '/calendar' },
          { label: 'User Management', icon: Users, path: '/dashboard/users' }
        ]
      }
    ]
  },
  {
    label: 'Sales',
    items: [
      {
        label: 'Sales',
        icon: BriefcaseBusiness,
        children: [
          { label: 'Lead Generation', icon: ClipboardList, path: '/sales/lead-generation' },
          { label: 'Client Master', icon: UserRound, path: '/sales/client-master' },
          { label: 'Add Quotation', icon: FileText, path: '/sales/quotations?mode=add' }
        ]
      },
      { label: 'Client Data Processing', icon: FileStack },
      { label: 'Client Connect', icon: Headphones }
    ]
  }
]
