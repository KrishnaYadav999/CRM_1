# CCP Prompt: CRM Lead Create and Excel Bulk Import

Use this prompt in the CCP codebase:

```text
Implement secure CRM-to-CCP lead creation and Excel bulk import. CCP is the only database owner for these leads. CRM must never persist CRM-created or Excel-imported leads in its own Lead collection.

Required environment configuration:
- In CRM backend: CCP_API_BASE_URL=<CCP backend base URL ending in /api>
- In CRM backend: CCP_SHARED_SECRET=<one strong shared secret>
- In CCP backend: CCP_SHARED_SECRET=<the exact same shared secret>
- Restart both backends after changing environment variables.

Authentication:
- Protect every endpoint below with server-to-server authentication.
- Accept `x-ccp-secret` and compare it safely with `process.env.CCP_SHARED_SECRET`.
- If CCP_SHARED_SECRET is missing on the CCP server, return HTTP 503 with `{ "ok": false, "error": "CCP integration credential is not configured" }`.
- If the received secret is wrong/missing, return HTTP 401 with a clear JSON error.
- Never expose the shared secret to browser/frontend code or response bodies.

Implement these CCP endpoints:
1. `POST /api/ccp/leads`
   - Validate and normalize one lead.
   - Save it only in the CCP MongoDB lead collection.
   - Preserve CRM identity fields such as `createdByCrmUserId`, `createdByEmail`, `assignedToCrmUserId`, and `assignedToEmail` where supplied.
   - Generate a stable CCP `_id` and `leadCode`.
   - Return HTTP 201: `{ "ok": true, "lead": <saved CCP lead> }`.

2. `POST /api/ccp/leads/bulk`
   - Body: `{ "leads": [ ... ] }`.
   - Support at least 1000 rows without timing out; use bounded batches or MongoDB bulk operations.
   - Validate each row independently and use one-based row numbers.
   - Save valid rows only in CCP MongoDB.
   - Return HTTP 201 for full/partial success and HTTP 400 only when every row fails:
     `{ "ok": boolean, "imported": number, "failed": number, "leads": [...], "failures": [{ "row": 1, "error": "..." }] }`.

3. `PUT /api/ccp/leads/:id`
   - Update the CCP lead by CCP `_id`, `sourceLeadId`, or stable lead code as supported by the existing model.
   - Return `{ "ok": true, "lead": <updated CCP lead> }`.

4. `GET /api/ccp/leads`
   - Return `{ "ok": true, "leads": [...], "source": "ccp-direct" }` so the new rows immediately appear in CRM after import.

Lead fields to support:
`sourceLeadId`, `communicationMode`, `status`, `company`, `industryType`, `eprCategory`, `piboParent`, `piboCategory`, `servicesOffered`, `addressLine1`, `addressLine2`, `addressLine3`, `landmark`, `state`, `city`, `pinCode`, `existingClient`, `website`, `salutation`, `contactPerson`, `designation`, `emails`, `emailsSentCount`, `lastEmailSent`, `mobileNo1`, `mobileNo2`, `businessCardUrl`, `referredBy`, `source`, `notes`, `assignedToText`, `assignedToEmail`, `assignedToCrmUserId`, `assignedBy`, `importedCreatedBy`, `createdByCrmUserId`, `createdByEmail`, `leadDate`, `nextFollowUpDate`, `nextFollowUpTime`, `followUpRemarks`, `importedCreatedAt`, `importedUpdatedAt`, and `workflowStatus`.

Data rules:
- `workflowStatus` is `draft` or `submitted`.
- Excel import from CRM sends drafts.
- Normalize email casing and trim strings.
- Map CRM users by `assignedToCrmUserId`, then lowercase `assignedToEmail`; do not treat a CRM Mongo ObjectId as a CCP user ObjectId.
- Support `piboParent` values PIBO, SIMP, and PWP and validate `piboCategory` under its parent.
- Normalize legacy Excel `PIBO Category` values exactly as follows before validation/storage: `PRODUCER` -> `PIBO / Producer`; `BRAND OWNER` or `BRAND_OWNER` -> `PIBO / Brand Owner`; `IMPORTER` -> `PIBO / Importer`; `PWP` -> `PWP / PWP`; `RECYCLER` -> `PWP / Recycler`; `REFURBISHER` -> `PWP / Refurbisher`; `SIMP_PRODUCER` -> `SIMP / Producer (Small & Micro)`; `SIMP_IMPORTER_RAW` -> `SIMP / Importer of Raw Material`; `SIMP_MANUFACTURER_RAW` -> `SIMP / Manufacturer of Raw Material`; `SIMP_SELLER` -> `SIMP / Seller`.
- Add idempotency/deduplication so retrying the same imported row does not create duplicates. Prefer a supplied stable source id; otherwise use a deterministic normalized business key and document it.
- Do not call CRM to save a second Lead copy.

Compatibility:
- Keep existing CCP lead create/read behavior working.
- Ensure CORS/server routing allows calls from the CRM backend; this is server-to-server and must not depend on browser CORS alone.
- Return JSON for every success and failure.

Tests required:
- correct secret succeeds; missing/wrong secret fails;
- one lead is stored in CCP and returned;
- mixed valid/invalid bulk rows return correct one-based failures;
- retry does not duplicate leads;
- GET returns newly imported rows;
- no request writes to the CRM database.
```

After implementing CCP, configure the same non-empty `CCP_SHARED_SECRET` in both backend environments and restart both services.
