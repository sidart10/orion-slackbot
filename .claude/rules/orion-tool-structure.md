# Orion Tool Structure

New tools for Orion follow the established structure.

## Directory Layout

```
src/tools/{tool-name}/
├── tool.ts        # Tool definition + handler
├── index.ts       # Barrel exports
└── tool.test.ts   # Co-located tests
```

## Tool Definition Pattern

```typescript
// src/tools/{tool-name}/tool.ts
import { Tool, ToolResult } from '../types';

export const myTool: Tool = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    // Zod schema
  },
  handler: async (params, context): Promise<ToolResult> => {
    // Implementation
    return { success: true, data: result };
  }
};
```

## Registration

Tools are registered in `src/tools/registry.ts`.

## Established Patterns

| Module | Location | Purpose |
|--------|----------|---------|
| Summarize | `src/tools/summarize/` | Conversation summarization |
| Output Sanitizer | `src/tools/output-sanitizer.ts` | Filter technical noise |
| Tool Summary | `src/tools/tool-summary.ts` | Consistent status messages |
| Error Humanizer | `src/tools/error-humanizer.ts` | User-friendly errors |

## Key Conventions

1. **Return `ToolResult<T>`** - Never throw from handlers
2. **Co-locate tests** - `tool.test.ts` next to implementation
3. **Barrel exports** - Re-export from `index.ts`
4. **Context injection** - Tools receive context with Slack client, trace ID, etc.

## Source Sessions

- Epic 7: Summarization tool structured under `src/tools/summarize/`
- Epic 8: Output sanitization, tool summary patterns established
