# Send Invoice Emails

You have been triggered because one or more tenants have rent due within the next few days. Your job is to generate and send invoice emails.

## Steps

1. **Read the Contracts sheet** using the `graph-api` skill:
   ```bash
   node /job/.pi/skills/graph-api/graph.js read Contracts
   ```
   Row 1 is the header. Columns A-M:
   | Col | Field |
   |-----|-------|
   | A | Property_ID |
   | B | Tenant_Name |
   | C | Contact_Name |
   | D | Contact_Email |
   | E | Contact_Phone |
   | F | Monthly_Rent |
   | G | Billing_Cycle |
   | H | Contract_Start |
   | I | Contract_End |
   | J | Active |
   | K | Notify_Days |
   | L | Vinyl_Required |
   | M | Notes |

2. **Read the Properties sheet** for property addresses:
   ```bash
   node /job/.pi/skills/graph-api/graph.js read Properties
   ```
   Columns A-H: Property_ID, Property_Type, Address, City, State, ZIP, Broker, Notes

3. **Filter to eligible tenants** — only process rows where:
   - `Active` (J) is `TRUE`
   - `Contact_Email` (D) is not empty
   - `Billing_Cycle` (G) is not `pass-through`
   - The tenant has a due date within the next few days (use per-tenant `Notify_Days` from column K, default 3)

4. **For each eligible tenant**, render the invoice email:
   - Read the HTML template at `operating_system/INVOICE_EMAIL_TEMPLATE.html`
   - Replace all placeholders (see below)
   - Write the rendered HTML to `/job/tmp/invoice_<Property_ID>.html`
   - Send via: `node /job/.pi/skills/graph-api/graph.js send-mail "<email>" "<subject>" "@/job/tmp/invoice_<Property_ID>.html"`

5. **Log results** — print a summary of what was sent and any errors.

## Billing Cycle Rules

### Monthly (`Billing_Cycle = "monthly"`)
Due on the 1st of each month. Send invoice within Notify_Days before (e.g., around the 28th-29th of the prior month for 3-day notice).

### 4-Week (`Billing_Cycle = "4-week"`)
Due every 28 days from `Contract_Start`. To calculate the next due date:
1. Start from `Contract_Start`
2. Add 28 days repeatedly until you reach a date in the future
3. That's the next due date

**Note:** Contract_Start and Contract_End may be Excel serial date numbers. Convert them: serial number is days since 1900-01-01 (subtract 2 for the Lotus bug, then add to Jan 1, 1900).

### Pass-Through (`Billing_Cycle = "pass-through"`)
Skip — these are utility-only properties with no regular rent invoice.

## Template Placeholders

| Placeholder | Value |
|---|---|
| `{{DATE}}` | Today's date (e.g., February 16, 2026) |
| `{{INVOICE_NUMBER}}` | `INV-<Property_ID>-<YYYYMMDD>` using the due date |
| `{{TENANT_NAME}}` | From Contracts `Tenant_Name` (col B) |
| `{{PROPERTY_ADDRESS}}` | From Properties sheet: `Address, City, State ZIP` (look up by Property_ID) |
| `{{RENT_AMOUNT}}` | From Contracts `Monthly_Rent` (col F), formatted as `$X,XXX.00` |
| `{{DUE_DATE}}` | The calculated due date (e.g., February 23, 2026) |
| `{{PAYABLE_ENTITY}}` | `Turrentine Jackson Morrow` |
| `{{CONTACT_EMAIL}}` | `Sloan@tjmfuneral.com` |
| `{{CONTACT_PHONE}}` | `(972) 632-2787` |

If the tenant's address is not available, omit the tenant address lines from the rendered HTML (remove the `<br>` too so there's no blank line).

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
