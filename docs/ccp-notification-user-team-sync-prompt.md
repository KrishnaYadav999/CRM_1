# CCP Notification, User, and Team Sync Prompt

Use this prompt/contract in CCP so CRM and CCP stay synced for notifications, users, and teams.

## Goal

CRM and CCP must behave like one connected system:

- Notification created in CRM should appear in CCP.
- Notification created in CCP should appear in CRM.
- User created/updated in CRM should appear/update in CCP.
- User created/updated in CCP should appear/update in CRM.
- Team created in CRM should appear in CCP.
- Team created in CCP should appear in CRM.
- Never create duplicates for the same email, same CRM id, or same CCP id.

## Shared Security

Use one shared secret in both apps.

CRM env:

```env
CCP_SHARED_SECRET=same-secret-here
CCP_USER_SYNC_URL=https://ccp-henna.vercel.app/api/crm/users/sync
CCP_NOTIFICATION_SYNC_URL=https://ccp-henna.vercel.app/api/crm/notifications/sync
CCP_TEAM_SYNC_URL=https://ccp-henna.vercel.app/api/crm/teams/sync
```

CCP env:

```env
CRM_BACKEND_URL=https://your-crm-backend-url.com
CCP_SHARED_SECRET=same-secret-here
```

Every cross-app request must send:

```http
x-ccp-secret: same-secret-here
Content-Type: application/json
```

## Notification Bell Logic

### Notification Model

Create the same notification fields in CCP:

```js
{
  title: String,
  description: String,
  tag: String,
  status: String, // Active or Inactive
  kind: String, // announcement, todo, follow-up, workflow
  createdByName: String,
  createdBy: ObjectId,
  audience: [ObjectId],
  visibleToRoles: [String],
  attachmentName: String,
  attachmentUrl: String,
  pinned: Boolean,
  metadata: Object,
  readBy: [ObjectId],
  crmNotificationId: String,
  ccpNotificationId: String,
  source: String // crm or ccp
}
```

### Bell Count Rules

Bell count should include:

- Active unread notifications visible to current user.
- Active todo/follow-up reminders assigned to current user.
- Active pinned announcements visible to user.

A notification is visible when:

- user role is `admin` or `superadmin`, or
- user id is in `audience`, or
- user role is in `visibleToRoles`, or
- `kind` is `announcement`.

Unread means current user id is not present in `readBy`.

### Bell API Required In CCP

Create:

```http
GET /api/notifications
POST /api/notifications
PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
```

`GET /api/notifications` response:

```json
{
  "ok": true,
  "notifications": [],
  "unreadCount": 0
}
```

`POST /api/notifications` should create the notification locally and then sync it to CRM.

### CRM to CCP Notification Sync

CCP must create this endpoint:

```http
POST /api/crm/notifications/sync
```

Payload from CRM:

```json
{
  "action": "create",
  "crmNotificationId": "crm notification mongo id",
  "ccpNotificationId": "",
  "title": "Notification title",
  "description": "Notification body",
  "tag": "Training Material",
  "status": "Active",
  "kind": "announcement",
  "createdByName": "CRM Admin",
  "audience": [],
  "visibleToRoles": ["operation", "manager", "compliance", "sales", "admin", "superadmin"],
  "attachmentName": "",
  "attachmentUrl": "",
  "pinned": false,
  "metadata": {},
  "source": "crm"
}
```

CCP upsert rule:

1. Find by `crmNotificationId`.
2. If not found, find by `title + createdAt/source` only as fallback.
3. Update existing or create new.
4. Return final CCP notification id.

Response:

```json
{
  "ok": true,
  "ccpNotificationId": "ccp notification id",
  "notification": {
    "_id": "ccp notification id",
    "crmNotificationId": "crm notification id"
  }
}
```

### CCP to CRM Notification Sync

When notification is created/updated in CCP, call CRM:

```http
POST <CRM_BACKEND_URL>/api/notifications/ccp/sync
```

Payload:

