#!/usr/bin/env npx tsx
/**
 * Memory Tool GCS Verification Script
 *
 * Tests the memory storage layer against a real GCS bucket.
 * Run: npx tsx scripts/verify-memory-gcs.ts
 *
 * @see Story 5.1 - Task 6: Verification
 */

import { readFile, writeFile, deleteFile, listFiles } from '../src/tools/memory/storage.js';

const BUCKET = process.env.GCS_MEMORIES_BUCKET || 'orion-memories';
const TEST_PATH = 'verification-test/test-memory.txt';
const TEST_CONTENT = `Memory verification test\nTimestamp: ${new Date().toISOString()}`;
const UPDATED_CONTENT = `Updated content\nTimestamp: ${new Date().toISOString()}`;

async function verify() {
  console.log(`\n🧪 Memory GCS Verification`);
  console.log(`   Bucket: ${BUCKET}`);
  console.log(`   Path: /memories/${TEST_PATH}\n`);

  try {
    // Step 1: Create
    console.log('1️⃣  Creating memory file...');
    await writeFile(BUCKET, TEST_PATH, TEST_CONTENT);
    console.log('   ✅ Created successfully\n');

    // Step 2: View
    console.log('2️⃣  Reading memory file...');
    const content = await readFile(BUCKET, TEST_PATH);
    if (content === TEST_CONTENT) {
      console.log('   ✅ Content matches\n');
    } else {
      throw new Error(`Content mismatch: expected "${TEST_CONTENT}", got "${content}"`);
    }

    // Step 3: Update
    console.log('3️⃣  Updating memory file...');
    await writeFile(BUCKET, TEST_PATH, UPDATED_CONTENT);
    const updated = await readFile(BUCKET, TEST_PATH);
    if (updated === UPDATED_CONTENT) {
      console.log('   ✅ Updated successfully\n');
    } else {
      throw new Error(`Update failed: content mismatch`);
    }

    // Step 4: List
    console.log('4️⃣  Listing memory files...');
    const files = await listFiles(BUCKET, 'verification-test/');
    console.log(`   Found ${files.length} file(s): ${files.join(', ')}`);
    if (files.includes(`/memories/${TEST_PATH}`)) {
      console.log('   ✅ File appears in listing\n');
    } else {
      throw new Error(`File not found in listing`);
    }

    // Step 5: Delete
    console.log('5️⃣  Deleting memory file...');
    await deleteFile(BUCKET, TEST_PATH);
    console.log('   ✅ Deleted successfully\n');

    // Step 6: Verify deletion
    console.log('6️⃣  Verifying deletion...');
    try {
      await readFile(BUCKET, TEST_PATH);
      throw new Error('File still exists after deletion!');
    } catch (e) {
      if (e instanceof Error && e.message.includes('not found')) {
        console.log('   ✅ File confirmed deleted\n');
      } else {
        throw e;
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL VERIFICATION STEPS PASSED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Next: Check GCS console and Langfuse for spans.\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error);
    process.exit(1);
  }
}

verify();

