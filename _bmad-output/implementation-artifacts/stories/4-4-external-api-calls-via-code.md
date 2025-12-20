# Story 4.4: External API Calls via Code

Status: ready-for-dev

## Story

As a **user**,
I want generated code to call external APIs,
So that Orion can connect to any system with an API.

## Acceptance Criteria

1. **Given** code is executing in E2B sandbox, **When** the code makes HTTP requests, **Then** external API calls succeed (FR21)

2. **Given** API calls are made, **When** responses are received, **Then** API responses are captured and returned to the agent

3. **Given** network calls occur, **When** debugging is needed, **Then** network calls are logged for debugging

4. **Given** API access is needed, **When** the agent generates code, **Then** the agent includes proper request handling (error handling, timeouts)

5. **Given** authentication is needed, **When** code runs, **Then** authentication is passed via environment variables to E2B sandbox

## Tasks / Subtasks

- [ ] **Task 1: Verify E2B Network Access** (AC: #1)
  - [ ] Confirm E2B allows outbound HTTP/HTTPS by default
  - [ ] Test API call from E2B sandbox
  - [ ] Document any network limitations

- [ ] **Task 2: Pass Environment Variables** (AC: #5)
  - [ ] Implement `setEnvVars()` for E2B sandbox
  - [ ] Pass API keys from GCP Secret Manager
  - [ ] Never log sensitive values

- [ ] **Task 3: Guide Code Generation for APIs** (AC: #4)
  - [ ] Create prompt patterns for API calls
  - [ ] Include error handling in generated code
  - [ ] Include request timeouts in generated code

- [ ] **Task 4: Log Network Activity** (AC: #3)
  - [ ] Log API call attempts (URL, method)
  - [ ] Log response status codes
  - [ ] Track request duration
  - [ ] Redact sensitive headers

- [ ] **Task 5: Capture API Responses** (AC: #2)
  - [ ] Parse JSON responses
  - [ ] Handle non-JSON responses
  - [ ] Handle error responses (4xx, 5xx)

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Generate code that calls a public API
  - [ ] Generate code that calls authenticated API
  - [ ] Verify response captured correctly
  - [ ] Check network logs in Langfuse

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR21 | prd.md | External API calls via code |

### E2B Network Access

**E2B sandboxes have full outbound network access by default.** No special configuration needed.

```python
# This just works in E2B sandbox
import requests

response = requests.get('https://api.github.com/users/octocat')
print(response.json())
```

### Passing API Keys to E2B

```typescript
import { withSandbox } from './factory.js';
import { getSecret } from '../../config/secrets.js';

// Get API key from GCP Secret Manager
const apiKey = await getSecret('EXTERNAL_API_KEY');

// Pass to sandbox via environment
await withSandbox(async (sandbox) => {
  // Set environment variable in sandbox
  await sandbox.process.startAndWait(`export API_KEY="${apiKey}"`);
  
  // Now generated code can use it
  const result = await sandbox.runCode(`
import os
import requests

api_key = os.environ.get('API_KEY')
response = requests.get(
    'https://api.example.com/data',
    headers={'Authorization': f'Bearer {api_key}'}
)
print(response.json())
  `);
  
  return result;
}, { envVars: { API_KEY: apiKey } });
```

### Code Generation Prompt Pattern

When generating code for API calls, include:

```typescript
const apiCodePrompt = `
Generate Python code to call the API. Requirements:
- Use the requests library
- Include proper error handling (try/except)
- Set a timeout (10 seconds)
- Get API key from os.environ.get('API_KEY')
- Print the result as JSON

Example structure:
\`\`\`python
import os
import requests

try:
    response = requests.get(
        'https://api.example.com/endpoint',
        headers={'Authorization': f"Bearer {os.environ.get('API_KEY')}"},
        timeout=10
    )
    response.raise_for_status()
    print(response.json())
except requests.exceptions.Timeout:
    print("Error: Request timed out")
except requests.exceptions.RequestException as e:
    print(f"Error: {e}")
\`\`\`
`;
```

### Security Notes

| Do | Don't |
|----|----|
| Pass API keys via env vars | Hardcode API keys in generated code |
| Log URL and method | Log Authorization headers |
| Redact sensitive values | Expose secrets in Langfuse traces |

### References

- [E2B Documentation](https://e2b.dev/docs)
- [Source: _bmad-output/epics.md#Story 4.4] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- **E2B has network access by default** — No configuration needed
- API keys passed via environment variables to sandbox
- Generated code should include error handling and timeouts
- Never log sensitive authentication values
- Consider caching common API patterns

### File List

Files to modify:
- `src/tools/sandbox/factory.ts` (add envVars support)
- `src/tools/sandbox/executor.ts` (API-specific patterns)
- `src/agent/orion.ts` (prompt patterns for API code gen)
