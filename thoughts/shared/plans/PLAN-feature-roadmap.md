# Feature Roadmap Plan: Samba Slack Agent

Generated: 2026-02-02
Status: BRAINSTORM PLAN (not implementation)

## Goal

Create a structured approach to feature discovery, prioritization, and roadmap planning for the Samba Slack agent. With 8 epics complete and core functionality working, the focus shifts from building infrastructure to expanding capabilities based on user needs.

---

## Current State Analysis

### Completed Infrastructure (Epics 1-8)

| Capability | Status | Notes |
|------------|--------|-------|
| Agent Loop | Complete | Gather -> Act -> Verify pattern |
| MCP Tool Connectivity | Complete | Generic HTTP streamable client |
| Streaming Responses | Complete | Real-time Slack updates |
| Persistent Memory | Complete | GCS backend, 3 scopes |
| Skills Framework | Complete | 13 skills loaded |
| DM + Group DM Support | Complete | Thread context preserved |
| Citations + References | Complete | Source attribution |
| Prompt Caching | Complete | 90% token savings |
| File Ingestion | Complete | PDF, images, CSV, etc. |

### Current MCP Tools

| Server | Capability | Use Cases |
|--------|------------|-----------|
| **audience-manager** | TV viewership, sports audiences, demographics | Programmatic consultants, research |
| **msci-reports** | Business intelligence, analytics | Data analysis, reporting |
| **exa** | Web search, code context | General research |
| **rube** (Composio) | 500+ app integrations | Slack, GitHub, Notion, Google, etc. |
| **genmedia-imagen** | Image generation (Imagen 4 Ultra) | Creative, presentations |
| **genmedia-veo** | Video generation (Veo 3.1) | Creative, marketing |

### Current Skills (13 total)

| Skill | Purpose |
|-------|---------|
| **pdf** | PDF manipulation, extraction, forms |
| **xlsx** | Excel file operations |
| **docx** | Word document operations |
| **samba-slides** | Branded PowerPoint generation |
| **summarize** | Conversation/thread summarization |
| **d3js-visualization** | Data visualizations |
| **algorithmic-art** | Generative art |
| **frontend-design** | Web frontend prototypes |
| **web-artifacts-builder** | Interactive web artifacts |
| **webapp-testing** | Test web applications |
| **mcp-builder** | Create new MCP servers |
| **skill-creator** | Create new skills |
| **example** | Template skill |

---

## User Pain Points (Priority Order)

Based on user input, these are the areas needing attention:

### 1. Department-Specific Workflows
**Problem:** Generic assistant doesn't know team-specific processes
**Examples:**
- Talent team: hiring workflows, interview scheduling
- Sales: CRM updates, deal tracking
- Engineering: code review, deployment
- Marketing: campaign management, asset requests

### 2. Proactive Capabilities
**Problem:** Samba only responds to direct requests
**Desired:**
- Scheduled reports (daily/weekly summaries)
- Alerts on metrics changes
- Monitoring dashboards
- Reminder systems

### 3. Better Tool Guidance
**Problem:** Users don't know what Samba can do
**Current:** Generic suggested prompts
**Desired:**
- Context-aware capability discovery
- Tool recommendations based on task
- Better onboarding for new users

### 4. Document Handling
**Problem:** Need deeper knowledge integration
**Current:** File upload + read
**Desired:**
- Knowledge base search (Confluence, Google Drive)
- PDF analysis at scale
- Document comparison
- Template generation

---

## Feature Discovery Process

### Phase 1: Department Interviews (2-3 weeks)

**Objective:** Understand specific workflows per team

**Process:**
```
1. Identify department champions (1-2 per team)
2. Schedule 30-min discovery calls
3. Ask:
   - "What takes too long in your daily work?"
   - "What information do you frequently search for?"
   - "What repetitive tasks could be automated?"
   - "What tools do you wish talked to each other?"
4. Document pain points and desired outcomes
5. Map to existing capabilities or new features
```

**Departments to Cover:**
| Department | Champion | Key Workflows |
|------------|----------|---------------|
| Programmatic (Consultants) | TBD | Audience research, activation IDs |
| Sales | TBD | Prospect research, CRM integration |
| Talent/HR | TBD | Hiring pipeline, candidate comms |
| Engineering | TBD | Code review, deployment, debugging |
| Marketing | TBD | Campaign tracking, asset creation |
| Finance | TBD | Reporting, budget tracking |
| Product | TBD | Roadmap updates, spec writing |

