# Two-Pass Review Pattern

After implementing a story or feature, always do a code review pass before marking complete.

## Why

| Epic | Finding |
|------|---------|
| Epic 1 | 38 code review findings caught before merge |
| Epic 7 | Story 7.6 citation logic required 3 iterations after review |
| Epic 8 | Story 8.1 code review caught files that existed but weren't integrated |

## Pattern

1. **Implementation Pass** - Write the code
2. **Code Review Pass** - Before marking done:
   - Trace actual execution paths (don't trust grep alone)
   - Verify all modules are wired up
   - Check that new files are imported/registered
   - Validate error handling paths

## Checklist

- [ ] New files are imported where needed
- [ ] New functions are actually called from handlers
- [ ] Tests cover the new functionality
- [ ] Documentation updated (project-context.md if applicable)

## Source Sessions

- Epic 1: Code review process effective - 38 findings, all caught pre-merge
- Epic 7: Code review catches integration gaps - identified source citation logic was incorrect
- Epic 8: Two-pass pattern (implementation + code review) proved valuable