```json
{
  "action": "create",
  "ccpNotificationId": "ccp notification id",
  "crmNotificationId": "",
  "title": "Notification title",
  "description": "Notification body",
  "tag": "Training Material",
  "status": "Active",
  "kind": "announcement",
  "createdByName": "CCP Admin",
  "audience": [],
  "visibleToRoles": ["operation", "manager", "compliance", "sales", "admin", "superadmin"],
  "attachmentName": "",
  "attachmentUrl": "",
  "pinned": false,
  "metadata": {},
  "source": "ccp"
}
```

CRM should upsert by `ccpNotificationId`, then return `crmNotificationId`.

## User Sync Logic

CRM already has:

```http
POST /api/auth/ccp/users/sync
GET /api/auth/ccp/users
```

CCP must add:

```http
POST /api/crm/users/sync
```

### CRM to CCP User Payload

```json
{
  "action": "create",
  "crmUserId": "crm user id",
  "ccpUserId": "",
  "name": "User Name",
  "email": "user@example.com",
  "avatarUrl": "",
  "role": "manager",
  "team": "Operations",
  "teamId": "crm team id",
  "managerId": "crm manager id",
  "operationHeadId": "crm operation head id",
  "isActive": true,
  "source": "crm"
}
```

CCP upsert rule:

1. Find by `crmUserId`.
2. If not found, find by lowercase `email`.
3. Save `crmUserId`.
4. Return `ccpUserId`.

### CCP to CRM User Payload

When user is created/updated in CCP, call:

```http
POST <CRM_BACKEND_URL>/api/auth/ccp/users/sync
```

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

If CRM returns `409`, show duplicate email error in CCP.

## Team Sync Logic

Team fields must exist in both apps:

```js
{
  name: String,
  description: String,
  members: [ObjectId],
  manager: ObjectId,
  operationHead: ObjectId,
  crmTeamId: String,
  ccpTeamId: String,
  source: String
}
```

### Team Creation Rules

- Team name is required.
- Manager is required.
- Operation Head is optional.
- Members must be active users.
- When team is created, update mapped users:
  - members get `teamId`, `team`, `managerId`, and optional `operationHeadId`
  - manager gets `teamId`, `team`, and optional `operationHeadId`
  - operation head gets `teamId`, `team`

### CRM to CCP Team Sync

CCP must add:

```http
POST /api/crm/teams/sync
```

Payload:

```json
{
  "action": "create",
  "crmTeamId": "crm team id",
  "ccpTeamId": "",
  "name": "Operations Team",
  "description": "Team description",
  "managerId": "crm manager id",
  "operationHeadId": "crm operation head id",
  "members": ["crm user id 1", "crm user id 2"],
  "source": "crm"
}
```

CCP upsert rule:

1. Find team by `crmTeamId`.
2. If not found, find by lowercase team name.
3. Resolve CRM user ids to CCP users using `crmUserId`.
4. Save mapped CCP user ids in `manager`, `operationHead`, and `members`.
5. Update every mapped user with team details.
6. Return `ccpTeamId`.

### CCP to CRM Team Sync

When team is created/updated in CCP, call:

```http
POST <CRM_BACKEND_URL>/api/teams/ccp/sync
```

Payload:

```json
{
  "action": "create",
  "ccpTeamId": "ccp team id",
  "crmTeamId": "",
  "name": "Operations Team",
  "description": "Team description",
  "managerId": "ccp manager id",
  "operationHeadId": "ccp operation head id",
  "members": ["ccp user id 1", "ccp user id 2"],
  "source": "ccp"
}
```

CRM upsert rule:

1. Find by `ccpTeamId`.
2. If not found, find by lowercase team name.
3. Resolve CCP user ids to CRM users using `ccpUserId`.
4. Save mapped CRM user ids in `manager`, `operationHead`, and `members`.
5. Update every mapped CRM user with team details.
6. Return `crmTeamId`.

## Manual Resync Buttons In CCP Admin

Add three admin buttons:

- `Sync CRM Users`
- `Sync CRM Teams`
- `Sync CRM Notifications`

These buttons call CRM pull APIs and upsert into CCP:

```http
GET <CRM_BACKEND_URL>/api/auth/ccp/users
GET <CRM_BACKEND_URL>/api/teams/ccp
GET <CRM_BACKEND_URL>/api/notifications/ccp
```

