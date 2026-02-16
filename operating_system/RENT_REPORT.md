# Monthly Rent Collection Report

Generate a rent collection report for the current month.

## Steps

1. Use the `graph-api` skill to read the **Contracts** sheet from the OneDrive Excel file. Identify all active contracts and their expected rent amounts and billing cycles.

2. Use the `graph-api` skill to read the **Transactions** sheet. Filter for transactions in the current month (Type = "Rent").

3. For each active property, compare expected rent to payments received:
   - **Collected**: Payment received for this period
   - **Outstanding**: Expected but no payment found
   - **Overpaid**: Payment exceeds expected amount

4. For **TomBean_1** (NNN lease), report the utility balance instead:
   - Sum utility bills (Electric, Gas, Water) vs Utility_Pmt transactions
   - Report current balance owed

5. Generate a summary report with:
   - Total expected revenue
   - Total collected
   - Total outstanding
   - Per-property breakdown
   - Any notes or anomalies

6. Save the report to `logs/{JOB_ID}/report.md`.

7. Send the report summary via Telegram notification (this happens automatically when the job completes).

## Notes

- Billboard billing is on a 4-week cycle, not calendar monthly. Check if a payment falls within the current 4-week window.
- The Excel file path is configured via `ONEDRIVE_FILE_PATH` env var, defaulting to `/TJM/Real Estate/TJM_RENT_v2.xlsx`.
