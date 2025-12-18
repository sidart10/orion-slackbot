# Story 4.4: External API Calls via Code

Status: ready-for-dev

## Story

As a **user**,
I want generated code to call external APIs,
So that Orion can connect to any system with an API.

## Acceptance Criteria

1. **Given** code is executing in the sandbox, **When** the code makes HTTP requests, **Then** external API calls are allowed (FR21)

2. **Given** API calls are made, **When** responses are received, **Then** API responses are captured and returned

3. **Given** network calls occur, **When** debugging is needed, **Then** network calls are logged for debugging

4. **Given** API access is needed, **When** the agent generates code, **Then** the agent can provide API documentation to guide code generation

5. **Given** authentication is needed, **When** code runs, **Then** authentication is handled via environment variables in sandbox

## Tasks / Subtasks

- [ ] **Task 1: Enable Network Access** (AC: #1)
  - [ ] Configure sandbox for outbound HTTP
  - [ ] Allow HTTPS connections
  - [ ] Handle connection errors

- [ ] **Task 2: Capture API Responses** (AC: #2)
  - [ ] Parse response data
  - [ ] Handle JSON responses
  - [ ] Handle error responses

- [ ] **Task 3: Log Network Activity** (AC: #3)
  - [ ] Log outbound requests
  - [ ] Log response status
  - [ ] Track request duration

- [ ] **Task 4: Provide API Documentation** (AC: #4)
  - [ ] Include API docs in context
  - [ ] Guide code structure
  - [ ] Suggest authentication patterns

- [ ] **Task 5: Handle Authentication** (AC: #5)
  - [ ] Pass env vars to sandbox
  - [ ] Support API keys
  - [ ] Support OAuth tokens

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Generate code with API call
  - [ ] Verify API response captured
  - [ ] Check network logs
  - [ ] Test authentication

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR21 | prd.md | External API calls via code |

### API Call Pattern in Generated Code

```python
# Python example for API calls
import requests
import os

# Authentication from environment
api_key = os.environ.get('API_KEY')

response = requests.get(
    'https://api.example.com/data',
    headers={'Authorization': f'Bearer {api_key}'}
)

result = response.json()
print(result)
```

### References

- [Source: _bmad-output/epics.md#Story 4.4] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Allow outbound HTTP for API flexibility
- Log all network activity for debugging
- Never expose API keys in code or logs

### File List

Files to modify:
- `src/tools/sandbox/config.ts` (network settings)
- `src/tools/sandbox/executor.ts` (env vars)

