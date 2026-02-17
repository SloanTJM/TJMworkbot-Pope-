# Send Lease Agreement

You have been triggered to generate and send a lease agreement email. The job description contains all the lease details provided by the user.

## Steps

1. **Read the job description** (`logs/<JOB_ID>/job.md`) for lease details:
   - Property_ID
   - Tenant/Advertiser name and representative name
   - Contact email to send to
   - Rent amount (monthly or per-period for billboards)
   - Lease start and end dates
   - Custom terms, special provisions, deposit, vinyl details, utility arrangements

2. **Read the Properties sheet** for the property address:
   ```bash
   node /job/.pi/skills/graph-api/graph.js read Properties
   ```
   Columns A-H: Property_ID, Property_Type, Address, City, State, ZIP, Broker, Notes

3. **Determine lease type** from Property_Type:
   - `billboard` → use `LEASE_BILLBOARD_TEMPLATE.html`
   - All others (`rent_house`, `apartment`, `nnn_lease`) → use `LEASE_RENT_HOUSE_TEMPLATE.html`

4. **Read the appropriate HTML template**:
   - Billboard: `operating_system/LEASE_BILLBOARD_TEMPLATE.html`
   - Rent house: `operating_system/LEASE_RENT_HOUSE_TEMPLATE.html`

5. **Replace all placeholders** with values from the job description and Excel data (see placeholder tables below).

6. **Write rendered HTML** to `/job/tmp/lease_<Property_ID>.html`:
   ```bash
   mkdir -p /job/tmp
   ```

7. **Send via Graph API**:
   ```bash
   node /job/.pi/skills/graph-api/graph.js send-mail "<email>" "<subject>" "@/job/tmp/lease_<Property_ID>.html"
   ```

8. **Email subject format**: `Lease Agreement - <Tenant/Advertiser Name> - <Property Address>`

## Billboard Template Placeholders

| Placeholder | Source |
|---|---|
| `{{COMPANY_NAME}}` | "Turrentine Jackson Morrow" (or DBA if specified in job) |
| `{{ADVERTISER_NAME}}` | From job description |
| `{{ADVERTISER_REP}}` | From job description |
| `{{LOCATION}}` | From Properties sheet: Address, City, State ZIP + orientation from job |
| `{{LIT}}` | From job description (Y/N) |
| `{{NEW_AD}}` | From job description (Y/N) |
| `{{BILLBOARD_SIZE}}` | From job description (e.g., "14x48") |
| `{{PRICE_PER_PERIOD}}` | From job description, formatted as dollar amount |
| `{{GROSS_OR_NET}}` | From job description |
| `{{NUM_VINYLS}}` | From job description |
| `{{START_DATE}}` | From job description |
| `{{END_DATE}}` | From job description |
| `{{NUM_PERIODS}}` | From job description |
| `{{PAYMENT_BREAKDOWN}}` | From job description (rent + vinyl proration details) |
| `{{DEPOSIT_AMOUNT}}` | From job description |
| `{{DEPOSIT_DUE_DATE}}` | From job description |
| `{{VINYL_INSTALL_COST}}` | From job description |
| `{{SPECIAL_PROVISIONS}}` | From job description (custom terms, default: "Signed contract must be returned within 2 working days.") |
| `{{TOTAL_DUE_AT_SIGNING}}` | From job description |
| `{{DATE}}` | Today's date (e.g., February 17, 2026) |
| `{{CONTACT_EMAIL}}` | `Sloan@tjmfuneral.com` |
| `{{CONTACT_PHONE}}` | `(972) 632-2787` |

## Rent House Template Placeholders

| Placeholder | Source |
|---|---|
| `{{TENANT_NAME}}` | From job description |
| `{{PROPERTY_ADDRESS}}` | From Properties sheet: Address, City, State ZIP |
| `{{MONTHLY_RENT}}` | Formatted dollar amount (e.g., $1,800.00) |
| `{{LEASE_START}}` | From job description |
| `{{SECURITY_DEPOSIT}}` | From job description, or "N/A" if none |
| `{{UTILITIES_SECTION}}` | Custom text from job description (who pays what) |
| `{{CUSTOM_TERMS}}` | Additional terms from job description (yard, pets, parking, etc.) |
| `{{DATE}}` | Today's date |
| `{{CONTACT_EMAIL}}` | `Sloan@tjmfuneral.com` |
| `{{CONTACT_PHONE}}` | `(972) 632-2787` |

## Sender Info

- **From:** The authenticated Microsoft 365 account (Sloan@tjmfuneral.com)
- **Company:** Turrentine Jackson Morrow
- **Mailing:** PO Box 1007, McKinney, TX 75070
- **Phone:** (972) 632-2787

## Important Notes

- Create `/job/tmp/` directory before writing files: `mkdir -p /job/tmp`
- If the job description is missing required fields, use reasonable defaults or note the omission in the email
- For billboard leases, if no special provisions are specified, use: "Signed contract must be returned within 2 working days."
- For rent house leases, if no security deposit is specified, omit that section entirely from the rendered HTML
- If no utilities section is specified for rent house, omit that section
- If sending fails, report the error clearly
