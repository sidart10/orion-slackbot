# Story 4.5: Data Processing via Code

Status: ready-for-dev

## Story

As a **user**,
I want generated code to process and transform data,
So that complex data operations can be performed.

## Acceptance Criteria

1. **Given** data needs to be processed, **When** the agent generates data processing code, **Then** the code can parse, filter, transform, and aggregate data (FR22)

2. **Given** data is provided, **When** parsing is needed, **Then** common data formats are supported (JSON, CSV, etc.)

3. **Given** processing completes, **When** results are returned, **Then** results are formatted for user consumption

4. **Given** large data is processed, **When** size limits are approached, **Then** large data sets are handled appropriately (chunking if needed)

5. **Given** processing completes, **When** the response is generated, **Then** processing results are included in the response

## Tasks / Subtasks

- [ ] **Task 1: Support Common Formats** (AC: #2)
  - [ ] Parse JSON data
  - [ ] Parse CSV data
  - [ ] Handle structured data

- [ ] **Task 2: Data Transformation Patterns** (AC: #1)
  - [ ] Filtering operations
  - [ ] Mapping/transformation
  - [ ] Aggregation (sum, avg, count)

- [ ] **Task 3: Format Results** (AC: #3)
  - [ ] Table formatting for Slack
  - [ ] Summary statistics
  - [ ] Charts/visualizations (future)

- [ ] **Task 4: Handle Large Data** (AC: #4)
  - [ ] Detect large datasets
  - [ ] Implement chunking
  - [ ] Summarize rather than return all

- [ ] **Task 5: Include in Response** (AC: #5)
  - [ ] Format for Slack mrkdwn
  - [ ] Include key insights
  - [ ] Link to full data if needed

- [ ] **Task 6: Verification** (AC: all)
  - [ ] Process sample JSON
  - [ ] Process sample CSV
  - [ ] Test large dataset
  - [ ] Verify formatted output

## Dev Notes

### Architecture Requirements

| Requirement | Source | Description |
|-------------|--------|-------------|
| FR22 | prd.md | Data processing via code |

### Data Processing Example

```python
import json
import csv
from io import StringIO

# Parse JSON
data = json.loads(input_data)

# Filter
filtered = [item for item in data if item['status'] == 'active']

# Aggregate
total = sum(item['value'] for item in filtered)
average = total / len(filtered) if filtered else 0

# Format results
print(f"Total: {total}")
print(f"Average: {average:.2f}")
print(f"Count: {len(filtered)}")
```

### References

- [Source: _bmad-output/epics.md#Story 4.5] — Original story

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

- Python is ideal for data processing
- Use pandas for complex transformations
- Summarize large datasets rather than returning all

### File List

Files to modify:
- `src/tools/sandbox/generator.ts` (data processing templates)