**Interview Template:**
```markdown
## Department: [Name]
Date: [Date]
Champion: [Name]

### Current Pain Points
1. [Pain point] - Time spent: [X hours/week]
2. ...

### Information Searches (Frequent)
1. [What they search for] - Current source: [Where]
2. ...

### Desired Automations
1. [Task] - Frequency: [Daily/Weekly/Ad-hoc]
2. ...

### Tool Integrations Wanted
1. [Tool A] <-> [Tool B] - Reason: [Why]
2. ...

### Suggested Features
1. [Feature idea from champion]
2. ...
```

### Phase 2: Usage Analysis (Ongoing)

**Objective:** Learn from actual usage patterns

**Metrics to Track (via Langfuse):**
```
- Most used tools (by department, by user)
- Failed queries (what users asked that Samba couldn't do)
- Follow-up rate (indicates incomplete first response)
- Tool chains (what sequences work well)
- Feedback scores (thumbs up/down by feature)
```

**Analysis Queries:**
```sql
-- Most requested but missing capabilities
SELECT query_pattern, COUNT(*) as frequency
FROM interactions
WHERE tool_calls = 0 OR feedback = 'negative'
GROUP BY query_pattern
ORDER BY frequency DESC;

-- Successful tool combinations
SELECT tool_chain, success_rate, AVG(satisfaction)
FROM interactions
WHERE tool_calls > 1
GROUP BY tool_chain
ORDER BY success_rate DESC;
```

### Phase 3: Feature Request Intake (Permanent)

**Objective:** Continuous feature collection

**Intake Channels:**
1. **Slack command:** `@samba feature-request [description]`
2. **Weekly digest:** Aggregate requests, dedupe, categorize
3. **Champion reviews:** Monthly check-ins with department leads

**Request Template:**
```yaml
request_id: FR-XXX
submitter: [Slack user ID]
department: [Department]
date: [Date]
title: "[Short title]"
description: |
  [Detailed description of need]
use_case: |
  [Specific scenario when this would help]
frequency: daily|weekly|monthly|ad-hoc
impact_estimate: hours_saved_per_week
related_tools: [List of tools/systems involved]
status: new|under_review|planned|in_progress|done|wont_do
```

---

## Prioritization Framework

### ICE Scoring (Impact, Confidence, Effort)

| Factor | Weight | Scoring |
|--------|--------|---------|
| **Impact** | 40% | 1-10: How many users/how much time saved |
| **Confidence** | 30% | 1-10: How sure are we this works |
| **Effort** | 30% | 1-10 inverted: Lower effort = higher score |

**Score = (Impact * 0.4) + (Confidence * 0.3) + ((10 - Effort) * 0.3)**

### Categorization Matrix

```
                    LOW EFFORT          HIGH EFFORT
                    ─────────────────────────────────
HIGH IMPACT     │   QUICK WINS      │  STRATEGIC    │
                │   (Do First)      │  (Plan Well)  │
                ├───────────────────┼───────────────┤
LOW IMPACT      │   FILL-INS        │  AVOID        │
                │   (When Time)     │  (Say No)     │
                ─────────────────────────────────────
```

### Dependency Analysis

Before prioritizing, map dependencies:

```
[Feature] ──requires──> [Infrastructure]
                        [MCP Server]
                        [Skill]
                        [Third-party API]
                        [Data Access]
```

**Example:**
```
"Automated hiring pipeline reports" ──requires──>
  ├── Lever MCP Server (needs building)
  ├── Scheduled jobs infrastructure (needs building)
  └── Talent team data access (needs approval)
```

---

## Feature Categories

### Category 1: Department Workflows

**Pattern:** Domain-specific knowledge + workflow automation

| Feature | Department | Dependencies | Estimate |
|---------|------------|--------------|----------|
| Programmatic Playbooks | Consultants | audience-manager data models | 1-2 weeks |
| Sales Prospect Builder | Sales | CRM MCP (Salesforce/HubSpot) | 2-3 weeks |
| Hiring Pipeline Tracker | Talent | Lever MCP (user deferred) | 3-4 weeks |
| Campaign Performance | Marketing | Ad platform MCPs | 2-3 weeks |
| Sprint Status Reporter | Engineering | Jira/Linear MCP | 1-2 weeks |

