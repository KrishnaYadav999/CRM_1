# User Management Logic for CCP

Build a User Management module that matches CRM behavior.

## Roles
- `superadmin`, `admin`: can create, edit, activate/deactivate users, create teams, assign managers, assign operation heads.
- `manager`: can see users assigned under their `managerId` and team-level work.
- `operation`: normal working user assigned to a manager/team.
- `compliance`, `sales`: role-specific users with normal login access.

## User Fields
- `name`
- `email` unique, lowercase
- `password` for first login/create
- `role`
- `team`
- `teamId`
- `managerId`
- `operationHeadId` optional
- `avatarUrl`
- `isActive`
- `source`
- `ccpUserId`

## Team Creation Rules
- Team name is required and unique.
- Manager is required.
- Operation Head is optional.
- Members are selected users under that manager.
- When team is created:
  - selected members get `teamId`, `team`, `managerId`
  - if operation head is selected, members also get `operationHeadId`
  - manager gets `teamId`, `team`, and optional `operationHeadId`
  - operation head gets `teamId`, `team` if selected

## Visibility Rules
- Admin/superadmin sees all users and teams.
- Manager sees:
  - themselves
  - users where `managerId === manager._id`
  - users in teams where they are `manager`
- Operation user sees only their own records and assigned client/work data.

## Team Modal UX
- Select Manager first.
- Operation Head select is optional.
- User list should show only active users mapped under the selected manager.
- If no manager is selected, show empty state: `Select manager first.`
- If selected manager has no users, show: `No active users are mapped under this manager yet.`

## API Prompt
Create backend APIs:
- `GET /api/auth/admin/users`: admin-only list all users without password/OTP.
- `GET /api/auth/users`: active users visible to current user.
- `POST /api/auth/admin/create-user`: create user with role/team/manager/operationHead fields.
- `PUT /api/auth/admin/users/:id`: update user profile, role, active status, manager/team mapping.
- `GET /api/teams`: list teams with populated members, manager, operationHead.
- `POST /api/teams`: create team with required manager and optional operationHead.

Create frontend:
- User table with search, active/inactive filter, edit/view actions.
- Add User modal with role, team, manager, operation head fields.
- Create Team modal with manager required, operation head optional, member list filtered by selected manager.
- Use fast loading for User Management: only fetch `me`, `users`, and `teams`; do not fetch leads, clients, quotations, or annual return data on this route.
