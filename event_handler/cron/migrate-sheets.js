#!/usr/bin/env node

/**
 * migrate-sheets.js - One-time migration to restructure Excel workbook
 *
 * Creates a Properties sheet and restructures Contracts sheet with new A-R layout.
 * Run once, then delete or disable.
 *
 * Usage: node event_handler/cron/migrate-sheets.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { graphRequest } = require(path.join(__dirname, '..', '..', '.pi', 'skills', 'graph-api', 'graph.js'));

// --- Properties data (from REAL_ESTATE.md) ---

const PROPERTIES_HEADERS = [
  'Property_ID', 'Property_Type', 'Address', 'City', 'State', 'ZIP', 'Broker', 'Notes',
];

const PROPERTIES_ROWS = [
  ['Board_304L', 'billboard', 'US 75 Northbound', 'Sherman', 'TX', '', 'Reiss', ''],
  ['Board_304R', 'billboard', 'US 75 Northbound', 'Sherman', 'TX', '', 'Reiss', ''],
  ['Board_305L', 'billboard', 'US 75 Southbound', 'Sherman', 'TX', '', 'Reiss', ''],
  ['Board_305R', 'billboard', 'US 75 Southbound', 'Sherman', 'TX', '', 'Reiss', ''],
  ['Board_TomBean', 'billboard', '7816 W Highway 11', 'Tom Bean', 'TX', '75489', '', ''],
  ['Gunter_1', 'rent_house', '105 N 5th St', 'Gunter', 'TX', '75058', '', ''],
  ['Leonard_1', 'apartment', '', 'Leonard', 'TX', '', '', 'Apartment'],
  ['WolfeCity_1', 'rent_house', '', 'Wolfe City', 'TX', '', '', 'Electric utility tracked'],
  ['WolfeCity_2', 'rent_house', '', 'Wolfe City', 'TX', '', '', ''],
  ['TomBean_1', 'nnn_lease', '', 'Tom Bean', 'TX', '', '', 'Utility pass-through only'],
  ['Gainesville_1', 'rent_house', '', 'Gainesville', 'TX', '', '', ''],
  ['Celina', 'rent_house', '', 'Celina', 'TX', '', '', 'Month-to-month'],
];

// --- New Contracts layout (A-R) ---

const NEW_CONTRACTS_HEADERS = [
  'Property_ID', 'Tenant_Name', 'Contact_Name', 'Contact_Email', 'Contact_Phone',
  'Mailing_Address', 'Mailing_City', 'Mailing_State', 'Mailing_ZIP',
  'Monthly_Rent', 'Billing_Cycle', 'Contract_Start', 'Contract_End',
  'Active', 'Notify_Days', 'Vinyl_Required', 'Vinyl_Contact', 'Notes',
];

// Old column indices (0-based): A=Property_ID, B=Property_Type, C=Tenant_Name, D=Monthly_Rent,
// E=Billing_Cycle, F=Contract_Start, G=Contract_End, H=Active, I=Notify_Days,
// J=Vinyl_Required, K=Vinyl_Contact, L=Notes, M=Email

// Map from old column index -> new column index
// Old A (Property_ID)    -> New A (0)
// Old B (Property_Type)  -> DROPPED (moved to Properties)
// Old C (Tenant_Name)    -> New B (1)
// Old D (Monthly_Rent)   -> New J (9)
// Old E (Billing_Cycle)  -> New K (10)
// Old F (Contract_Start) -> New L (11)
// Old G (Contract_End)   -> New M (12)
// Old H (Active)         -> New N (13)
// Old I (Notify_Days)    -> New O (14)
// Old J (Vinyl_Required) -> New P (15)
// Old K (Vinyl_Contact)  -> New Q (16)
// Old L (Notes)          -> New R (17)
// Old M (Email)          -> New D (3)  (Contact_Email)

function transformRow(oldRow) {
  const newRow = new Array(18).fill('');
  newRow[0] = oldRow[0] || '';   // Property_ID
  newRow[1] = oldRow[2] || '';   // Tenant_Name (was old C)
  // Contact_Name (2), Contact_Phone (4), Mailing_Address (5-8) = blank
  newRow[3] = oldRow[12] || '';  // Contact_Email (was old M: Email)
  newRow[9] = oldRow[3] || '';   // Monthly_Rent (was old D)
  newRow[10] = oldRow[4] || '';  // Billing_Cycle (was old E)
  newRow[11] = oldRow[5] || '';  // Contract_Start (was old F)
  newRow[12] = oldRow[6] || '';  // Contract_End (was old G)
  newRow[13] = oldRow[7] || '';  // Active (was old H)
  newRow[14] = oldRow[8] || '';  // Notify_Days (was old I)
  newRow[15] = oldRow[9] || '';  // Vinyl_Required (was old J)
  newRow[16] = oldRow[10] || ''; // Vinyl_Contact (was old K)
  newRow[17] = oldRow[11] || ''; // Notes (was old L)
  return newRow;
}

// Additional rows not yet in Excel
const EXTRA_ROWS = [
  // Celina - Christian Lachausse
  ['Celina', 'Christian Lachausse', '', '', '', '', '', '', '', 1800, 'monthly', '', '', true, 3, false, '', 'Month-to-month'],
  // Board_TomBean - Tom Bean Feed & Supply (test email)
  ['Board_TomBean', 'Tom Bean Feed & Supply', '', 'sloan@tjmfuneral.com', '', '', '', '', '', 780, '4-week', '2025-12-01', '2026-05-18', true, 3, false, '', ''],
];

// Column letter helper
function colLetter(index) {
  return String.fromCharCode(65 + index);
}

async function migrate() {
  console.log('=== Excel Workbook Migration ===\n');

  // Step 1: Read current Contracts data
  console.log('Step 1: Reading current Contracts sheet...');
  const contractsRange = await graphRequest("/worksheets('Contracts')/usedRange");
  const oldRows = contractsRange?.values || [];
  console.log(`  Found ${oldRows.length} rows (including header)`);

  if (oldRows.length > 0) {
    console.log(`  Old headers: ${oldRows[0].join(', ')}`);
  }

  // Step 2: Create Properties sheet
  console.log('\nStep 2: Creating Properties sheet...');
  try {
    await graphRequest('/worksheets/add', {
      method: 'POST',
      body: JSON.stringify({ name: 'Properties' }),
    });
    console.log('  Properties sheet created');
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('NameAlreadyExists')) {
      console.log('  Properties sheet already exists, clearing it...');
      try {
        await graphRequest("/worksheets('Properties')/usedRange/clear", {
          method: 'POST',
          body: JSON.stringify({ applyTo: 'All' }),
        });
      } catch (clearErr) {
        if (!clearErr.message.includes('ItemNotFound')) throw clearErr;
      }
    } else {
      throw err;
    }
  }

  // Write Properties data
  const propsData = [PROPERTIES_HEADERS, ...PROPERTIES_ROWS];
  const propsRange = `A1:${colLetter(PROPERTIES_HEADERS.length - 1)}${propsData.length}`;
  console.log(`  Writing ${propsData.length} rows to Properties!${propsRange}...`);
  await graphRequest(`/worksheets('Properties')/range(address='${propsRange}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values: propsData }),
  });
  console.log('  Properties data written');

  // Step 3: Transform existing Contracts data
  console.log('\nStep 3: Transforming Contracts data...');
  const dataRows = oldRows.slice(1); // skip old header
  const transformedRows = dataRows.map(transformRow);
  console.log(`  Transformed ${transformedRows.length} existing rows`);

  // Check which extra rows are already present
  const existingPropertyIds = new Set(transformedRows.map(r => r[0]));
  const newExtraRows = EXTRA_ROWS.filter(r => !existingPropertyIds.has(r[0]));
  if (newExtraRows.length > 0) {
    console.log(`  Adding ${newExtraRows.length} new row(s): ${newExtraRows.map(r => r[0]).join(', ')}`);
  }

  const allDataRows = [...transformedRows, ...newExtraRows];
  const allRows = [NEW_CONTRACTS_HEADERS, ...allDataRows];

  // Step 4: Clear existing Contracts sheet
  console.log('\nStep 4: Clearing Contracts sheet...');
  try {
    await graphRequest("/worksheets('Contracts')/usedRange/clear", {
      method: 'POST',
      body: JSON.stringify({ applyTo: 'All' }),
    });
    console.log('  Contracts sheet cleared');
  } catch (err) {
    if (!err.message.includes('ItemNotFound')) throw err;
    console.log('  Contracts sheet was already empty');
  }

  // Step 5: Write new Contracts data
  console.log('\nStep 5: Writing new Contracts data...');
  const contractsRangeStr = `A1:${colLetter(NEW_CONTRACTS_HEADERS.length - 1)}${allRows.length}`;
  console.log(`  Writing ${allRows.length} rows to Contracts!${contractsRangeStr}...`);
  await graphRequest(`/worksheets('Contracts')/range(address='${contractsRangeStr}')`, {
    method: 'PATCH',
    body: JSON.stringify({ values: allRows }),
  });
  console.log('  Contracts data written');

  // Step 6: Verify
  console.log('\nStep 6: Verifying...');
  const verifyContracts = await graphRequest("/worksheets('Contracts')/usedRange");
  const verifyProperties = await graphRequest("/worksheets('Properties')/usedRange");
  console.log(`  Contracts: ${verifyContracts?.values?.length || 0} rows`);
  console.log(`  Properties: ${verifyProperties?.values?.length || 0} rows`);

  console.log('\n=== Migration complete ===');
}

migrate().catch(err => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
