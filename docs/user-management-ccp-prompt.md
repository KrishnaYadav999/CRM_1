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

## CRM and CCP Two-Way User Sync

CRM already supports the two-way user sync contract below. Build the same contract in CCP.

### CRM to CCP
When a user is created or updated in CRM, CRM posts to:

- `POST https://ccp-henna.vercel.app/api/crm/users/sync`

Use environment override in CRM backend:

- `CCP_USER_SYNC_URL=https://ccp-henna.vercel.app/api/crm/users/sync`
- `CCP_SHARED_SECRET=<same secret in CRM and CCP>`
- `CCP_SYNC_PASSWORD=true` only if CCP should receive first-login password during create.

CRM sends payload:

```json
{
  "action": "create",
  "crmUserId": "crm mongo id",
  "ccpUserId": "existing ccp id if linked",
  "name": "User Name",
  "email": "user@example.com",
  "avatarUrl": "",
  "role": "manager",
  "team": "Operations",
  "teamId": "optional crm team id",
  "managerId": "optional crm manager id",
  "operationHeadId": "optional crm operation head id",
  "isActive": true,
  "source": "crm",
  "createdAt": "date",
  "updatedAt": "date"
}
```

CCP must upsert by `crmUserId`, then by `email`. CCP response should include the final CCP user id:

```json
{
  "ok": true,
  "ccpUserId": "ccp user id",
  "user": {
    "_id": "ccp user id",
    "crmUserId": "crm mongo id",
    "email": "user@example.com"
  }
}
```

### CCP to CRM
When a user is created or updated in CCP, CCP must post to CRM:

- `POST <CRM_BACKEND_URL>/api/auth/ccp/users/sync`
- Header: `x-ccp-secret: <same shared secret>`

Payload:

```json
{
  "action": "create",
  "ccpUserId": "ccp user id",
  "name": "User Name",
  "email": "user@example.com",
  "role": "operation",
  "team": "No team assigned",
  "teamId": "",
  "managerId": "",
  "operationHeadId": "",
  "avatarUrl": "",
  "isActive": true,
  "source": "ccp",
  "password": "optional minimum 8 chars"
}
```

CRM will upsert by `ccpUserId`, then by `email`. If email belongs to another linked user, CRM returns `409` so CCP should show a clear duplicate email error.

### CRM User Pull for CCP
CCP can fetch active CRM users from:

- `GET <CRM_BACKEND_URL>/api/auth/ccp/users`
- Header: `x-ccp-secret: <same shared secret>`

This returns active CRM users with `id`, `_id`, `ccpUserId`, `source`, `name`, `email`, `role`, `team`, `teamId`, `managerId`, `operationHeadId`, `avatarUrl`, `isActive`, `createdAt`, and `updatedAt`.

### CCP Implementation Prompt
Build CCP user management sync with CRM. Add `POST /api/crm/users/sync` in CCP to receive CRM-created and CRM-updated users. Upsert by `crmUserId`, then email, save `crmUserId`, and return `{ ok: true, ccpUserId, user }`. On CCP user create/update, call CRM `POST /api/auth/ccp/users/sync` with `x-ccp-secret`, stable `ccpUserId`, email, role, team, manager, operation head, active status, and source `ccp`. Also add a manual resync button in CCP admin that calls CRM `GET /api/auth/ccp/users` and upserts active CRM users into CCP. Never create duplicate users for the same email or same linked id.
