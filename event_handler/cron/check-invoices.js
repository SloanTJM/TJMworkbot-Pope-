#!/usr/bin/env node

/**
 * check-invoices.js - Daily check for upcoming invoice due dates
 *
 * Runs as a lightweight cron command on the event handler.
 * Checks if any tenant has rent due within the next 3 days.
 * If so, creates an agent job to generate and send invoice emails.
 *
 * No Docker container or LLM cost on days when no invoices are due.
 */

const path = require('path');
const { createJob } = require(path.join(__dirname, '..', 'tools', 'create-job'));

// Tenant billing configurations
// Add new tenants here as they're onboarded
const TENANTS = [
  {
    name: 'Tom Bean Feed & Supply',
    property_id: 'Board_TomBean',
    billing_cycle: '4-week',
    contract_start: '2025-12-01',
    contract_end: '2026-05-18',
    rent: 780,
  },
  // Billboard tenants (4-week cycles) — add as email addresses are collected
  // { name: 'Walmart', property_id: 'Board_304L', billing_cycle: '4-week', contract_start: '...', contract_end: '...', rent: 6200 },

  // Monthly tenants — uncomment when ready
  // { name: 'Jessie Lathom', property_id: 'Gunter_1', billing_cycle: 'monthly', rent: 800 },
];

const NOTIFY_DAYS = 3; // Send invoice this many days before due date

/**
 * Calculate the next due date for a 4-week billing cycle
 */
function getNext4WeekDueDate(contractStart, today) {
  const start = new Date(contractStart + 'T00:00:00');
  const CYCLE_MS = 28 * 24 * 60 * 60 * 1000;

  let dueDate = new Date(start.getTime() + CYCLE_MS); // First due date is 28 days after start
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

  // Try 1st of current month
  const thisMonth = new Date(year, month, 1);
  if (thisMonth > today) return thisMonth;

  // Otherwise 1st of next month
  return new Date(year, month + 1, 1);
}

/**
 * Check if a date is exactly N days from today
 */
function daysUntil(targetDate, today) {
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`[check-invoices] ${today.toISOString().split('T')[0]} — checking ${TENANTS.length} tenant(s)`);

  const dueSoon = [];

  for (const tenant of TENANTS) {
    // Skip expired contracts
    if (tenant.contract_end) {
      const endDate = new Date(tenant.contract_end + 'T00:00:00');
      if (endDate < today) {
        console.log(`  ${tenant.name}: contract expired (${tenant.contract_end}), skipping`);
        continue;
      }
    }

    let nextDue;
    if (tenant.billing_cycle === '4-week') {
      nextDue = getNext4WeekDueDate(tenant.contract_start, today);
    } else if (tenant.billing_cycle === 'monthly') {
      nextDue = getNextMonthlyDueDate(today);
    } else {
      console.log(`  ${tenant.name}: unsupported billing cycle "${tenant.billing_cycle}", skipping`);
      continue;
    }

    // Check contract hasn't expired before this due date
    if (tenant.contract_end) {
      const endDate = new Date(tenant.contract_end + 'T00:00:00');
      if (nextDue > endDate) {
        console.log(`  ${tenant.name}: next due ${nextDue.toISOString().split('T')[0]} is past contract end, skipping`);
        continue;
      }
    }

    const days = daysUntil(nextDue, today);
    const dueStr = nextDue.toISOString().split('T')[0];

    if (days >= 0 && days <= NOTIFY_DAYS) {
      console.log(`  ${tenant.name}: due ${dueStr} (${days} days away) — INVOICE NEEDED`);
      dueSoon.push({ ...tenant, nextDue: dueStr, daysAway: days });
    } else {
      console.log(`  ${tenant.name}: next due ${dueStr} (${days} days away)`);
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
