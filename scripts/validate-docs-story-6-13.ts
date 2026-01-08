#!/usr/bin/env tsx
/**
 * Story 6.13 Documentation Validation Script
 *
 * Validates acceptance criteria for documentation updates reflecting Skills API migration.
 * Run after completing Story 6.13 tasks to verify all documentation changes.
 *
 * @see Story 6.13 - Documentation Update
 *
 * Usage:
 *   pnpm tsx scripts/validate-docs-story-6-13.ts
 *
 * Exit codes:
 *   0 = All validations passed
 *   1 = One or more validations failed
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

interface ValidationResult {
  ac: string;
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details?: string;
  evidence?: string;
}

const results: ValidationResult[] = [];

/**
 * Helper to check if content contains phrase (case-insensitive)
 */
function contains(content: string, phrase: string): boolean {
  return content.toLowerCase().includes(phrase.toLowerCase());
}

/**
 * Helper to count regex matches
 */
function countMatches(content: string, pattern: RegExp): number {
  return (content.match(pattern) || []).length;
}

/**
 * Validate AC#1: ADR-2026-01-07 documents Skills API as primary with Files API
 */
async function validateAC1(): Promise<void> {
  const archPath = '_bmad-output/architecture.md';
  const content = await readFile(archPath, 'utf-8');

  // Check for Skills API Lifecycle section
  const hasLifecycle = contains(content, 'Skills API Lifecycle');
  results.push({
    ac: 'AC#1',
    test: 'ADR-2026-01-07 has Skills API Lifecycle section',
    status: hasLifecycle ? 'PASS' : 'FAIL',
    details: hasLifecycle
      ? 'Found "Skills API Lifecycle" section'
      : 'Missing "Skills API Lifecycle" section - see Task 1.2',
  });

  // Check for Upload Phase documentation
  const hasUploadPhase = contains(content, 'Upload Phase');
  results.push({
    ac: 'AC#1',
    test: 'Documents Upload Phase (startup skill sync)',
    status: hasUploadPhase ? 'PASS' : 'FAIL',
    details: hasUploadPhase ? 'Upload Phase documented' : 'Missing Upload Phase details',
  });

  // Check for Reference Phase documentation
  const hasReferencePhase = contains(content, 'Reference Phase');
  results.push({
    ac: 'AC#1',
    test: 'Documents Reference Phase (per-message container)',
    status: hasReferencePhase ? 'PASS' : 'FAIL',
    details: hasReferencePhase ? 'Reference Phase documented' : 'Missing Reference Phase details',
  });

  // Check for Container Reuse documentation
  const hasContainerReuse = contains(content, 'Container Reuse');
  results.push({
    ac: 'AC#1',
    test: 'Documents Container Reuse pattern',
    status: hasContainerReuse ? 'PASS' : 'FAIL',
    details: hasContainerReuse ? 'Container Reuse documented' : 'Missing Container Reuse pattern',
  });

  // Check for Files API integration
  const hasFilesAPI = contains(content, 'Files API');
  results.push({
    ac: 'AC#1',
    test: 'Documents Files API integration',
    status: hasFilesAPI ? 'PASS' : 'FAIL',
    details: hasFilesAPI ? 'Files API documented' : 'Missing Files API integration details',
  });
}

/**
 * Validate AC#2: Code Execution section describes Anthropic first, GKE second
 */