**Implementation Pattern:**
```
1. Create department-specific system prompt section
2. Build workflow templates (SKILL.md or Commands)
3. Connect relevant MCP tools
4. Add suggested prompts for department
5. Train champions, iterate
```

### Category 2: Proactive Capabilities

**Pattern:** Scheduled triggers + action execution

| Feature | Trigger | Action | Dependencies |
|---------|---------|--------|--------------|
| Daily Standups | 9am daily | Summarize yesterday's threads | Scheduler infra |
| Metric Alerts | Threshold cross | DM relevant users | Monitoring hooks |
| Weekly Reports | Monday 8am | Compile department updates | Report templates |
| Deadline Reminders | Calendar events | Thread reminders | Calendar MCP |
| Anomaly Detection | Data change | Alert + analysis | ML pipeline |

**Infrastructure Needed:**
```typescript
// New: src/scheduler/
├── cron.ts          // Cloud Scheduler integration
├── triggers.ts      // Event-based triggers
├── jobs/
│   ├── daily-summary.ts
│   ├── metric-alert.ts
│   └── weekly-report.ts
└── notifications/
    ├── dm.ts        // Direct message
    └── channel.ts   // Channel post
```

### Category 3: Tool Guidance

**Pattern:** Better discoverability + contextual help

| Feature | Type | Effort |
|---------|------|--------|
| Capability Explorer | Interactive skill browser | Low |
| Contextual Prompts | Smart suggestions based on channel | Medium |
| Tool Recommender | "You might also try..." | Medium |
| Onboarding Flow | New user tutorial | Low |
| Help Command | `/samba help [topic]` | Low |

**Quick Wins:**
```
1. Enhance suggested prompts based on:
   - Channel context (engineering channel = code-related prompts)
   - User history (what they've used before)
   - Available skills (rotate through capabilities)

2. Add help system:
   "@samba help" → List capabilities
   "@samba help pdf" → PDF skill details
   "@samba help search" → Search tool options
```

### Category 4: Document Handling

**Pattern:** Knowledge integration + analysis

| Feature | Source | Dependencies |
|---------|--------|--------------|
| Confluence Search | Atlassian API | Confluence MCP |
| Google Drive Search | Google API | Drive MCP |
| PDF Batch Analysis | Uploaded files | pdf skill + parallel |
| Document Comparison | Two files | Diff algorithm |
| Template Library | Pre-built formats | Template storage |

**Architecture:**
```
User Request
    │
    v
┌─────────────────┐
│ Document Router │ ── Decides: upload vs. search vs. generate
└────────┬────────┘
         │
    ┌────┼────┬────────┐
    v    v    v        v
 Upload  Search  Analyze  Generate
 (Files  (MCP    (Skills) (Skills)
  API)   tools)
```

---

## Near-Term Opportunities (0-4 weeks)

### Quick Wins (Low Effort, High Impact)

| # | Feature | Effort | Impact | Notes |
|---|---------|--------|--------|-------|
| 1 | Enhanced Help System | 2 days | High | `/samba help`, `/samba capabilities` |
| 2 | Channel-Aware Prompts | 3 days | Medium | Detect channel topic, adjust prompts |
| 3 | User Onboarding DM | 2 days | Medium | Welcome new users, show capabilities |
| 4 | Feedback Analysis | 1 day | Medium | Dashboard of thumbs up/down |
| 5 | Tool Usage Guide | 1 day | Medium | Markdown doc of all capabilities |

### Priority Implementations

| # | Feature | Effort | Impact | Dependencies |
|---|---------|--------|--------|--------------|
| 1 | Programmatic Playbooks | 1 week | High | None (uses existing tools) |
| 2 | Composio Tool Router | 2 weeks | High | Rube MCP already connected |
| 3 | Confluence Search MCP | 2 weeks | Medium | Atlassian API access |
| 4 | Sprint Reporter | 1 week | Medium | Jira/Linear access |

---

## Medium-Term Features (1-3 months)

### Infrastructure Builds

| # | Feature | Effort | Enables |
|---|---------|--------|---------|
| 1 | Scheduler Service | 3 weeks | Proactive reports, alerts |
| 2 | Knowledge Base Connector | 2 weeks | Confluence, Drive, Notion |
| 3 | Webhook Listener | 2 weeks | Event-driven workflows |
| 4 | Template Engine | 1 week | Reusable report formats |

