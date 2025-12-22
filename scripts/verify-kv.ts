/**
 * Quick script to verify Vercel KV connection
 * Run: npx tsx scripts/verify-kv.ts
 */
import { kv } from '@vercel/kv';

async function verifyKV() {
  console.log('🔌 Testing Vercel KV connection...\n');

  try {
    // 1. Ping
    const pong = await kv.ping();
    console.log('✅ Ping:', pong);

    // 2. Save test data
    const testKey = 'orion:test:verification';
    await kv.set(testKey, { verified: true, timestamp: Date.now() });
    console.log('✅ Write: saved test key');

    // 3. Read test data
    const data = await kv.get(testKey);
    console.log('✅ Read:', JSON.stringify(data));

    // 4. Delete test data
    await kv.del(testKey);
    console.log('✅ Delete: cleaned up');

    console.log('\n🎉 Vercel KV integration working!');
  } catch (error) {
    console.error('❌ KV Error:', error);
    process.exit(1);
  }
}

verifyKV();

