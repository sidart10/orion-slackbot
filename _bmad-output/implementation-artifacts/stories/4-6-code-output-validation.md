# Story 4.6: Code Output Validation

Status: ready-for-dev

## Story

As a **user**,
I want generated code output to be validated before I see it,
So that I receive correct, safe results.

## Acceptance Criteria

1. **Given** code has executed and produced output, **When** the agent processes the results, **Then** output is validated before returning to the user (FR23)

2. **Given** validation runs, **When** errors are detected, **Then** error outputs are handled gracefully

3. **Given** validation runs, **When** unexpected formats occur, **Then** unexpected output formats are caught

4. **Given** validation fails, **When** retry is possible, **Then** validation failures trigger retry with adjusted code

5. **Given** validation runs, **When** tracing is active, **Then** validation results are logged in Langfuse

## Tasks / Subtasks

- [ ] **Task 1: Create Validation Module** (AC: #1)
  - [ ] Create `src/tools/sandbox/validator.ts`
  - [ ] Implement `validateOutput()` function
  - [ ] Define validation rules

- [ ] **Task 2: Handle Errors** (AC: #2)
  - [ ] Detect error messages
  - [ ] Parse stack traces
  - [ ] Create user-friendly error

- [ ] **Task 3: Validate Format** (AC: #3)
  - [ ] Check expected output format
  - [ ] Handle unexpected formats
  - [ ] Sanitize output

- [ ] **Task 4: Trigger Retry** (AC: #4)
  - [ ] Detect validation failure
  - [ ] Pass feedback to generator
  - [ ] Retry with adjustments

- [ ] **Task 5: Log Validation** (AC: #5)
  - [ ] Create validation span
  - [ ] Log pass/fail
  - [ ] Include issues found

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Execute code with errors
  - [ ] Verify graceful handling
  - [ ] Test retry behavior
  - [ ] Check validation logs

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR23 | prd.md | Validate code output |

### Validation Rules

```typescript
interface ValidationResult {
  passed: boolean;
  issues: string[];
  sanitizedOutput?: string;
}

function validateOutput(output: ExecutionResult): ValidationResult {
  const issues: string[] = [];

  // Check for errors
  if (output.exitCode !== 0) {
    issues.push(`Non-zero exit code: ${output.exitCode}`);
  }

  // Check for error indicators
  if (output.stderr && output.stderr.includes('Error')) {
    issues.push('Error in stderr');
  }

  // Check output size
  if (output.stdout.length > 10000) {
    issues.push('Output too large, truncating');
  }

  return {
    passed: issues.length === 0,
    issues,
    sanitizedOutput: sanitize(output.stdout),
  };
}
```

### References

- [Source: _bmad-output/epics.md#Story 4.6] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Validation catches errors before user sees them
- Retry with feedback improves success rate
- Consider adding output sanitization for security

### File List

Files to create:
- `src/tools/sandbox/validator.ts`

