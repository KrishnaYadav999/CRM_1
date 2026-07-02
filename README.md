<<<<<<< HEAD
# Green CRM

MERN CRM with admin-created users, role assignment, and OTP email login.

## Run Locally

1. Start MongoDB locally.
2. Install dependencies:

```bash
npm run install:all
```

3. Seed the superadmin:

```bash
npm run seed:admin
```

4. Start backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:6173`  
Backend: `http://localhost:6000`

## Login Flow

- No public registration page.
- Admin/superadmin creates users and assigns roles.
- User enters email on login.
- CRM sends OTP to that email.
- User verifies OTP and enters the dashboard.

## Roles

`operation`, `admin`, `superadmin`, `manager`, `compliance`, `sales`
=======
# CRM
>>>>>>> 98b9c8806fb0af9076ad79cd2e2ce7b7cfe74544
