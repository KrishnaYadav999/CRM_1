# CCP Lead Sync Logic and Prompt

Use this prompt/contract when building or fixing the CCP lead API used by CRM.

## Goal
CRM must always receive stable lead data from CCP. Temporary API failure, slow hosting, or empty upstream response must not make CRM leads disappear.

## Required CCP API
Create or update:

- `GET /api/ccp/leads`
- `GET /api/ccp/clients`

Both APIs must return JSON:

```json
{
  "ok": true,
  "leads": [],
  "source": "ccp-direct"
}
```

For clients, use `"clients"` instead of `"leads"`.

## Lead Fields
Each lead should include these fields wherever available:

- `_id` or `id`
- `sourceLeadId`
- `leadCode`
- `company` or `companyName`
- `status`
- `industryType`
- `piboCategory`
- `eprCategory`
- `servicesOffered`
- `addressLine1`
- `addressLine2`
- `addressLine3`
- `city`
- `state`
- `pinCode`
- `existingClient`
- `website`
- `contactPerson`
- `designation`
- `emails`
- `mobileNo1`
- `mobileNo2`
- `assignedTo` or `assignedToText`
- `createdBy`
- `createdAt`
- `updatedAt`

## Stability Rules
- Never send duplicate leads with changing IDs.
- Keep `_id`, `id`, `sourceLeadId`, and `leadCode` stable for the same lead.
- Do not return an empty array when MongoDB/API has a temporary timeout.
- Keep a server-side last-good cache for CCP leads and clients.
- If live fetch fails but cache exists, return:

```json
{
  "ok": true,
  "leads": ["last good rows here"],
  "source": "ccp-cache",
  "warning": "Live CCP fetch failed, returned cached data"
}
```

- Only return `ok: false` with an empty array when there is no live data and no cached data.

## CRM Side Behavior
CRM already protects the UI by:

- merging CRM leads and CCP leads by stable lead identity
- using `sessionStorage` and `localStorage` last-good cache
- not overwriting cached leads with temporary empty CCP responses
- showing cached CCP data when hosting is slow or unavailable

## Implementation Prompt for CCP
Build CCP lead sync APIs for CRM. Add `GET /api/ccp/leads` and `GET /api/ccp/clients`. Normalize MongoDB rows into the field contract above. Use stable IDs, return consistent field names, and implement last-good server cache so temporary failures never return blank data if previous data exists. Return `{ ok: true, leads, source: "ccp-direct" }` for live data, `{ ok: true, leads, source: "ccp-cache" }` for cached fallback, and `{ ok: false, leads: [], error }` only when no live or cached data exists. Ensure CORS allows the CRM frontend origin and response time stays fast.
