Check when the next invoice is due for the Celina rental property (Property_ID: Celina, tenant: Christian Lachausse). Read the TJM_RENT_v2.xlsx Excel file using the graph-api skill to:

1. Check the Contracts sheet for the Celina property billing details (Monthly_Rent, Billing_Cycle, Notify_Days, etc.)
2. Determine when the next invoice should be sent based on the billing cycle and notification settings
3. Check recent transactions in the Transactions sheet to see the last payment received
4. Provide a clear answer about when the next invoice will be sent

The Excel file is located at the path specified in the ONEDRIVE_FILE_PATH environment variable (default: /Work/Real Estate/TJM_RENT_v2.xlsx).