async function validateAC2(): Promise<void> {
  const archPath = '_bmad-output/architecture.md';
  const content = await readFile(archPath, 'utf-8');

  // Find "Code Execution" or "Code Execution Architecture" section
  // Capture from "## Code Execution" until next "## " (level-2 heading)
  const codeExecMatch = content.match(/##\s+Code Execution(?:\s+Architecture)?[\s\S]*?(?=\n##\s+[^#]|$)/i);
  if (!codeExecMatch) {
    results.push({
      ac: 'AC#2',
      test: 'Code Execution section exists',
      status: 'FAIL',
      details: 'Missing "Code Execution" or "Code Execution Architecture" section in architecture.md',
    });
    return;
  }

  const codeExecSection = codeExecMatch[0];

  // Check order: Anthropic should appear before GKE in section
  const anthropicIndex = codeExecSection.toLowerCase().indexOf('anthropic');
  const gkeIndex = codeExecSection.toLowerCase().indexOf('gke');

  if (anthropicIndex === -1 && gkeIndex === -1) {
    results.push({
      ac: 'AC#2',
      test: 'Code Execution section mentions execution environments',
      status: 'FAIL',
      details: 'Code Execution section missing both Anthropic and GKE references',
    });
    return;
  }

  if (anthropicIndex === -1) {
    results.push({
      ac: 'AC#2',
      test: 'Code Execution section mentions Anthropic container',
      status: 'FAIL',
      details: 'Code Execution section missing Anthropic reference',
    });
    return;
  }

  if (gkeIndex === -1) {
    results.push({
      ac: 'AC#2',
      test: 'Code Execution section mentions GKE fallback',
      status: 'WARN',
      details: 'Code Execution section missing GKE reference (acceptable if purely Anthropic)',
    });
  } else {
    // Both exist - check order
    const correctOrder = anthropicIndex < gkeIndex;
    results.push({
      ac: 'AC#2',
      test: 'Code Execution describes Anthropic first, GKE second',
      status: correctOrder ? 'PASS' : 'FAIL',
      details: correctOrder
        ? 'Anthropic container documented before GKE fallback'
        : `GKE appears before Anthropic (GKE@${gkeIndex}, Anthropic@${anthropicIndex})`,
    });
  }

  // Check for "Primary" and "Fallback" terminology
  const hasPrimaryAnthropicprimaryAnthropicprimaryAnthropicnthropicLabel = codeExecSection.match(/primary.*anthropic|anthropic.*primary/i);
  const hasFallbackGKE = codeExecSection.match(/fallback.*gke|gke.*fallback/i);

  results.push({
    ac: 'AC#2',
    test: 'Uses "Primary" for Anthropic, "Fallback" for GKE',
    status: hasPrimaryAnthropicprimaryAnthropicprimaryAnthropicnthropicLabel && hasFallbackGKE ? 'PASS' : 'WARN',
    details:
      hasPrimaryAnthropicprimaryAnthropicprimaryAnthropicnthropicLabel && hasFallbackGKE
        ? 'Clear primary/fallback terminology used'
        : 'Consider using "Primary" and "Fallback" labels for clarity',
  });
}

/**
 * Validate AC#3: README mentions Skills API + PTC as primary execution
 */
async function validateAC3(): Promise<void> {
  const readmePath = 'README.md';
  const content = await readFile(readmePath, 'utf-8');

  // Check for Skills API mention
  const hasSkillsAPI = contains(content, 'Skills API');
  results.push({
    ac: 'AC#3',
    test: 'README mentions Skills API',
    status: hasSkillsAPI ? 'PASS' : 'FAIL',
    details: hasSkillsAPI ? 'Skills API referenced in README' : 'Missing Skills API reference',
  });

  // Check for PTC mention
  const hasPTC = contains(content, 'PTC') || contains(content, 'Programmatic Tool Calling');
  results.push({
    ac: 'AC#3',
    test: 'README mentions PTC (Programmatic Tool Calling)',
    status: hasPTC ? 'PASS' : 'FAIL',
    details: hasPTC ? 'PTC referenced in README' : 'Missing PTC reference',
  });

  // Check for Architecture section
  const hasArchSection = content.match(/##\s+Architecture/i);
  results.push({
    ac: 'AC#3',
    test: 'README has Architecture section',
    status: hasArchSection ? 'PASS' : 'WARN',
    details: hasArchSection
      ? 'Architecture section exists'
      : 'No Architecture section found - consider adding per Task 2.2',
  });

  // Check for code execution mention in context
  const hasCodeExecution = contains(content, 'code execution') || contains(content, 'Code Execution');
  results.push({
    ac: 'AC#3',
    test: 'README discusses code execution approach',
    status: hasCodeExecution ? 'PASS' : 'WARN',
    details: hasCodeExecution
      ? 'Code execution documented'
      : 'Consider adding Code Execution subsection per Task 2.2',
  });
}

/**
 * Validate AC#4: README Tech Stack lists Skills API, Files API, beta headers
 */
async function validateAC4(): Promise<void> {
  const readmePath = 'README.md';
  const content = await readFile(readmePath, 'utf-8');

  // Check for Tech Stack section
  const hasTechStack = content.match(/##\s+Tech Stack/i);
  results.push({
    ac: 'AC#4',
    test: 'README has Tech Stack section',
    status: hasTechStack ? 'PASS' : 'FAIL',
    details: hasTechStack ? 'Tech Stack section exists' : 'Missing Tech Stack section - see Task 2.3',
  });

  if (!hasTechStack) {
    return; // Skip remaining checks if section doesn't exist
  }

  // Check for Anthropic SDK version
  const hasAnthropicSDK = content.match(/@anthropic-ai\/sdk.*0\.7[0-9]/i);
  results.push({
    ac: 'AC#4',
    test: 'Tech Stack lists @anthropic-ai/sdk version',
    status: hasAnthropicSDK ? 'PASS' : 'WARN',
    details: hasAnthropicSDK
      ? 'Anthropic SDK version documented'
      : 'Consider adding @anthropic-ai/sdk version',
  });

  // Check for beta headers
  const hasBetaHeaders = contains(content, 'beta') && contains(content, 'skills-2025-10-02');
  results.push({
    ac: 'AC#4',
    test: 'Tech Stack documents required beta headers',
    status: hasBetaHeaders ? 'PASS' : 'FAIL',
    details: hasBetaHeaders
      ? 'Beta headers documented'
      : 'Missing beta headers section - see Task 2.3',
  });

  // Check for all 5 required betas
  const requiredBetas = [
    'context-management-2025-06-27',
    'advanced-tool-use-2025-11-20',
    'code-execution-2025-08-25',
    'skills-2025-10-02',
    'files-api-2025-04-14',
  ];

  const missingBetas = requiredBetas.filter((beta) => !contains(content, beta));

  results.push({
    ac: 'AC#4',
    test: 'All 5 required beta headers documented',
    status: missingBetas.length === 0 ? 'PASS' : 'WARN',
    details:
      missingBetas.length === 0
        ? 'All 5 betas documented'
        : `Missing betas: ${missingBetas.join(', ')}`,
  });
}

/**
 * Validate AC#5: infra/gke-sandbox/README.md says "Fallback Only"
 */
async function validateAC5(): Promise<void> {
  const gkeReadmePath = 'infra/gke-sandbox/README.md';

  if (!existsSync(gkeReadmePath)) {
    results.push({
      ac: 'AC#5',
      test: 'infra/gke-sandbox/README.md exists',
      status: 'FAIL',
      details: 'File does not exist - GKE infrastructure documentation missing',
    });
    return;
  }

  const content = await readFile(gkeReadmePath, 'utf-8');

  // Check for "Fallback Only" status
  const hasFallbackStatus =
    contains(content, 'Fallback Only') ||
    contains(content, 'FALLBACK ONLY') ||
    contains(content, 'fallback-only');

  results.push({
    ac: 'AC#5',
    test: 'GKE README header says "Fallback Only"',
    status: hasFallbackStatus ? 'PASS' : 'FAIL',
    details: hasFallbackStatus
      ? 'Fallback status clearly marked'
      : 'Missing "Fallback Only" status - should have been added in Story 6.12',
  });

  // Check header is in first 100 lines (should be prominent)
  const first100Lines = content.split('\n').slice(0, 100).join('\n');
  const statusInHeader = first100Lines.match(/fallback\s*only/i);

  results.push({
    ac: 'AC#5',
    test: 'Fallback status appears in header (first 100 lines)',
    status: statusInHeader ? 'PASS' : 'WARN',
    details: statusInHeader
      ? 'Status prominently displayed in header'
      : 'Fallback status exists but may not be prominent enough',
  });
}

/**
 * Validate AC#6: All "GKE" references clarify fallback status
 */
async function validateAC6(): Promise<void> {
  const files = [
    '_bmad-output/architecture.md',
    'README.md',
    'infra/gke-sandbox/README.md',
  ];

  let totalPrimaryRefs = 0;
  const violations: Array<{ file: string; match: string }> = [];

  for (const file of files) {
    if (!existsSync(file)) continue;

    const content = await readFile(file, 'utf-8');

    // Find problematic patterns: "GKE" + "primary" in same context
    // BUT exclude historical context (e.g., "Before (GKE Was Primary)")
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const primaryPattern = /primary.*?gke|gke.*?primary/gi;
      const matches = line.match(primaryPattern) || [];

      // Skip if line contains historical markers or is within options/decision tables
      const isHistorical =
        /before|was primary|status quo/i.test(line) ||
        /^\|.*\|.*\|/.test(line); // Markdown table row

      if (matches.length > 0 && !isHistorical) {
        matches.forEach((match) => {
          totalPrimaryRefs++;
          violations.push({ file, match: `Line ${idx + 1}: ${match.trim()}` });
        });
      }
    });
  }

  results.push({
    ac: 'AC#6',
    test: 'No "GKE as primary" references in documentation',
    status: totalPrimaryRefs === 0 ? 'PASS' : 'FAIL',
    details:
      totalPrimaryRefs === 0
        ? 'All GKE references correctly positioned as fallback'
        : `Found ${totalPrimaryRefs} "GKE + primary" references`,
    evidence:
      violations.length > 0
        ? violations.map((v) => `${v.file}: "${v.match}"`).join('\n')
        : undefined,
  });

  // Check for proper "fallback" terminology with GKE
  let totalFallbackRefs = 0;

  for (const file of files) {
    if (!existsSync(file)) continue;

    const content = await readFile(file, 'utf-8');
    const fallbackPattern = /fallback.*?gke|gke.*?fallback/gi;
    const matches = content.match(fallbackPattern) || [];
    totalFallbackRefs += matches.length;
  }

  results.push({
    ac: 'AC#6',
    test: 'GKE references include "fallback" terminology',
    status: totalFallbackRefs > 0 ? 'PASS' : 'WARN',
    details:
      totalFallbackRefs > 0
        ? `Found ${totalFallbackRefs} correct "GKE + fallback" references`
        : 'Consider adding explicit "fallback" label to GKE references',
  });
}

/**
 * Bonus: Validate internal markdown links
 */
async function validateInternalLinks(): Promise<void> {
  const files = [
    '_bmad-output/architecture.md',
    'README.md',
  ];

  const brokenLinks: Array<{ file: string; link: string }> = [];

  for (const file of files) {
    if (!existsSync(file)) continue;

    const content = await readFile(file, 'utf-8');
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkPattern.exec(content)) !== null) {
      const linkTarget = match[2];

      // Only check internal relative links (not URLs or anchors)
      if (linkTarget.startsWith('http') || linkTarget.startsWith('#')) {
        continue;
      }

      // Resolve relative path from file location
      const fullPath = resolve(file, '..', linkTarget.split('#')[0]);

      if (!existsSync(fullPath)) {
        brokenLinks.push({ file, link: linkTarget });
      }
    }
  }

  results.push({
    ac: 'BONUS',
    test: 'No broken internal markdown links',
    status: brokenLinks.length === 0 ? 'PASS' : 'WARN',
    details:
      brokenLinks.length === 0
        ? 'All internal links valid'
        : `Found ${brokenLinks.length} broken links`,
    evidence:
      brokenLinks.length > 0
        ? brokenLinks.map((l) => `${l.file}: ${l.link}`).join('\n')
        : undefined,
  });
}

