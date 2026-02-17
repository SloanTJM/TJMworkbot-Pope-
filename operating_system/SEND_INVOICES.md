# Send Invoice Emails

You have been triggered because one or more tenants have rent due within the next 3 days. Your job is to generate and send invoice emails.

## Steps

1. **Read the Contracts sheet** using the `graph-api` skill:
   ```bash
   node /job/.pi/skills/graph-api/graph.js read Contracts
   ```
   - Row 1 is the header. Columns: Property_ID (A), Property_Type (B), Tenant_Name (C), Monthly_Rent (D), Billing_Cycle (E), Contract_Start (F), Contract_End (G), Active (H), Notify_Days (I), Vinyl_Required (J), Vinyl_Contact (K), Notes (L), Email (M)

2. **Filter to eligible tenants** — only process rows where:
   - `Active` is `TRUE`
   - `Email` is not empty
   - The tenant has a due date within the next 3 days (see billing cycle rules below)

3. **For each eligible tenant**, render the invoice email:
   - Read the HTML template at `operating_system/INVOICE_EMAIL_TEMPLATE.html`
   - Replace all placeholders (see below)
   - Write the rendered HTML to `/job/tmp/invoice_<Property_ID>.html`
   - Send via: `node /job/.pi/skills/graph-api/graph.js send-mail "<email>" "<subject>" "@/job/tmp/invoice_<Property_ID>.html"`

4. **Log results** — print a summary of what was sent and any errors.

## Billing Cycle Rules

### Monthly (`Billing_Cycle = "monthly"`)
Due on the 1st of each month. Send invoice 3 days before (around the 28th-29th of the prior month).

### 4-Week (`Billing_Cycle = "4-week"`)
Due every 28 days from `Contract_Start`. To calculate the next due date:
1. Start from `Contract_Start`
2. Add 28 days repeatedly until you reach a date in the future
3. That's the next due date

**Example:** Contract starts 2025-12-01. Due dates: 2025-12-29, 2026-01-26, 2026-02-23, 2026-03-23, 2026-04-20, 2026-05-18.

### Pass-Through (`Billing_Cycle = "pass-through"`)
Skip — these are utility-only properties with no regular rent invoice.

## Template Placeholders

| Placeholder | Value |
|---|---|
| `{{DATE}}` | Today's date (e.g., February 16, 2026) |
| `{{INVOICE_NUMBER}}` | `INV-<Property_ID>-<YYYYMMDD>` using the due date |
| `{{TENANT_NAME}}` | From Contracts `Tenant_Name` |
| `{{TENANT_ADDRESS}}` | From Contracts `Notes` field (contains mailing address) |
| `{{TENANT_CITY_STATE_ZIP}}` | Leave blank if not separately available (address is in Notes) |
| `{{PROPERTY_ADDRESS}}` | Look up from the property table below |
| `{{RENT_AMOUNT}}` | From Contracts `Monthly_Rent`, formatted as `$X,XXX.00` |
| `{{DUE_DATE}}` | The calculated due date (e.g., February 23, 2026) |
| `{{PAYABLE_ENTITY}}` | `Turrentine Jackson Morrow` |
| `{{CONTACT_EMAIL}}` | `Sloan@tjmfuneral.com` |
| `{{CONTACT_PHONE}}` | `(972) 632-2787` |

If `{{TENANT_ADDRESS}}` or `{{TENANT_CITY_STATE_ZIP}}` cannot be parsed from the Notes field, omit those lines from the rendered HTML (remove the `<br>` too so there's no blank line).

## Property Address Lookup

| Property_ID | Address |
|---|---|
| Board_304L | US 75 Northbound, Sherman, TX |
| Board_304R | US 75 Northbound, Sherman, TX |
| Board_305L | US 75 Southbound, Sherman, TX |
| Board_305R | US 75 Southbound, Sherman, TX |
| Board_TomBean | 7816 W Highway 11, Tom Bean, TX 75489 |
| Gunter_1 | 105 N 5th St, Gunter, TX 75058 |
| Leonard_1 | Leonard, TX |
| WolfeCity_1 | Wolfe City, TX |
| WolfeCity_2 | Wolfe City, TX |
| Gainesville_1 | Gainesville, TX |
| Celina | Celina, TX |
| TomBean_1 | Tom Bean, TX |

## Sender Info

- **From:** The authenticated Microsoft 365 account (Sloan@tjmfuneral.com)
- **Company:** Turrentine Jackson Morrow
- **Mailing:** PO Box 1007, McKinney, TX 75070
- **Phone:** (972) 632-2787

## Email Subject Format

`Rent Invoice - <Tenant_Name> - <Due Date Month Year>`

Example: `Rent Invoice - Tom Bean Feed & Supply - February 2026`

## Important Notes

- Create the `/job/tmp/` directory before writing files: `mkdir -p /job/tmp`
- If a contract's `Contract_End` is before the due date, skip it (expired)
- If sending fails for one tenant, continue with the others and report the error
