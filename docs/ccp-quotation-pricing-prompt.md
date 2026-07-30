# CCP Prompt: Quotation Pricing Mode Compatibility

Implement quotation pricing mode support in CCP so CRM and CCP preserve the same
quotation after create, update, sync, refresh, approval, preview, and PDF download.

## Data contract

Add these fields to the CCP quotation database model and every quotation API:

```json
{
  "pricingMode": "combined",
  "combinedBasicAmount": 50000,
  "items": [
    {
      "industryType": "Plastic Recycling",
      "serviceCategory": "Consultant Fee",
      "servicesForYear": "2025-26",
      "eprCategory": "EPR - Plastic Waste",
      "piboParent": "PIBO",
      "piboCategory": "Producer",
      "unit": "1",
      "basicAmount": 0
    }
  ]
}
```

- `pricingMode` is required and must allow only `combined` or `individual`.
- For `combined`, require one positive `combinedBasicAmount`. Item
  `basicAmount` values may be zero because the price applies to the complete
  quotation.
- For `individual`, set `combinedBasicAmount` to `0` and require one positive
  `basicAmount` on every item.
- `subtotal` and `grandTotal` must equal `combinedBasicAmount` for combined
  pricing. For individual pricing, calculate them from
  `sum((unit || 1) * basicAmount)`.
- Existing records without `pricingMode` must migrate/fallback to `individual`.

## API and sync requirements

- Return `pricingMode` and `combinedBasicAmount` from list, detail, create,
  update, bulk import, approval, history, and CRM sync endpoints.
- Never drop these fields while mapping or sanitizing quotation payloads.
- Upsert and comparison logic must include both fields so a refresh cannot
  overwrite the saved pricing choice.
- Preserve `industryType` on every quotation item.

## UI requirements

- Ask Combined Price versus Individual Price only when no saved pricing mode
  exists.
- Reopening the same saved quotation or lead must restore the database value.
- Combined mode: display only one Basic Amount input/cell for the complete
  quotation, vertically merged across all item rows.
- Individual mode: display a Basic Amount input/cell on every item row.
- Preview, approval view, history, print, and PDF must follow the same rendering.
- Display only the child PIBO category such as `Importer` or `Producer`; do not
  render `PIBO → Importer`.

## Acceptance checks

1. Save a two-row combined quotation for ₹50,000, refresh, and confirm it still
   opens as Combined without asking again.
2. Its preview and PDF show one merged ₹50,000 Basic Amount cell.
3. Save a two-row individual quotation for ₹20,000 and ₹30,000; preview and PDF
   show both row amounts and a ₹50,000 total.
4. Sync both records CRM → CCP → CRM and verify pricing fields and item industries
   remain unchanged.
