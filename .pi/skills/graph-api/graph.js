#!/usr/bin/env node

/**
 * graph.js - Microsoft Graph API client for OneDrive Excel access
 *
 * Usage:
 *   node graph.js read <sheetName> [startRow] [endRow]
 *   node graph.js append <sheetName> <json_array>
 *   node graph.js sheets
 *   node graph.js send-mail <to> <subject> <htmlBody|@filepath> [--attach file ...] [--inline file:cid ...]
 *   node graph.js create-sheet <name>
 *   node graph.js write-range <sheet> <range> <json_2d_array>
 *   node graph.js clear-sheet <sheet>
 *
 * Environment variables (from LLM_SECRETS):
 *   AZURE_CLIENT_ID      - Azure AD app client ID
 *   AZURE_TENANT_ID      - Azure AD tenant ID
 *   AZURE_REFRESH_TOKEN  - Delegated auth refresh token (from graph-setup.js)
 *   ONEDRIVE_FILE_PATH   - Excel file path (default: /Work/Real Estate/TJM_RENT_v2.xlsx)
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL_TEMPLATE = 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token';
const DEFAULT_FILE_PATH = '/Work/Real Estate/TJM_RENT_v2.xlsx';

// --- Auth ---

async function getAccessToken() {
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  const refreshToken = process.env.AZURE_REFRESH_TOKEN;

  if (!clientId || !tenantId || !refreshToken) {
    throw new Error('Missing Azure credentials. Need AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_REFRESH_TOKEN');
  }

  const tokenUrl = TOKEN_URL_TEMPLATE.replace('{tenantId}', tenantId);
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'Files.ReadWrite User.Read Mail.Send offline_access',
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
  const filePath = process.env.ONEDRIVE_FILE_PATH || DEFAULT_FILE_PATH;
  // Encode the path, but keep forward slashes
  const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `${GRAPH_BASE}/me/drive/root:${encodedPath}:/workbook`;
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

  if (res.status === 204 || res.status === 202) return null;
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

async function createSheet(name) {
  const data = await graphRequest('/worksheets/add', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  console.log(`Sheet created: ${data.name}`);
  return data;
}

async function writeRange(sheetName, range, jsonData) {
  let values;
  try {
    values = JSON.parse(jsonData);
  } catch (e) {
    throw new Error(`Invalid JSON for range data: ${e.message}`);
  }

  if (!Array.isArray(values) || !Array.isArray(values[0])) {
    throw new Error('Range data must be a 2D JSON array');
  }

  await graphRequest(`/worksheets('${encodeURIComponent(sheetName)}')/range(address='${range}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values }),
  });

  console.log(`Wrote ${values.length} row(s) to ${sheetName}!${range}`);
}

async function clearSheet(sheetName) {
  try {
    const range = await graphRequest(`/worksheets('${encodeURIComponent(sheetName)}')/usedRange`);
    if (range && range.address) {
      await graphRequest(`/worksheets('${encodeURIComponent(sheetName)}')/usedRange/clear`, {
        method: 'POST',
        body: JSON.stringify({ applyTo: 'All' }),
      });
      console.log(`Cleared sheet: ${sheetName}`);
    } else {
      console.log(`Sheet ${sheetName} is already empty`);
    }
  } catch (err) {
    if (err.message.includes('ItemNotFound')) {
      console.log(`Sheet ${sheetName} is already empty`);
    } else {
      throw err;
    }
  }
}

async function sendMail(to, subject, htmlBody, attachFiles, inlineFiles) {
  const fs = require('fs');
  const path = require('path');

  // Support @filepath syntax — read HTML from file
  if (htmlBody.startsWith('@')) {
    const filePath = htmlBody.slice(1);
    htmlBody = fs.readFileSync(filePath, 'utf-8');
  }

  const message = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }],
  };

  // Build attachments array (file attachments + inline images)
  const attachments = [];

  if (attachFiles && attachFiles.length > 0) {
    for (const filePath of attachFiles) {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.html': 'text/html' };
      attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: path.basename(filePath),
        contentType: mimeTypes[ext] || 'application/octet-stream',
        contentBytes: content.toString('base64'),
      });
    }
  }

  if (inlineFiles && inlineFiles.length > 0) {
    for (const spec of inlineFiles) {
      const [filePath, contentId] = spec.split(':');
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
      attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: path.basename(filePath),
        contentType: mimeTypes[ext] || 'image/png',
        contentBytes: content.toString('base64'),
        isInline: true,
        contentId: contentId || path.basename(filePath, ext),
      });
    }
  }

  if (attachments.length > 0) {
    message.attachments = attachments;
  }

  await graphRequest(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

  const parts = [];
  if (attachFiles && attachFiles.length) parts.push(`${attachFiles.length} attachment(s)`);
  if (inlineFiles && inlineFiles.length) parts.push(`${inlineFiles.length} inline image(s)`);
  console.log(`Email sent to ${to}: "${subject}"${parts.length ? ' with ' + parts.join(', ') : ''}`);
}

// --- Main ---

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command) {
    console.error('Usage:');
    console.error('  node graph.js read <sheetName> [startRow] [endRow]');
    console.error('  node graph.js append <sheetName> <json_array>');
    console.error('  node graph.js sheets');
    console.error('  node graph.js send-mail <to> <subject> <htmlBody|@filepath>');
    console.error('  node graph.js create-sheet <name>');
    console.error('  node graph.js write-range <sheet> <range> <json_2d_array>');
    console.error('  node graph.js clear-sheet <sheet>');
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

    case 'send-mail': {
      const to = args[0];
      const subject = args[1];
      const body = args[2];
      if (!to || !subject || !body) {
        console.error('Error: to, subject, and htmlBody required');
        console.error('  node graph.js send-mail <to> <subject> <htmlBody|@filepath> [--attach file ...] [--inline file:cid ...]');
        process.exit(1);
      }
      // Parse --attach and --inline flags from remaining args
      const attachFiles = [];
      const inlineFiles = [];
      let mode = null;
      for (let i = 3; i < args.length; i++) {
        if (args[i] === '--attach') { mode = 'attach'; continue; }
        if (args[i] === '--inline') { mode = 'inline'; continue; }
        if (args[i].startsWith('--')) { mode = null; continue; }
        if (mode === 'attach') attachFiles.push(args[i]);
        else if (mode === 'inline') inlineFiles.push(args[i]);
      }
      await sendMail(to, subject, body, attachFiles, inlineFiles);
      break;
    }

    case 'create-sheet': {
      const name = args[0];
      if (!name) {
        console.error('Error: sheet name required');
        process.exit(1);
      }
      await createSheet(name);
      break;
    }

    case 'write-range': {
      const sheetName = args[0];
      const range = args[1];
      const jsonData = args[2];
      if (!sheetName || !range || !jsonData) {
        console.error('Error: sheet name, range, and JSON 2D array required');
        process.exit(1);
      }
      await writeRange(sheetName, range, jsonData);
      break;
    }

    case 'clear-sheet': {
      const sheetName = args[0];
      if (!sheetName) {
        console.error('Error: sheet name required');
        process.exit(1);
      }
      await clearSheet(sheetName);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Valid commands: read, append, sheets, send-mail, create-sheet, write-range, clear-sheet');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { getAccessToken, graphRequest, getWorkbookUrl };
