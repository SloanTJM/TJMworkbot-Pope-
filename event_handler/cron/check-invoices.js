#!/usr/bin/env node

/**
 * check-invoices.js - Daily check for upcoming invoice due dates
 *
 * Reads tenant data from the Contracts sheet in Excel (via Graph API),
 * checks if any tenant has rent due within their Notify_Days window,
 * and creates an agent job to generate and send invoice emails.
 *
 * No Docker container or LLM cost on days when no invoices are due.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createJob } = require(path.join(__dirname, '..', 'tools', 'create-job'));
const { graphRequest } = require(path.join(__dirname, '..', '..', '.pi', 'skills', 'graph-api', 'graph.js'));

const DEFAULT_NOTIFY_DAYS = 3;

/**
 * Parse an Excel serial date number to a JS Date
 * Excel serial: days since 1900-01-01 (with the Lotus 1-2-3 leap year bug)
 */
function excelSerialToDate(serial) {
  if (typeof serial === 'number') {
    // Excel epoch is Jan 1, 1900 but has a bug treating 1900 as leap year
    // So serial 1 = Jan 1, 1900. We subtract 2 to adjust (1 for 0-index, 1 for leap bug)
    const epoch = new Date(1900, 0, 1);
    return new Date(epoch.getTime() + (serial - 2) * 86400000);
  }
  // If it's a string date, parse it
  if (typeof serial === 'string' && serial) {
    return new Date(serial + 'T00:00:00');
  }
  return null;
}

/**
 * Calculate the next due date for a 4-week billing cycle
 */
function getNext4WeekDueDate(contractStart, today) {
  const start = excelSerialToDate(contractStart);
  if (!start || isNaN(start.getTime())) return null;

  const CYCLE_MS = 28 * 24 * 60 * 60 * 1000;
  let dueDate = new Date(start.getTime() + CYCLE_MS);
  while (dueDate <= today) {
    dueDate = new Date(dueDate.getTime() + CYCLE_MS);
  }
  return dueDate;
}

/**
 * Calculate the next due date for monthly billing (1st of month)
 */
function getNextMonthlyDueDate(today) {
  const year = today.getFullYear();
  const month = today.getMonth();

  const thisMonth = new Date(year, month, 1);
  if (thisMonth > today) return thisMonth;

  return new Date(year, month + 1, 1);
}

/**
 * Days between two dates (date parts only)
 */
function daysUntil(targetDate, today) {
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`[check-invoices] ${today.toISOString().split('T')[0]} — reading Contracts from Excel`);

  // Read Contracts sheet
  let rows;
  try {
    const range = await graphRequest("/worksheets('Contracts')/usedRange");
    rows = range?.values;
  } catch (err) {
    console.error(`[check-invoices] Failed to read Contracts sheet: ${err.message}`);
    process.exit(1);
  }

  if (!rows || rows.length < 2) {
    console.log('[check-invoices] No data in Contracts sheet. Done.');
    return;
  }

  // Build column map from header row
  const headers = rows[0];
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  const required = ['Property_ID', 'Tenant_Name', 'Contact_Email', 'Billing_Cycle', 'Active'];
  for (const field of required) {
    if (col[field] === undefined) {
      console.error(`[check-invoices] Missing column: ${field}`);
      process.exit(1);
    }
  }

  const dataRows = rows.slice(1);
  console.log(`[check-invoices] Found ${dataRows.length} tenant(s) in Excel`);

  const dueSoon = [];

  for (const row of dataRows) {
    const propertyId = row[col['Property_ID']];
    const tenantName = row[col['Tenant_Name']];
    const email = row[col['Contact_Email']];
    const billingCycle = row[col['Billing_Cycle']];
    const active = row[col['Active']];
    const contractStart = col['Contract_Start'] !== undefined ? row[col['Contract_Start']] : null;
    const contractEnd = col['Contract_End'] !== undefined ? row[col['Contract_End']] : null;
    const notifyDays = col['Notify_Days'] !== undefined && row[col['Notify_Days']]
      ? Number(row[col['Notify_Days']])
      : DEFAULT_NOTIFY_DAYS;

    // Skip inactive
    if (active !== true && active !== 'TRUE' && active !== 'true') {
      console.log(`  ${tenantName}: inactive, skipping`);
      continue;
    }

    // Skip if no email
    if (!email) {
      console.log(`  ${tenantName}: no email, skipping`);
      continue;
    }

    // Skip pass-through
    if (billingCycle === 'pass-through') {
      console.log(`  ${tenantName}: pass-through billing, skipping`);
      continue;
    }

    // Check expired contract
    if (contractEnd) {
      const endDate = excelSerialToDate(contractEnd);
      if (endDate && endDate < today) {
        console.log(`  ${tenantName}: contract expired, skipping`);
        continue;
      }
    }

    // Calculate next due date
    let nextDue;
    if (billingCycle === '4-week') {
      nextDue = getNext4WeekDueDate(contractStart, today);
    } else if (billingCycle === 'monthly') {
      nextDue = getNextMonthlyDueDate(today);
    } else {
      console.log(`  ${tenantName}: unsupported billing cycle "${billingCycle}", skipping`);
      continue;
    }

    if (!nextDue) {
      console.log(`  ${tenantName}: could not calculate due date, skipping`);
      continue;
    }

    // Check due date isn't past contract end
    if (contractEnd) {
      const endDate = excelSerialToDate(contractEnd);
      if (endDate && nextDue > endDate) {
        console.log(`  ${tenantName}: next due date past contract end, skipping`);
        continue;
      }
    }

    const days = daysUntil(nextDue, today);
    const dueStr = nextDue.toISOString().split('T')[0];

    if (days >= 0 && days <= notifyDays) {
      console.log(`  ${tenantName}: due ${dueStr} (${days} days away) — INVOICE NEEDED`);
      dueSoon.push({ propertyId, tenantName, email, nextDue: dueStr, daysAway: days });
    } else {
      console.log(`  ${tenantName}: next due ${dueStr} (${days} days away)`);
    }
  }

  if (dueSoon.length === 0) {
    console.log('[check-invoices] No invoices due soon. Done.');
    return;
  }

  console.log(`[check-invoices] ${dueSoon.length} tenant(s) due soon — creating agent job`);

  const job = await createJob(
    'Read the file at operating_system/SEND_INVOICES.md and complete the tasks described there.'
  );

  console.log(`[check-invoices] Job created: ${job.job_id} (branch: ${job.branch})`);
}

main().catch(err => {
  console.error(`[check-invoices] Error: ${err.message}`);
  process.exit(1);
});