### Department Features

| # | Feature | Department | Effort |
|---|---------|------------|--------|
| 1 | Deal Research Assistant | Sales | 2 weeks |
| 2 | Campaign Analyzer | Marketing | 2 weeks |
| 3 | Code Review Helper | Engineering | 2 weeks |
| 4 | Budget Tracker | Finance | 3 weeks |

---

## Long-Term Vision (3-12 months)

### Platform Evolution

```
Phase 1 (Current): Reactive Assistant
  User asks -> Samba responds

Phase 2 (3-6 months): Proactive Partner
  Events trigger -> Samba alerts/acts
  Scheduled jobs -> Samba reports

Phase 3 (6-12 months): Autonomous Agent
  Goals set -> Samba plans and executes
  Multi-step workflows -> Samba orchestrates
  Learning from feedback -> Samba improves
```

### Capabilities Roadmap

```
Q1 2026:
├── Enhanced tool guidance
├── Department playbooks (2-3 teams)
├── Basic scheduling (daily reports)
└── Knowledge base search (Confluence)

Q2 2026:
├── Full proactive capabilities
├── All department workflows
├── Webhook-driven automation
└── Template library

Q3 2026:
├── Autonomous task execution
├── Cross-team collaboration
├── Advanced analytics
└── Custom MCP builder (self-serve)

Q4 2026:
├── ML-powered recommendations
├── Workflow optimization
├── Enterprise integrations
└── Multi-model support
```

---

## Ongoing Feature Intake Process

### Weekly Cadence

| Day | Activity |
|-----|----------|
| Monday | Review new feature requests |
| Tuesday | Triage and score (ICE) |
| Wednesday | Engineering feasibility review |
| Thursday | Update roadmap |
| Friday | Communicate priorities |

### Roles

| Role | Responsibility |
|------|----------------|
| **Product Owner** | Final prioritization decisions |
| **Department Champions** | Surface team needs, validate solutions |
| **Engineering Lead** | Feasibility assessment, effort estimates |
| **Platform Team** | Infrastructure, MCP development |

### Review Meetings

**Monthly Roadmap Review:**
- Review completed features
- Analyze usage/impact
- Reprioritize backlog
- Plan next month

**Quarterly Strategy Session:**
- Assess long-term vision progress
- Adjust based on company priorities
- Plan major initiatives
- Budget/resource allocation

---

## Success Metrics

### Feature Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Adoption Rate | >50% of users try within 2 weeks | Langfuse tracking |
| Satisfaction | >4:1 thumbs up/down | Feedback buttons |
| Time Saved | >30 min/week per feature | User surveys |
| Repeat Usage | >3x/week for power users | Usage analytics |

### Roadmap Health

| Metric | Target | Measurement |
|--------|--------|-------------|
| Feature Velocity | 2-3 features/month | Completed items |
| Backlog Freshness | <30 days since review | Request timestamps |
| Stakeholder Satisfaction | >80% positive | Quarterly survey |
| Technical Debt | <20% of sprint capacity | Engineering tracking |

---

## Appendix: Research Findings

### Best Practices from External Research

1. **Productboard** - AI prioritization models work best with clear value metrics
2. **Gartner AI Roadmap** - Start with quick wins to build momentum
3. **Voltage Control** - Involve stakeholders in discovery phase
4. **Morgan Kotter** - Balance user requests with strategic vision

### Similar Products Reference

| Product | Approach | Lesson |
|---------|----------|--------|
| Slack AI | Native integrations, simple UX | Don't overwhelm with options |
| Glean | Enterprise search first | Knowledge access is foundational |
| Moveworks | IT-focused, then expand | Depth before breadth |
| Jasper | Template-driven creation | Templates reduce friction |

---

## Next Steps

1. **Immediate:** Review this plan with stakeholders
2. **Week 1:** Schedule department champion interviews
3. **Week 2:** Implement quick wins (help system, prompts)
4. **Week 3-4:** First department workflow (Programmatic)
5. **Month 2:** Scheduler infrastructure + proactive features

---

*This is a PLANNING document. Implementation should follow the prioritization framework and be tracked via epics/stories in the standard workflow.*
