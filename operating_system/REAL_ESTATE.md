# TJM Real Estate Reference

## Properties & Tenants

### Billboards (4-week billing cycles)

Billboard leases are managed through a broker (**Reiss**), who contracts with advertisers on TJM's behalf. Reiss sends consolidated checks that may cover multiple boards' rent and vinyl install fees on a single check. When logging payments, split into one transaction row per Property_ID and Type (Rent or Install), all sharing the same Check_Num.

| Property ID | Tenant | Rent | Billing |
|-------------|--------|------|---------|
| Board_304L | Walmart | $6,200 | 4-week |
| Board_304R | HEB | $7,000 | 4-week |
| Board_305L | Choctaw | $6,200 | 4-week |
| Board_305R | Specs | $7,258 | 4-week |
| Board_TomBean | Tom Bean Feed & Supply | $780 | 4-week |

### Rental Houses (monthly billing)

| Property ID | Tenant | Rent | Notes |
|-------------|--------|------|-------|
| Gunter_1 | Jessie Lathom | $800 | |
| Leonard_1 | Rhamie Hartwig | $500 | Apartment |
| WolfeCity_1 | Greg Armstrong | $1,100 | Electric utility tracked |
| WolfeCity_2 | Richard Westbrook | $660 | |
| Gainesville_1 | Sharon White | $1,100 | |
| Celina | Christian Lachausse | $1,800 | Month-to-month |

### NNN Lease (utility pass-through)

| Property ID | Tenant | Rent | Utilities |
|-------------|--------|------|-----------|
| TomBean_1 | Church of God | Pass-through only | Electric, Gas, Water |

TomBean_1 has no base rent. TJM pays utility bills, then invoices the tenant for reimbursement. Track utility bills vs utility payments to calculate balance owed.

## Data Location

**OneDrive Excel file:** `/Work/Real Estate/TJM_RENT_v2.xlsx`

Configurable via env var `ONEDRIVE_FILE_PATH`. Accessed using the `graph-api` skill.

**The Excel workbook is the single source of truth for all property, tenant, and contract data.** Adding a tenant in the Contracts sheet (with an email address) automatically makes them eligible for automated invoicing.

### Properties Sheet (columns A-H)

| Column | Field | Description |
|--------|-------|-------------|
| A | Property_ID | Property identifier (e.g., Board_304L, Gunter_1) |
| B | Property_Type | billboard, rent_house, apartment, nnn_lease |
| C | Address | Street address |
| D | City | City |
| E | State | State |
| F | ZIP | ZIP code |
| G | Broker | Broker name (e.g., Reiss for billboards) |
| H | Notes | Additional notes |

### Contracts Sheet (columns A-M)

| Column | Field | Description |
|--------|-------|-------------|
| A | Property_ID | Property identifier |
| B | Tenant_Name | Current tenant |
| C | Contact_Name | Tenant contact person |
| D | Contact_Email | Email for invoices and communication |
| E | Contact_Phone | Phone number |
| F | Monthly_Rent | Rent amount |
| G | Billing_Cycle | monthly, 4-week, pass-through |
| H | Contract_Start | Lease start date |
| I | Contract_End | Lease end date (or "M/M" for month-to-month) |
| J | Active | Whether contract is active |
| K | Notify_Days | Days before due date to send invoice (default 3) |
| L | Vinyl_Required | Billboard vinyl replacement needed |
| M | Notes | Contract notes |

### Transactions Sheet (columns A-H)

| Column | Field | Description |
|--------|-------|-------------|
| A | Date | Transaction date |
| B | Check_Num | Check number or payment reference |
| C | Property_ID | Property identifier (e.g., Board_304L) |
| D | Tenant | Tenant name |
| E | Type | Rent, Install, Electric, Gas, Water, Utility_Pmt |
| F | Amount | Dollar amount |
| G | Period | Billing period date |
| H | Notes | Additional notes |

## Transaction Types

- **Rent** — Regular rent payment
- **Install** — Billboard install fee
- **Electric** / **Gas** / **Water** — Utility bills (for pass-through properties)
- **Utility_Pmt** — Tenant payment for utility bills

## Common Workflows

### Log a Payment
1. Use `graph-api` skill to append a row to the Transactions sheet
2. Fields: Date, Check_Num, Property_ID, Tenant, Type (usually "Rent"), Amount, Period, Notes
3. **Billboard checks from Reiss** often cover multiple tenants and may include install fees — split into separate rows per Property_ID/Type, all with the same Check_Num:
   - e.g., Check 5042 for $13,200 → Row 1: Board_304L / Rent / $6,200 + Row 2: Board_304R / Rent / $7,000

### Check Outstanding Rent
1. Read Contracts sheet for active properties and expected rent amounts
2. Read Transactions sheet for payments in the target period
3. Compare expected vs received per property

### Tom Bean Utility Balance
1. Filter Transactions for TomBean_1 where Type is Electric, Gas, or Water (bills)
2. Filter Transactions for TomBean_1 where Type is Utility_Pmt (payments)
3. Balance = total billed - total paid

### Send Lease Agreement

Lease agreements are sent via Telegram chat. Tell the bot the lease details and it will generate a professional HTML lease and email it via Graph API.

**Two lease types** (auto-selected by property type):
- **Billboard lease** — for `billboard` properties. Formal outdoor advertising contract with display periods, vinyl details, payment terms.
- **Rent house lease** — for all other properties (`rent_house`, `apartment`, `nnn_lease`). Simple month-to-month agreement.

**How to use:**
1. Tell the bot: "Send a lease to [tenant] for [Property_ID]" with details:
   - Tenant/advertiser name and contact email
   - Rent amount and start date
   - Any custom terms (deposit, utilities, special provisions)
   - For billboards: lit Y/N, size, number of periods, vinyl details
2. Bot builds the job description and asks for confirmation
3. On approval, bot calls `create_job` referencing `SEND_LEASE.md`
4. Agent reads Excel for property data, renders the appropriate HTML template, and emails it

**Templates:**
- `operating_system/LEASE_BILLBOARD_TEMPLATE.html`
- `operating_system/LEASE_RENT_HOUSE_TEMPLATE.html`
- Agent instructions: `operating_system/SEND_LEASE.md`

### Contract Expiration Check
1. Read Contracts sheet for active contracts
2. Calculate days until Contract_End
3. Alert at milestones: 90, 60, 30, 14, 7 days

### Invoicing (Automated)

Invoice emails are sent automatically via a daily cron job:
- `check-invoices.js` runs daily at 9am and reads the Contracts sheet from Excel
- It filters for active tenants with an email address and a due date within their Notify_Days window
- When invoices are due, it creates an agent job that reads `SEND_INVOICES.md`
- The agent reads the Contracts and Properties sheets, renders HTML invoices from `INVOICE_EMAIL_TEMPLATE.html`, and sends via Graph API
- Invoice number format: `INV-{Property_ID}-{YYYYMMDD}` (using the due date)
- Payment instructions: "Please make checks payable to Turrentine Jackson Morrow."
- Billboard tenants use 4-week billing cycles (due dates shift each period)
- Monthly tenants are due on the 1st of each month
- **To add a new tenant to invoicing:** add their row to the Contracts sheet with a Contact_Email — no code changes needed

## Maintenance

- **Azure refresh token**: The Graph API skill uses a delegated auth refresh token that expires ~90 days after creation. Run `node .pi/skills/graph-api/graph-setup.js` to renew. A weekly cron checks expiry and sends a Telegram warning 2 weeks before expiration.