All requests include `x-ccp-secret`.

## Duplicate Prevention

Users:

- Unique by `crmUserId`
- Unique by `ccpUserId`
- Unique by lowercase `email`

Teams:

- Unique by `crmTeamId`
- Unique by `ccpTeamId`
- Unique by lowercase `name`

Notifications:

- Unique by `crmNotificationId`
- Unique by `ccpNotificationId`

## Exact CCP Prompt

Build two-way sync between CCP and CRM for users, teams, and notifications. Add CCP endpoints `POST /api/crm/users/sync`, `POST /api/crm/teams/sync`, and `POST /api/crm/notifications/sync`. Each endpoint must validate `x-ccp-secret`, then upsert records without duplicates. Users should upsert by `crmUserId`, then lowercase email. Teams should upsert by `crmTeamId`, then lowercase team name, and resolve user mappings through `crmUserId`. Notifications should upsert by `crmNotificationId`. When CCP creates or updates a user, team, or notification, CCP must call CRM using `CRM_BACKEND_URL` and send `x-ccp-secret`: users to `/api/auth/ccp/users/sync`, teams to `/api/teams/ccp/sync`, and notifications to `/api/notifications/ccp/sync`. Add notification bell logic in CCP: show unread active notifications visible to the logged-in user by audience, role, or announcement kind; include assigned todo/follow-up reminders; play sound only when unread count increases; add mark-read and mark-all-read APIs. Add manual admin resync buttons for CRM users, teams, and notifications. Never create duplicate users, teams, or notifications for the same linked id, email, or team name.

## Create Admin User and Team Exact Logic

Use this section for the Admin/User Management flow in both CRM and CCP.

### Create Admin User In CRM

When CRM admin creates a user:

1. Validate `name`, lowercase `email`, `password` minimum 8 chars, and valid `role`.
2. Reject duplicate lowercase email in CRM.
3. Hash password and save CRM user.
4. Ensure `crmUserId` is saved as CRM user `_id`.
5. Immediately call CCP:

```http
POST ${CCP_USER_SYNC_URL}
x-ccp-secret: ${CCP_SHARED_SECRET}
Content-Type: application/json
```

Payload:

```json
{
  "action": "create",
  "crmUserId": "crm user _id",
  "ccpUserId": "",
  "name": "Admin User",
  "email": "admin@example.com",
  "password": "first login password",
  "role": "admin",
  "team": "No team assigned",
  "teamId": "",
  "managerId": "",
  "operationHeadId": "",
  "avatarUrl": "",
  "isActive": true,
  "source": "crm"
}
```

After CCP response:

- Read `response.ccpUserId`, `response.user.id`, or `response.user._id`.
- Save it in CRM user as `ccpUserId`.
- If CCP returns `409`, show duplicate email warning.
- If CCP returns non-2xx, keep CRM user created but show/admin-log: `CCP sync pending`.

### Create Admin User In CCP

When CCP admin creates a user:

1. Validate `name`, lowercase `email`, `password` minimum 8 chars, and valid `role`.
2. Reject duplicate lowercase email in CCP.
3. Hash password and save CCP user.
4. Ensure `ccpUserId` is saved as CCP user `_id`.
5. Immediately call CRM:

```http
POST ${CRM_BACKEND_URL}/api/auth/ccp/users/sync
x-ccp-secret: ${CCP_SHARED_SECRET}
Content-Type: application/json
```

Payload:

```json
{
  "action": "create",
  "ccpUserId": "ccp user _id",
  "crmUserId": "",
  "name": "Admin User",
  "email": "admin@example.com",
  "password": "first login password",
  "role": "admin",
  "team": "No team assigned",
  "teamId": "",
  "managerId": "",
  "operationHeadId": "",
  "avatarUrl": "",
  "isActive": true,
  "source": "ccp"
}
```

After CRM response:

- Read `response.crmUserId` or `response.user.crmUserId`.
- Save it in CCP user as `crmUserId`.
- If CRM returns `409`, show duplicate email warning.
- If CRM returns non-2xx, keep CCP user created but show/admin-log: `CRM sync pending`.

