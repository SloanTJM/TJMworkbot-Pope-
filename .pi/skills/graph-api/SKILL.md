---
name: graph-api
description: Read and write data in the TJM Real Estate OneDrive Excel workbook via Microsoft Graph API. Use for rent tracking, payment logging, contract management, and utility tracking.
---

# Microsoft Graph API — OneDrive Excel Access

## Read Worksheet Rows

```bash
node /job/.pi/skills/graph-api/graph.js read <sheetName> [startRow] [endRow]
```

Reads rows from a worksheet. Returns JSON array of row arrays.

- `sheetName` — Sheet name (e.g., `Transactions`, `Contracts`)
- `startRow` — Optional start row (1-based, default: 1)
- `endRow` — Optional end row (default: all rows)

**Examples:**

```bash
# Read all transactions
node /job/.pi/skills/graph-api/graph.js read Transactions

# Read first 10 rows of Contracts
node /job/.pi/skills/graph-api/graph.js read Contracts 1 10
```

## Append a Row

```bash
node /job/.pi/skills/graph-api/graph.js append <sheetName> <json_array>
```

Appends a single row to the end of a worksheet.

- `sheetName` — Sheet name
- `json_array` — JSON array of cell values

**Examples:**

```bash
# Log a rent payment
node /job/.pi/skills/graph-api/graph.js append Transactions '["2026-02-15","1234","Gunter_1","Jessie Lathom","Rent",800,"2026-02-01","February rent"]'
```

## List Sheets

```bash
node /job/.pi/skills/graph-api/graph.js sheets
```

Lists all worksheet names in the workbook.

## Send Email

```bash
node /job/.pi/skills/graph-api/graph.js send-mail <to> <subject> <htmlBody|@filepath>
```

Sends an email via Microsoft Graph (from the authenticated user's mailbox).

- `to` — Recipient email address
- `subject` — Email subject line
- `htmlBody` — HTML body as a string, or `@filepath` to read HTML from a file

**Examples:**

```bash
# Send inline HTML
node /job/.pi/skills/graph-api/graph.js send-mail "tenant@example.com" "Rent Invoice" "<h1>Invoice</h1><p>Amount due: $800</p>"

# Send HTML from file
node /job/.pi/skills/graph-api/graph.js send-mail "tenant@example.com" "Rent Invoice - January 2026" "@/job/tmp/invoice.html"
```

## Data Reference

The Excel file has two main sheets:

**Transactions** (columns A-H): Date, Check_Num, Property_ID, Tenant, Type, Amount, Period, Notes

**Contracts** (columns A-M): Property_ID, Property_Type, Tenant_Name, Monthly_Rent, Billing_Cycle, Contract_Start, Contract_End, Active, Notify_Days, Vinyl_Required, Vinyl_Contact, Notes, Email

## Authentication

Uses Azure AD delegated auth with a refresh token (public client / device code flow). Requires these env vars (from LLM_SECRETS):
- `AZURE_CLIENT_ID` — Azure AD app client ID
- `AZURE_TENANT_ID` — Azure AD tenant ID
- `AZURE_REFRESH_TOKEN` — Delegated auth refresh token

File path defaults to `/Work/Real Estate/TJM_RENT_v2.xlsx` (override with `ONEDRIVE_FILE_PATH`).

### Setup

1. Azure Portal > App registrations > Your app > **Authentication** > Advanced settings > Set **"Allow public client flows"** to **Yes** > Save
2. Run `node .pi/skills/graph-api/graph-setup.js` with `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` set
3. Follow the on-screen instructions to sign in
4. Add the printed `AZURE_REFRESH_TOKEN` to GitHub `LLM_SECRETS`
5. Add the printed `AZURE_TOKEN_DATE` to the event handler `.env`

### Token Renewal

The refresh token expires ~90 days after creation. A weekly cron job checks the expiry and sends a Telegram warning 2 weeks before expiration. To renew, re-run `graph-setup.js` and update `LLM_SECRETS` and `.env`.
