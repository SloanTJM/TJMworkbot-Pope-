#!/usr/bin/env node

/**
 * graph-setup.js - One-time setup for Microsoft Graph delegated auth
 *
 * Initiates device code flow so you can sign in with your Microsoft account.
 * After auth completes, prints the refresh token and token date to add to LLM_SECRETS and .env.
 *
 * Prerequisites:
 *   1. Azure Portal > App registrations > Your app > Authentication
 *      > Advanced settings > "Allow public client flows" = Yes > Save
 *
 * Environment variables (set before running, or pass inline):
 *   AZURE_CLIENT_ID  - Azure AD app client ID
 *   AZURE_TENANT_ID  - Azure AD tenant ID
 *
 * Usage:
 *   AZURE_CLIENT_ID=xxx AZURE_TENANT_ID=yyy node graph-setup.js
 */

const SCOPES = 'Files.ReadWrite User.Read Mail.Send offline_access';

async function main() {
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !tenantId) {
    console.error('Error: AZURE_CLIENT_ID and AZURE_TENANT_ID must be set.');
    console.error('Example:');
    console.error('  AZURE_CLIENT_ID=xxx AZURE_TENANT_ID=yyy node graph-setup.js');
    process.exit(1);
  }

  const deviceCodeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  // Step 1: Request device code
  console.log('Requesting device code...\n');

  const dcRes = await fetch(deviceCodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: SCOPES,
    }).toString(),
  });

  if (!dcRes.ok) {
    const text = await dcRes.text();
    console.error(`Device code request failed (${dcRes.status}): ${text}`);
    process.exit(1);
  }

  const dcData = await dcRes.json();

  console.log('='.repeat(60));
  console.log(dcData.message);
  console.log('='.repeat(60));
  console.log('\nWaiting for you to complete sign-in...\n');

  // Step 2: Poll for token
  const interval = (dcData.interval || 5) * 1000;
  const expiresAt = Date.now() + dcData.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await new Promise(resolve => setTimeout(resolve, interval));

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: dcData.device_code,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error === 'authorization_pending') {
      continue;
    }

    if (tokenData.error === 'slow_down') {
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }

    if (tokenData.error) {
      console.error(`Authentication failed: ${tokenData.error_description || tokenData.error}`);
      process.exit(1);
    }

    // Success
    const tokenDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    console.log('Authentication successful!\n');
    console.log('='.repeat(60));
    console.log('Add the following to your GitHub LLM_SECRETS:\n');
    console.log(`  AZURE_REFRESH_TOKEN=${tokenData.refresh_token}`);
    console.log('\nAdd the following to your event handler .env:\n');
    console.log(`  AZURE_TOKEN_DATE=${tokenDate}`);
    console.log('='.repeat(60));
    console.log('\nReminder: You can remove AZURE_CLIENT_SECRET and ONEDRIVE_USER_ID');
    console.log('from LLM_SECRETS — they are no longer needed.\n');
    console.log(`Token expires ~90 days from ${tokenDate}. A cron job will warn you 2 weeks before.`);
    return;
  }

  console.error('Device code expired. Please try again.');
  process.exit(1);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
