# Test Data Factories

This directory contains factory functions for creating realistic test data.

## Purpose

**Don't do this**:
```typescript
// Hardcoded test data - brittle, repetitive, hard to maintain
const context = {
  threadHistory: [],
  userId: 'U123',
  channelId: 'C456',
  traceId: 'trace-abc',
};
```

**Do this**:
```typescript
import { createAgentContext } from '../../../tests/factories';

// Clean, realistic, flexible
const context = createAgentContext();

// Override only what matters for this test
const specificContext = createAgentContext({ userId: 'U_SPECIFIC' });
```

---

## Available Factories

### agent-factory.ts

#### Core Data Structures

**`createAgentContext(overrides?)`**
Creates realistic AgentContext for agent loop tests.

```typescript
// Random IDs, empty history
const context = createAgentContext();

// Specific user, with history
const context = createAgentContext({
  userId: 'U123456',
  threadHistory: [
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there!' },
  ],
});
```

**`createAgentLoopOptions(overrides?)`**
Creates complete AgentLoopOptions with realistic defaults.

```typescript
// Default options
const options = createAgentLoopOptions();

// Custom context and prompt
const options = createAgentLoopOptions({
  context: createAgentContext({ userId: 'U_SPECIFIC' }),
  systemPrompt: 'You are a specialized assistant.',
});

// With status callback
const statusCalls: string[] = [];
const options = createAgentLoopOptions({
  setStatus: ({ phase, toolName }) => {
    statusCalls.push(`${phase}:${toolName ?? 'none'}`);
  },
});
```

#### Thread History

**`createThreadMessage(overrides?)`**
Creates a single thread message.

```typescript
const userMsg = createThreadMessage({ role: 'user', content: 'Hello!' });
const assistantMsg = createThreadMessage({ role: 'assistant' });  // Random content
```

**`createThreadHistory(count)`**
Creates realistic thread history with alternating user/assistant messages.

```typescript
// 6 messages (3 user, 3 assistant)
const history = createThreadHistory(6);
```

#### Mock Anthropic Streams

**`createMockStreamWithText(text, options?)`**
Simple text response stream.

```typescript
messagesCreateMock.mockImplementation(async () =>
  createMockStreamWithText('Hello, world!')
);
```

**`createMockStreamWithToolUse(contentBlocks, options?)`**
Stream with tool use.

```typescript
messagesCreateMock.mockImplementation(async () =>
  createMockStreamWithToolUse([
    { type: 'text', text: 'Let me search for that.' },
    { type: 'tool_use', id: 'tool_1', name: 'web_search', input: { query: 'test' } },
  ])
);
```

**`createMockStreamWithChunks(chunks, options?)`**
Stream multiple text chunks (for testing streaming).

```typescript
messagesCreateMock.mockImplementation(async () =>
  createMockStreamWithChunks(['Hello ', 'world', '!'])
);
```

#### Slack IDs

**`createSlackUserId()`**
Generates realistic Slack user ID (e.g., `U8H7K2P9Q1`)

**`createSlackChannelId()`**
Generates realistic Slack channel ID (e.g., `C8H7K2P`)

**`createSlackTimestamp(date?)`**
Generates Slack timestamp with microsecond precision (e.g., `1234567890.123456`)

#### Convenience Builders

**`createTestScenario(scenario)`**
One-liner for common test setups.

```typescript
const { options, mockStream, context } = createTestScenario({
  responseText: 'Hello!',
  userId: 'U_SPECIFIC',
  threadHistory: [{ role: 'user', content: 'Hi' }],
});

messagesCreateMock.mockImplementation(async () => mockStream);
const result = await executeAgentLoop('Hi', options);
```

---

## Quick Migration Guide

### Before (Hardcoded)
```typescript
it('should process user message', async () => {
  const options: AgentLoopOptions = {
    context: {
      threadHistory: [],
      userId: 'U123',
      channelId: 'C456',
      traceId: 'trace-abc',
    },
    systemPrompt: 'You are Orion, a helpful assistant.',
  };

  messagesCreateMock.mockImplementation(async () => ({
    [Symbol.asyncIterator]: () => {
      let index = 0;
      const events = [
        { type: 'message_start', message: { model: 'claude-sonnet-4-20250514' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 10, output_tokens: 5 } },
      ];
      return {
        async next() {
          if (index < events.length) return { value: events[index++], done: false };
          return { value: undefined, done: true };
        },
      };
    },
  }));

  const result = await executeAgentLoop('Hi', options);
  expect(result).toContain('Hello');
});
```

### After (Factory)
```typescript
import { createAgentLoopOptions, createMockStreamWithText } from '../../../tests/factories';

it('should process user message', async () => {
  // Given: Agent setup with defaults
  const options = createAgentLoopOptions();

  // When: Mock returns simple text response
  messagesCreateMock.mockImplementation(async () =>
    createMockStreamWithText('Hello')
  );

  const result = await executeAgentLoop('Hi', options);

  // Then: Response contains expected text
  expect(result).toContain('Hello');
});
```

**Benefits**:
- ✅ 75% less code
- ✅ Clear intent (no setup noise)
- ✅ Realistic, varied data (faker)
- ✅ Easy to maintain (change factory, all tests update)
- ✅ Override only what matters for each test

---

## Best Practices

### 1. Use Defaults When Possible
```typescript
// ✅ Good - use defaults
const context = createAgentContext();

// ❌ Avoid - only override when test requires it
const context = createAgentContext({
  userId: 'U123',
  channelId: 'C456',
  threadHistory: [],
  traceId: 'trace-abc',
});
```

### 2. Override Only What Matters
```typescript
// ✅ Good - clear what's being tested
it('should handle specific user', async () => {
  const context = createAgentContext({ userId: 'U_ADMIN' });
  // Test logic...
});
```

### 3. Use Realistic Data for Integration Tests
```typescript
// Faker generates varied, realistic data
const users = Array.from({ length: 10 }, () => createAgentContext());
// Each user has unique, realistic IDs
```

### 4. Use createTestScenario for Common Patterns
```typescript
// ✅ One-liner setup
const { options, mockStream } = createTestScenario({
  responseText: 'Hello!',
  userId: 'U_SPECIFIC',
});

messagesCreateMock.mockImplementation(async () => mockStream);
```

---

## Adding New Factories

When you find yourself copying test data:

1. **Create factory function**
```typescript
// tests/factories/my-factory.ts
import { faker } from '@faker-js/faker';

export function createMyThing(overrides = {}) {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    ...overrides,
  };
}
```

2. **Export from index.ts**
```typescript
// tests/factories/index.ts
export { createMyThing } from './my-factory.js';
```

3. **Update this README**
Document the new factory with examples.

4. **Refactor existing tests**
Update a few tests to use the new factory.

---

## Future Factories

Planned factory modules:

- **slack-factory.ts** - Slack events, messages, clients
- **tool-factory.ts** - MCP tools, tool results
- **memory-factory.ts** - Memory structures, search results

---

## See Also

- [Testing Standards](../../docs/testing-standards.md) - Full testing guide
- [Test Quality Quick Reference](../../docs/test-quality-quick-reference.md) - Cheat sheet
- [@faker-js/faker docs](https://fakerjs.dev/) - Faker API reference

---

**Questions?** Check the testing standards or ask TEA (`bmad tea`)
