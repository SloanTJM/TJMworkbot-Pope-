# Azure AD Application Permissions Issue

## Problem
Unable to log rent payment in Excel file due to insufficient Microsoft Graph API permissions.

## Error Details
- **Error Code**: `generalException` (401) for file access
- **Error Code**: `Authorization_RequestDenied` (403) for user info
- **Root Cause**: Azure AD application lacks required application permissions

## Current Status
- ✅ Access token obtained successfully
- ✅ Azure credentials configured correctly
- ❌ Cannot access user's OneDrive
- ❌ Cannot access Excel workbook

## Required Fix

### Azure Portal Steps
1. Navigate to: https://portal.azure.com
2. Go to: **Azure Active Directory** → **App registrations**
3. Find app: **Client ID** = `69069d60-c...`
4. Click: **API permissions** (left sidebar)
5. Click: **Add a permission** → **Microsoft Graph** → **Application permissions**
6. Add these permissions:
   - **Files.ReadWrite.All** (required)
   - **User.Read.All** (optional, for user lookup)
7. Click: **Grant admin consent for [Your Tenant Name]**
8. Wait 2-5 minutes for permissions to propagate

### Alternative Approach (if using SharePoint)
If the Excel file is in a SharePoint site instead of personal OneDrive:
- Use **Sites.ReadWrite.All** instead of **Files.ReadWrite.All**
- Access via site path: `/sites/{siteName}/drive/...`

## Test After Fix
```bash
node /job/.pi/skills/graph-api/graph.js sheets
```
Should return:
```
Worksheets:
  - Transactions
  - Contracts
```

## Pending Transaction
Once permissions are granted, execute:
```bash
node /job/.pi/skills/graph-api/graph.js append Transactions '["2/11/26", "3305", "Board_305L", "Choctaw", "Rent", 5408.33, "01/26", ""]'
```

This will log the rent payment:
- **Date**: 2/11/26 (February 11, 2026)
- **Check Number**: 3305
- **Property**: Board_305L
- **Tenant**: Choctaw
- **Type**: Rent
- **Amount**: $5,408.33
- **Period**: 01/26 (January 2026)
- **Notes**: (blank)

## References
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Files.ReadWrite.All permission](https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadwriteall)
