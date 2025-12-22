/**
 * Standalone Vercel Sandbox Verification Script
 *
 * Verifies that Vercel Sandbox is properly configured and can:
 * 1. Create a sandbox instance
 * 2. Install the Anthropic SDK
 * 3. Execute a verification script
 *
 * Run with:
 *   node --env-file .env.local --experimental-strip-types scripts/verify-sandbox.ts
 *
 * @see Story 3.0 - Vercel Sandbox Agent Runtime
 */

import ms from 'ms';
import { Sandbox } from '@vercel/sandbox';

async function verify() {
  console.log('🚀 Vercel Sandbox Verification');
  console.log('================================\n');

  console.log('1. Creating sandbox...');
  const startCreate = Date.now();
  const sandbox = await Sandbox.create({
    resources: { vcpus: 4 },
    timeout: ms('5m'),
    runtime: 'node22',
  });
  console.log(`   ✓ Sandbox created: ${sandbox.sandboxId}`);
  console.log(`   ⏱ Duration: ${Date.now() - startCreate}ms\n`);

  console.log('2. Installing Anthropic SDK...');
  const startInstall = Date.now();
  const install = await sandbox.runCommand({
    cmd: 'npm',
    args: ['install', '@anthropic-ai/sdk'],
    cwd: '/vercel/sandbox',
  });

  if (install.exitCode !== 0) {
    const stderr = await install.stderr();
    console.error('   ✗ Install failed:', stderr);
    await sandbox.stop();
    process.exit(1);
  }
  console.log(`   ✓ Anthropic SDK installed`);
  console.log(`   ⏱ Duration: ${Date.now() - startInstall}ms\n`);

  console.log('3. Verifying SDK import...');
  await sandbox.writeFiles([
    {
      path: '/vercel/sandbox/verify.mjs',
      content: Buffer.from(`
import Anthropic from '@anthropic-ai/sdk';
console.log('SDK loaded successfully');
console.log('Anthropic client available:', typeof Anthropic === 'function');
`),
    },
  ]);

  const verify = await sandbox.runCommand({
    cmd: 'node',
    args: ['verify.mjs'],
    cwd: '/vercel/sandbox',
  });

  const stdout = await verify.stdout();
  console.log(`   ${stdout.trim().split('\n').join('\n   ')}\n`);

  console.log('4. Stopping sandbox...');
  await sandbox.stop();
  console.log('   ✓ Sandbox stopped\n');

  console.log('================================');
  console.log('✅ Verification complete!');
}

verify().catch((error) => {
  console.error('\n❌ Verification failed:', error.message);
  process.exit(1);
});
