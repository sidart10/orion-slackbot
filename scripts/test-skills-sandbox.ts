/**
 * Test Skills in Sandbox (Task 9 Verification)
 *
 * Run with:
 *   GKE_SANDBOX_ROUTER_URL=http://localhost:8080 npx tsx scripts/test-skills-sandbox.ts
 */
import { executeSandbox } from "../src/tools/code-execution/sandbox-client.js";

async function testSkillsInSandbox() {
  console.log("=== Testing Skills in Sandbox (Task 9) ===\n");

  // Test 1: List skills directory
  console.log("Test 1: List /skills/ directory");
  const listResult = await executeSandbox({
    code: "import os; print('\\n'.join(sorted(os.listdir('/skills/'))))",
    timeout: 30
  });
  console.log("  Skills found:");
  listResult.stdout.trim().split('\n').forEach(s => console.log("    - " + s));
  console.log("  exit:", listResult.return_code);
  console.log("");

  // Test 2: Read example SKILL.md (the test from story)
  console.log("Test 2: cat /skills/example/SKILL.md");
  const readResult = await executeSandbox({
    code: "print(open('/skills/example/SKILL.md').read())",
    timeout: 30
  });
  console.log("  Content (first 300 chars):");
  console.log("  " + readResult.stdout.trim().slice(0, 300).replace(/\n/g, '\n  '));
  console.log("  ...");
  console.log("  exit:", readResult.return_code);
  console.log("");

  // Test 3: Verify summarize skill (used in production)
  console.log("Test 3: Verify /skills/summarize/SKILL.md exists");
  const summarizeResult = await executeSandbox({
    code: "import os; print('EXISTS' if os.path.exists('/skills/summarize/SKILL.md') else 'MISSING')",
    timeout: 30
  });
  console.log("  Status:", summarizeResult.stdout.trim());
  console.log("  exit:", summarizeResult.return_code);

  console.log("\n=== Task 9 Verification Complete ===");
  const allPassed = listResult.return_code === 0 &&
                    readResult.return_code === 0 &&
                    summarizeResult.return_code === 0;
  console.log("Result:", allPassed ? "PASS" : "FAIL");
}

testSkillsInSandbox().catch(console.error);