/**
 * Main validation runner
 */
async function main(): Promise<void> {
  console.log('📋 Story 6.13 Documentation Validation\n');
  console.log('Running validation checks...\n');

  try {
    await validateAC1();
    await validateAC2();
    await validateAC3();
    await validateAC4();
    await validateAC5();
    await validateAC6();
    await validateInternalLinks();

    // Print results grouped by AC
    const groupedResults = results.reduce(
      (acc, result) => {
        if (!acc[result.ac]) acc[result.ac] = [];
        acc[result.ac].push(result);
        return acc;
      },
      {} as Record<string, ValidationResult[]>
    );

    for (const [ac, acResults] of Object.entries(groupedResults)) {
      console.log(`\n${ac === 'BONUS' ? '🎁 BONUS' : `✓ ${ac}`}`);
      console.log('─'.repeat(60));

      for (const result of acResults) {
        const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️ ' : '❌';
        console.log(`${icon} ${result.test}`);
        if (result.details) {
          console.log(`   ${result.details}`);
        }
        if (result.evidence) {
          console.log(`   Evidence:\n${result.evidence.split('\n').map((l) => `     ${l}`).join('\n')}`);
        }
      }
    }

    // Summary
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    const warned = results.filter((r) => r.status === 'WARN').length;

    console.log('\n' + '═'.repeat(60));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warned}`);
    console.log(`📝 Total: ${results.length}`);

    if (failed > 0) {
      console.log('\n❌ Validation FAILED - Please address failures before completing Story 6.13');
      process.exit(1);
    } else if (warned > 0) {
      console.log('\n⚠️  Validation PASSED with warnings - Consider addressing warnings for quality');
      process.exit(0);
    } else {
      console.log('\n✅ Validation PASSED - Story 6.13 acceptance criteria met!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Validation script error:', error);
    process.exit(1);
  }
}

// Run validation
main();