### Create Team In CRM

When CRM admin creates a team:

1. Validate team `name` required and unique by lowercase name.
2. Validate `managerId` required.
3. Validate `operationHeadId` optional.
4. Validate all selected members are active users.
5. Save CRM team with `crmTeamId` equal to team `_id`.
6. Update mapped CRM users:
   - members get `teamId`, `team`, `managerId`, optional `operationHeadId`
   - manager gets `teamId`, `team`, optional `operationHeadId`
   - operation head gets `teamId`, `team`
7. Immediately call CCP:

```http
POST ${CCP_TEAM_SYNC_URL}
x-ccp-secret: ${CCP_SHARED_SECRET}
Content-Type: application/json
```

Payload:

```json
{
  "action": "create",
  "crmTeamId": "crm team _id",
  "ccpTeamId": "",
  "name": "Operations Team",
  "description": "Team description",
  "managerId": "crm manager user _id",
  "operationHeadId": "crm operation head user _id",
  "members": ["crm member user _id"],
  "source": "crm"
}
```

CCP must resolve user ids by `crmUserId`, create/update CCP team, update CCP users, and return `ccpTeamId`.

### Create Team In CCP

When CCP admin creates a team:

1. Validate team `name` required and unique by lowercase name.
2. Validate `managerId` required.
3. Validate `operationHeadId` optional.
4. Validate all selected members are active users.
5. Save CCP team with `ccpTeamId` equal to team `_id`.
6. Update mapped CCP users:
   - members get `teamId`, `team`, `managerId`, optional `operationHeadId`
   - manager gets `teamId`, `team`, optional `operationHeadId`
   - operation head gets `teamId`, `team`
7. Immediately call CRM:

```http
POST ${CRM_BACKEND_URL}/api/teams/ccp/sync
x-ccp-secret: ${CCP_SHARED_SECRET}
Content-Type: application/json
```

Payload:

```json
{
  "action": "create",
  "ccpTeamId": "ccp team _id",
  "crmTeamId": "",
  "name": "Operations Team",
  "description": "Team description",
  "managerId": "ccp manager user _id",
  "operationHeadId": "ccp operation head user _id",
  "members": ["ccp member user _id"],
  "source": "ccp"
}
```

CRM resolves user ids by `ccpUserId`, creates/updates CRM team, updates CRM users, and returns `crmTeamId`.

## Create User and Team Prompt For CCP

Build CCP Admin User and Team Management with CRM two-way sync.

When a user is created or updated in CCP, save it locally first, then call CRM `POST ${CRM_BACKEND_URL}/api/auth/ccp/users/sync` with `x-ccp-secret`. Send `ccpUserId`, optional `crmUserId`, lowercase `email`, `name`, `password` only on create, `role`, `team`, `teamId`, `managerId`, `operationHeadId`, `avatarUrl`, `isActive`, and `source: "ccp"`. CRM will upsert by `ccpUserId`, then email, and return `crmUserId`. Save returned `crmUserId` back into CCP user. Do not create duplicate users for the same email, `crmUserId`, or `ccpUserId`.

When a team is created or updated in CCP, save it locally first, update CCP users with team mapping, then call CRM `POST ${CRM_BACKEND_URL}/api/teams/ccp/sync` with `x-ccp-secret`. Send `ccpTeamId`, optional `crmTeamId`, team `name`, `description`, `managerId`, optional `operationHeadId`, `members`, and `source: "ccp"`. CRM will resolve CCP user ids using `ccpUserId`, upsert by `ccpTeamId`, then lowercase team name, update CRM users with team mapping, and return `crmTeamId`. Save returned `crmTeamId` back into CCP team. Do not create duplicate teams for the same name, `crmTeamId`, or `ccpTeamId`.

Also implement manual buttons in CCP admin: `Sync CRM Users` and `Sync CRM Teams`. `Sync CRM Users` calls CRM `GET /api/auth/ccp/users`; `Sync CRM Teams` calls CRM `GET /api/teams/ccp`. Both requests must include `x-ccp-secret` and upsert records locally without duplicates.
