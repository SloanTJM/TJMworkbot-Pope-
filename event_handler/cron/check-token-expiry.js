#!/usr/bin/env node

/**
 * check-token-expiry.js - Warns via Telegram when the Azure refresh token is near expiry
 *
 * Reads AZURE_TOKEN_DATE (ISO date string, e.g. "2026-02-16") from env,
 * calculates days since creation, and sends a Telegram warning if within
 * 14 days of the 90-day expiry window.
 *
 * Env vars:
 *   AZURE_TOKEN_DATE     - Date the refresh token was obtained (YYYY-MM-DD)
 *   TELEGRAM_BOT_TOKEN   - Telegram bot token
 *   TELEGRAM_CHAT_ID     - Chat ID to send warning to (defaults to GH_OWNER's chat)
 */

const MAX_DAYS = 90;
const WARN_DAYS = 14;

async function main() {
  const tokenDate = process.env.AZURE_TOKEN_DATE;
  if (!tokenDate) {
    console.log('AZURE_TOKEN_DATE not set, skipping expiry check.');
    return;
  }

  const created = new Date(tokenDate);
  if (isNaN(created.getTime())) {
    console.error(`Invalid AZURE_TOKEN_DATE: ${tokenDate}`);
    return;
  }

  const now = new Date();
  const daysSinceCreation = Math.floor((now - created) / (1000 * 60 * 60 * 24));
  const daysUntilExpiry = MAX_DAYS - daysSinceCreation;

  console.log(`Token created: ${tokenDate} (${daysSinceCreation} days ago, ~${daysUntilExpiry} days until expiry)`);

  if (daysUntilExpiry > WARN_DAYS) {
    console.log('Token is not near expiry. No action needed.');
    return;
  }

  // Token is expiring soon — send Telegram warning
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('Cannot send warning: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.');
    console.error(`WARNING: Azure refresh token expires in ~${daysUntilExpiry} days!`);
    return;
  }

  const message = daysUntilExpiry <= 0
    ? `⚠️ Azure refresh token has EXPIRED (created ${tokenDate}, ${daysSinceCreation} days ago). Run \`node .pi/skills/graph-api/graph-setup.js\` to renew immediately.`
    : `⚠️ Azure refresh token expires in ~${daysUntilExpiry} days (created ${tokenDate}). Run \`node .pi/skills/graph-api/graph-setup.js\` to renew before it expires.`;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Telegram send failed (${res.status}): ${text}`);
  } else {
    console.log('Expiry warning sent via Telegram.');
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
});
