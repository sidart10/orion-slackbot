# Multi-Layer Bug Investigation

When a bug fix doesn't fully resolve the issue, continue investigating - there may be multiple contributing factors.

## Case Study: Epic 7 Story 7.5

The duplicate response bug had THREE separate causes:
1. **Event layer:** Both handlers firing for channel @mentions
2. **Agent layer:** `attemptResponse` accumulating across tool loop iterations
3. **SDK layer:** Race condition with two `startStream` API calls

A single fix would not have resolved it.

## Pattern

When debugging:

1. **Apply first fix** - Based on initial investigation
2. **Verify resolution** - Test if issue is fully fixed
3. **If partially fixed, continue** - The remaining symptoms may have different causes
4. **Document all causes** - Future bugs may share root causes

## Anti-Patterns

- Assuming first fix solves everything
- Stopping investigation when symptoms reduce
- Closing bug without full verification

## Also Applies To

- Config vs code bugs (Epic 8 Story 8.4) - What looks like code issue may be config
- Integration gaps - Files may exist but not be wired up

## Source Sessions

- Epic 7: Story 7.5 multi-layer investigation documented in lessons learned
- Epic 8: Story 8.4 config vs code distinction
