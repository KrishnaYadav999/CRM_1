# CCP Prompt: CRM Client Master Write and Bulk Import

```text
Add secure CRM-to-CCP Client Master write APIs. CCP is the only database owner; CRM must not persist imported Client Master rows locally.

Use the existing CCP clientController create/update logic, normalization, ownership mapping, pending approvals and output normalization. Do not duplicate that business logic.

Protect these routes with the existing shared-key middleware (`x-ccp-secret` or `x-ccp-api-key`):
- POST /api/ccp/clients
- POST /api/ccp/clients/bulk
- PUT /api/ccp/clients/:id

Use the same `CCP_SHARED_SECRET` value already configured in CRM and CCP.

POST /api/ccp/clients:
- Receive the CRM sanitized nested Client payload.
- Resolve the creator from `createdByCrmUserId` or lowercase `createdByEmail` when possible.
- Save only to CCP MongoDB.
- Return HTTP 201 `{ ok: true, client }`.

POST /api/ccp/clients/bulk:
- Accept `{ clients: [...] }` and support at least 1000 rows.
- Run each row through the existing `createClientRecord` logic.
- Use one-based failure row numbers.
- Return `{ ok, imported, failed, clients, failures: [{ row, error }] }`.
- Return HTTP 201 for full/partial success and 400 only if every row fails.
- Add idempotency using `data.importMeta.uniqueId`, then `data.importMeta.ccpClientId`, then a documented normalized business key. Retrying the same file must not duplicate clients.

PUT /api/ccp/clients/:id:
- Update by CCP `_id` or stable import unique id.
- Save only in CCP and return `{ ok: true, client }`.

Important routing fix:
- `/api/ccp/clients` currently has only GET in `backend/src/routes/ccp.js`.
- Add the three write routes above to that same router.
- Export/reuse service-safe controller functions instead of calling Express handlers with a fake user.
- Shared-key requests may have no CCP JWT user. Build a service identity from `createdByName`, `createdByEmail`, and `createdByCrmUserId`, and safely resolve mapped CCP users.

Preserve the complete nested payload: `selectedLead`, `adminControls`, `data.basic`, registered/communication addresses, compliance, CPCB, validation, OTP, authorised/coordinating people, MSME rows, CTE plant details, importMeta, onboarding years and workflowStatus.

Return JSON for every error. Add tests for secret authentication, single create, 265-row bulk import, partial failure, one-based row errors, idempotent retry, GET visibility, and confirmation that CRM MongoDB receives no Client copy.
```
