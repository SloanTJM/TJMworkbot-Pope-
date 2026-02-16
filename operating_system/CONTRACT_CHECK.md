# Contract Expiration Check

Check all active contracts for upcoming expirations and send alerts at milestone intervals.

## Steps

1. Use the `graph-api` skill to read the **Contracts** sheet from the OneDrive Excel file.

2. For each active contract, calculate the number of days until `Contract_End`.

3. Check against milestone thresholds: **90, 60, 30, 14, 7** days.

4. If a contract hits a milestone (within a 1-day window to account for daily runs), flag it for notification.

5. Generate a summary with:
   - Property ID and tenant name
   - Contract end date
   - Days remaining
   - Milestone hit (e.g., "30-day warning")
   - Any relevant notes from the contract

6. If no contracts are expiring at any milestone, report "No contract expirations at milestone intervals."

7. Save the check results to `logs/{JOB_ID}/contract-check.md`.

## Notes

- Contracts with no `Contract_End` date (month-to-month) should be skipped.
- Only flag contracts that are currently active (`Active` = true/yes).
- The Telegram notification (sent automatically on job completion) will alert Tom to any upcoming expirations.
