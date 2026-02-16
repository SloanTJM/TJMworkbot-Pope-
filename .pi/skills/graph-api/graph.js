#!/usr/bin/env node

/**
 * graph.js - Microsoft Graph API client for OneDrive Excel access
 *
 * Usage:
 *   node graph.js read <sheetName> [startRow] [endRow]
 *   node graph.js append <sheetName> <json_array>
 *   node graph.js sheets
 *
 * Environment variables (from LLM_SECRETS):
 *   AZURE_CLIENT_ID     - Azure AD app client ID
 *   AZURE_TENANT_ID     - Azure AD tenant ID
 *   AZURE_CLIENT_SECRET  - Azure AD app client secret
 *   ONEDRIVE_USER_ID    - Microsoft 365 user ID or UPN
 *   ONEDRIVE_FILE_PATH  - Excel file path (default: /TJM/Real Estate/TJM_RENT_v2.xlsx)
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL_TEMPLATE = 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token';
const DEFAULT_FILE_PATH = '/TJM/Real Estate/TJM_RENT_v2.xlsx';

// --- Auth ---

async function getAccessToken() {
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!clientId || !tenantId || !clientSecret) {
    throw new Error('Missing Azure credentials. Need AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET');
  }

  const tokenUrl = TOKEN_URL_TEMPLATE.replace('{tenantId}', tenantId);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

// --- Graph helpers ---

function getWorkbookUrl() {
  const userId = process.env.ONEDRIVE_USER_ID;
  if (!userId) throw new Error('Missing ONEDRIVE_USER_ID env var');

  const filePath = process.env.ONEDRIVE_FILE_PATH || DEFAULT_FILE_PATH;
  // Encode the path, but keep forward slashes
  const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `${GRAPH_BASE}/users/${userId}/drive/root:${encodedPath}:/workbook`;
}

async function graphRequest(path, options = {}) {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : `${getWorkbookUrl()}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// --- Commands ---

async function listSheets() {
  const data = await graphRequest('/worksheets');
  const names = data.value.map(ws => ws.name);
  console.log('Worksheets:');
  names.forEach(name => console.log(`  - ${name}`));
  return names;
}

async function readSheet(sheetName, startRow, endRow) {
  // Get used range to know the data bounds
  const range = await graphRequest(`/worksheets('${encodeURIComponent(sheetName)}')/usedRange`);

  if (!range || !range.values || range.values.length === 0) {
    console.log('[]');
    return;
  }

  let rows = range.values;

  // Apply row filtering (1-based indexing, row 1 = header)
  if (startRow !== undefined) {
    const start = Math.max(0, startRow - 1);
    const end = endRow !== undefined ? endRow : rows.length;
    rows = rows.slice(start, end);
  }

  console.log(JSON.stringify(rows, null, 2));
}

async function appendRow(sheetName, rowData) {
  let values;
  try {
    values = JSON.parse(rowData);
  } catch (e) {
    throw new Error(`Invalid JSON for row data: ${e.message}`);
  }

  if (!Array.isArray(values)) {
    throw new Error('Row data must be a JSON array');
  }

  // Get the used range to find the next empty row
  const range = await graphRequest(`/worksheets('${encodeURIComponent(sheetName)}')/usedRange`);
  const lastRow = range && range.values ? range.values.length : 0;
  const nextRow = lastRow + 1;

  // Calculate the cell range for the new row (e.g., A5:H5)
  const endCol = String.fromCharCode(64 + values.length); // A=65, so 64+1=A
  const cellRange = `A${nextRow}:${endCol}${nextRow}`;

  await graphRequest(`/worksheets('${encodeURIComponent(sheetName)}')/range(address='${cellRange}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values: [values] }),
  });

  console.log(`Row appended to ${sheetName} at row ${nextRow}`);
}

// --- Main ---

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command) {
    console.error('Usage:');
    console.error('  node graph.js read <sheetName> [startRow] [endRow]');
    console.error('  node graph.js append <sheetName> <json_array>');
    console.error('  node graph.js sheets');
    process.exit(1);
  }

  switch (command) {
    case 'sheets':
      await listSheets();
      break;

    case 'read': {
      const sheetName = args[0];
      if (!sheetName) {
        console.error('Error: sheet name required');
        process.exit(1);
      }
      const startRow = args[1] ? parseInt(args[1], 10) : undefined;
      const endRow = args[2] ? parseInt(args[2], 10) : undefined;
      await readSheet(sheetName, startRow, endRow);
      break;
    }

    case 'append': {
      const sheetName = args[0];
      const rowData = args[1];
      if (!sheetName || !rowData) {
        console.error('Error: sheet name and JSON array required');
        process.exit(1);
      }
      await appendRow(sheetName, rowData);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Valid commands: read, append, sheets');
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
