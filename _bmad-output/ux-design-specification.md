---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
lastStep: 14
workflowStatus: complete
completedDate: 2025-12-22
inputDocuments:
  - "_bmad-output/prd.md"
  - "_bmad-output/analysis/product-brief-2025-12-orion-slack-agent-2025-12-17.md"
  - "_bmad-output/epics.md"
  - "_bmad-output/analysis/research/technical-orion-slack-agent-research-2024-12-17.md"
  - "_bmad-output/analysis/brainstorming-session-2025-12-22.md"
workflowType: 'ux-design'
lastStep: 0
project_name: '2025-12 orion-slack-agent'
user_name: 'Sid'
date: '2025-12-22'
---

# UX Design Specification: Orion Slack Agent

**Author:** Sid
**Date:** 2025-12-22

---

## Executive Summary

### Project Vision

Orion transforms Slack into an intelligent execution layer—an agentic AI that *does work*, not just answers questions. Built on a composable architecture with the Anthropic API at its core, Orion implements the agent loop pattern (Gather Context → Take Action → Verify Work), connects to external tools via MCP protocol, spawns parallel subagents for complex tasks, and streams responses in real-time.

**The key differentiator:** No integration ceiling. When pre-built tools don't exist, Orion generates code on-the-fly to solve the problem. Tools, skills, commands, and subagents compose together to solve problems no single integration could handle alone.

### Target Users

| User Archetype | Role | Core Pain Point | What Success Looks Like |
|----------------|------|-----------------|-------------------------|
| **Alex** | Product Manager | Information scattered across systems | Multi-source research synthesized in 90 seconds |
| **Marcus** | Programmatic Consultant | Manual data pulls from multiple platforms | Exact Activation IDs with structured recommendations |
| **Priya** | Account Executive | Time-consuming prospect research | Prospect dossiers with actionable conversation hooks |
| **Jordan** | New Engineer (Day 1) | 200 channels, unfamiliar codebase, no one available | Setup guidance, troubleshooting from Slack history |
| **Sam** | IT Support | 47 tickets, mostly repetitive requests | Self-service deflection, runbook access |

**Shared User Needs:**
- **Speed** — Answers in seconds/minutes, not hours
- **Action** — Orion *does* things, not just tells things
- **Sources** — Trust through transparency and citation

### Key Design Challenges

| Challenge | Why It's Hard | UX Design Implication |
|-----------|---------------|----------------------|
| **1. Expectation Setting** | Users don't know Orion's capabilities | Suggested prompts, progressive discovery |
| **2. Long-Running Tasks** | Research can take 30s-5min | Progress indicators, loading state messaging |
| **3. Verification Transparency** | Agent loop iterates before responding | Show thinking/verifying states without noise |
| **4. Source Trust** | Users need to trust synthesized information | Citation patterns, link formatting |
| **5. Error Recovery** | Tools fail, information not found | Graceful degradation, helpful recovery messages |
| **6. Context Continuity** | Long threads, context compaction | Users shouldn't notice context management |

### Design Opportunities

| Opportunity | Potential Impact |
|-------------|------------------|
| **"Aha" Moment Design** | First-time user realizes Orion *did work* → converts to power user |
| **Progressive Discovery** | Suggested prompts that evolve with user behavior |
| **Structured Output Excellence** | Response formatting that's *scannable* and *actionable* |
| **Confidence Signals** | Visual/textual cues showing Orion verified its work |

---

## Core User Experience

### Defining Experience

The core Orion experience is **conversational task execution**:

```
User sends message → Orion shows thinking → Orion executes work → Orion presents verified result with sources
```

This is fundamentally different from traditional chatbots that just answer questions. Orion *does work*—it researches, synthesizes, files tickets, generates code, and takes action.

**The Critical Interaction:** The wait state between "send" and "receive" determines whether users trust the system. For an agentic system that verifies work and may take 30 seconds to 5 minutes, managing this experience is make-or-break.

### Platform Strategy

| Aspect | Decision | Implication |
|--------|----------|-------------|
| **Platform** | Slack only | Inherit Slack's UX patterns, not fight them |
| **Input** | Keyboard-first (text messages) | Mobile Slack users exist but are secondary |
| **UI Surface** | Split-pane AI view, threads, DMs | No custom screens—design within Slack's constraints |
| **Native Features** | Streaming, suggested prompts, feedback buttons, loading states | This is our *entire* UX toolkit |

**Key Constraint:** UX innovation happens through message content (markdown), Block Kit, and native AI app features—not custom UI elements.

### Platform Capabilities & Constraints

*Verified against [docs.slack.dev/ai/developing-ai-apps](https://docs.slack.dev/ai/developing-ai-apps) — December 2025*

**Available UX Primitives:**

| Capability | API Method | Notes |
|------------|------------|-------|
| Loading states | `assistant.threads.setStatus` | Supports `loading_messages` array for cycling status text |
| Suggested prompts | `assistant.threads.setSuggestedPrompts` | Up to 4 prompts with title + message |
| Thread titles | `assistant.threads.setTitle` | Auto-groups conversations in History tab |
| Text streaming | `chat.startStream` → `appendStream` → `stopStream` | Real-time token display |
| Feedback buttons | `context_actions` + `feedback_buttons` Block Kit | Thumbs up/down with custom actions |
| Thread context | `assistant_thread_started`, `assistant_thread_context_changed` | Automatic context tracking |

**Platform Constraints:**

| Constraint | Impact on UX |
|------------|--------------|
| Paid Slack plan required | AI features need paid plan or Developer Program sandbox |
| No slash commands in threads | Cannot use `/command` in split-pane; use suggested prompts instead |
| Workspace guests excluded | Guests cannot access Orion |
| `chat.update` rate limit | Max once per 3 seconds for long message updates |
| No custom UI elements | All UX via messages, Block Kit, and native AI app features |

### Effortless Interactions

| Interaction | How We Make It Effortless |
|-------------|---------------------------|
| **Starting** | Suggested prompts hint at capabilities without overwhelming |
| **Progress** | Streaming + clear status messages ("Searching 3 sources...") |
| **Trust** | Inline citations, source links, verification signals |
| **Depth** | Responses end with related prompts ("Ask me to...") |
| **Context** | Automatic thread context continuity—no "remind me" needed |

**Automatic Behaviors:**
- Context carried through thread
- Sources cited without asking
- Long responses formatted for scannability
- Error recovery attempted before surfacing failure

### Critical Success Moments

| Moment | Success Looks Like | Failure Looks Like |
|--------|-------------------|-------------------|
| **First Message** | Helpful response, hints at capabilities | Generic response, no personality |
| **First "Aha"** | User sees Orion *do* something | Orion describes but doesn't act |
| **Long Wait** | User sees progress, confident Orion is working | Silence > 5 seconds, anxiety |
| **Error State** | Clear explanation, alternative suggested | Technical dump, dead end |
| **Source Request** | Clickable links with context | Vague "I found this somewhere" |

### Experience Principles

1. **Action Over Information** — Orion *does* things, not just *tells* things
2. **Transparency Builds Trust** — Show the work, cite sources, explain what was checked
3. **Progress Is Peace of Mind** — Never leave users in silence; stream, show status
4. **Recover Gracefully** — When things fail, explain clearly and offer alternatives
5. **Capability Discovery Is Continuous** — Progressive reveal via suggested prompts and hints

---

## Desired Emotional Response

### Primary Emotional Goal

**Empowered Confidence** — Users should feel they have a capable teammate who handles tedious work so they can focus on what matters. Not a tool they operate—a partner who operates *for* them.

> *"I don't need to hunt. I don't need to wait. I asked, and it got done."*

### Supporting Emotions

| Emotion | When It Happens | Why It Matters |
|---------|-----------------|----------------|
| **Relief** | Complex research synthesized in seconds | "I was dreading this, and it's already done" |
| **Trust** | Sources cited, verification visible | "I can confidently share this with my team" |
| **Surprise** (positive) | Orion does more than asked | "It also included..." creates delight |
| **Competence** | User accomplishes goal via Orion | "I look prepared because Orion helped" |

### Emotional Journey

| Stage | Current Reality → Desired State |
|-------|--------------------------------|
| **Discovery** | Skepticism → Curiosity |
| **First Message** | Uncertainty → Anticipation |
| **Waiting** | Anxiety → Confidence |
| **Receiving Result** | Scrutiny → Satisfaction |
| **After Task** | Neutral → Empowerment |
| **Return Visit** | Habit → Reliance ("Let me ask Orion") |

### Micro-Emotions to Design For

| Target Emotion | vs. Avoid | UX Lever |
|----------------|-----------|----------|
| **Confidence** | Confusion | Clear structure, scannable formatting |
| **Trust** | Skepticism | Inline citations, "I verified this" signals |
| **Anticipation** | Anxiety | Streaming + progress messages |
| **Accomplishment** | Frustration | Clear explanation + "try instead" suggestions |
| **Delight** | Mere satisfaction | Proactive help, "I also found..." |

### Emotions to Actively Avoid

| Negative Emotion | What Triggers It | Prevention Strategy |
|------------------|------------------|---------------------|
| **Frustration** | Repeated failures, no path forward | Always offer alternatives |
| **Confusion** | Unclear capabilities | Suggested prompts, clear limits |
| **Distrust** | Hallucinated or unsourced info | Verification signals, citations |
| **Anxiety** | Long silence during processing | Streaming, status updates |
| **Embarrassment** | User shares bad info from Orion | Confidence calibration, source links |

### Emotional Design Principles

1. **Use action-oriented language** — "I did X" not "Here's information about X"
2. **Make verification visible** — "I checked 3 sources" builds trust
3. **Never leave users in silence** — Streaming starts immediately, status cycles
4. **Always offer alternatives on failure** — "I couldn't find X, but I can try Y"
5. **Add occasional proactive suggestions** — Unexpected helpfulness creates delight

---

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

**Perplexity** — Research-first AI with exemplary citation UX:
- Inline citations with numbered references `[1]`, `[2]`
- Source synthesis with clear attribution
- Follow-up question suggestions after each response
- Streaming that maintains formatting structure

**Slack AI** (Official Best Practices from docs.slack.dev) — Native patterns for AI apps:
- Dynamic prompts based on context (channel, user, history)
- Progressive status updates during processing
- References and citations via context blocks
- Graceful error handling with clear messaging
- First-time onboarding, then optimize for repeat use
- Feedback gathering via thumbs up/down buttons

### Transferable UX Patterns

| Pattern | Source | Orion Implementation |
|---------|--------|---------------------|
| **Inline citations** | Perplexity | `[Source Name](url)` in response body |
| **Source context block** | Slack Best Practices | Linked references at end of response |
| **Progressive status** | Both | "Searching..." → "Found 3 sources..." → "Verifying..." |
| **Dynamic prompts** | Slack Best Practices | Personalize by user/channel/history |
| **Feedback buttons** | Slack Best Practices | Thumbs up/down on every substantive response |
| **Follow-up suggestions** | Perplexity | Use `setSuggestedPrompts` after answers |
| **Markdown formatting** | Slack Best Practices | Use Markdown Block for proper rendering |

### Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | What To Do Instead |
|--------------|--------------|-------------------|
| **Static/repetitive prompts** | Reduces trust, feels disconnected | Dynamic prompts based on context |
| **Silent processing** | Causes anxiety during long tasks | Continuous status updates |
| **Generic error messages** | Frustrating, not actionable | Specific error + suggested alternative |
| **Link unfurl spam** | Clutters response visually | Suppress unfurls, use inline links |
| **Standard markdown syntax** | Renders incorrectly in Slack | Use Slack mrkdwn or Markdown Block |
| **No source attribution** | Undermines trust | Always cite sources inline + context block |

### Design Inspiration Strategy

**Adopt Directly:**
- Inline source citations (Perplexity style)
- Context blocks for reference lists (Slack Best Practices)
- Progressive status updates (Both)
- Feedback buttons on responses (Slack Best Practices)
- Suppress link unfurls (Slack Best Practices)

**Adapt for Orion:**
- Perplexity's source panel → Context block at response end
- Perplexity's follow-up questions → `setSuggestedPrompts` after answer
- Slack AI's summarization format → Research synthesis structure

**Explicitly Avoid:**
- Static prompts that never change
- Silent processing states
- Generic "something went wrong" errors
- Cluttered link previews

---

## Design System Foundation

### Design System Choice

**Message Pattern Library** — A structured approach to conversational UX using Slack's native systems (Block Kit, Markdown Block, mrkdwn) combined with custom response templates for consistent, predictable interactions.

Since Orion lives entirely within Slack, our "design system" is the combination of Slack's native UI primitives and our own response pattern templates.

### Foundation Components

| Component | Slack System | Usage |
|-----------|--------------|-------|
| **Structured layouts** | Block Kit | Context blocks, actions, feedback buttons |
| **Rich text** | Markdown Block | Headers, lists, tables, code blocks |
| **Basic formatting** | Slack mrkdwn | Bold, italic, links, mentions |
| **AI features** | Native API | Status, prompts, streaming, thread titles |

### Response Template Patterns

Reusable message structures for consistency:

| Pattern | Structure | Use Case |
|---------|-----------|----------|
| **Research Response** | Status → Synthesis → Sources → Actions | Multi-source research tasks |
| **Error Response** | Clear status → Explanation → Alternative → Recovery | When things fail |
| **Action Confirmation** | Clear status → What was done → Details → Feedback | After executing work |
| **Clarification Request** | Question → Options → Suggested responses | When input is ambiguous |
| **Progress Update** | Current step → Context → Estimated time | Long-running tasks |

### Template Anatomy: Research Response

```
┌─────────────────────────────────────────────────┐
│ 🔍 Searched 3 sources, found relevant info      │  ← Status (streaming)
├─────────────────────────────────────────────────┤
│ ## Summary                                      │
│ [Synthesized findings with **key points**]      │  ← Body (Markdown Block)
│                                                 │
│ Key findings:                                   │
│ • Finding 1 [Source A](url)                     │  ← Inline citations
│ • Finding 2 [Source B](url)                     │
├─────────────────────────────────────────────────┤
│ 📎 Sources: [1] Source A [2] Source B           │  ← Context block
├─────────────────────────────────────────────────┤
│ 👍 👎  Ask me to dig deeper into any finding    │  ← Actions + follow-up
└─────────────────────────────────────────────────┘
```

### Rationale for Selection

| Factor | Decision |
|--------|----------|
| **Platform-native** | Uses Slack's systems; no custom UI needed |
| **Consistent** | Templates ensure predictable response structure |
| **Maintainable** | Update patterns, not components |
| **Fast** | No design/build cycle for UI components |
| **Accessible** | Slack handles accessibility for Block Kit |

---

## Defining Experience

### Core Interaction

> **"Ask Orion, and it *does* the work."**

The defining moment: user realizes Orion executed a task, not just provided information. This is the "aha" that converts skeptics to power users.

**The moment we're designing for:**
*"I asked it to research our competitor's latest campaign, and it came back with a synthesized report, citations, and even suggested next steps. In 90 seconds. I was expecting it to tell me where to look."*

### User Mental Model Shift

| From (User Expectation) | To (Orion Reality) |
|-------------------------|-------------------|
| AI = Fancy Search | AI = Capable Teammate |
| Answers questions | Executes tasks |
| Points to information | Synthesizes and cites |
| "Here's where to find that" | "Here's what I found and verified" |
| "Here's how to do it" | "I did it. Here's the confirmation" |

**Key Insight:** Users won't *expect* Orion to do work until they *see* it happen. First interactions must clearly demonstrate execution.

### Success Criteria

| Criteria | Target |
|----------|--------|
| **"It did something" visible** | Every agentic response shows action taken |
| **Speed to value** | < 90 seconds for simple task completion |
| **Source transparency** | 100% citations for factual claims |
| **Error recovery** | Alternative offered on 100% of errors |
| **Return rate** | 3+ uses in first week indicates adoption |

### Experience Mechanics

**1. Initiation**
- User opens split-pane or DM with Orion
- Suggested prompts hint at capabilities
- Natural language request accepted

**2. Interaction**
- Status immediately visible: "Understanding your request..."
- Status cycles through descriptive phases
- Streaming begins as soon as content ready

**3. Feedback**
- Continuous status updates (never silent > 5s)
- Action confirmations: "I filed ticket #123"
- Source citations build trust
- Verification signals: "I checked 3 sources"

**4. Completion**
- Feedback buttons (👍/👎) on response
- Suggested follow-ups as prompts
- Thread title reflects topic
- Clear distinction: information vs. execution

### Innovation Focus

**Clear distinction between response types:**

| Response Type | User Sees | Language Pattern |
|---------------|-----------|------------------|
| **Information** | Synthesis, citations, sources | "Based on X, here's what I found..." |
| **Execution** | Action confirmation, details | "I did X. Here's the result..." |

Making it obvious when Orion *did work* vs. *provided information* is our core UX innovation.

---

## Visual & Voice Foundation

Since Slack controls actual visual design (fonts, colors, layout), Orion's "visual foundation" is the conversational aesthetic: emoji system, formatting conventions, message structure, and voice/tone.

### Emoji System

| Category | Emoji | Usage |
|----------|-------|-------|
| **Status/Progress** | 🔍 🔄 ⏳ ✅ | Searching, processing, waiting, complete |
| **Results** | 📊 📋 📎 🎯 | Data, summary, sources, key finding |
| **Actions** | ✏️ 📝 🗂️ 🔗 | Edit, create, file, link |
| **Warnings** | ⚠️ ❌ 💡 | Warning, error, tip/alternative |
| **Feedback** | 👍 👎 | Positive/negative rating |

**Usage Rule:** Emoji at *start* of sections for visual scanning, never inline clutter.

### Formatting Hierarchy

| Level | Format | Usage |
|-------|--------|-------|
| **Section headers** | `## Header` | Major response sections |
| **Subsections** | `### Subheader` | Nested content |
| **Key points** | `**Bold**` | Important terms, action items |
| **Lists** | `• Bullet` | Multiple items, findings |
| **Tables** | Markdown tables | Structured comparisons |
| **Code** | `` `inline` `` or blocks | Technical content, IDs |
| **Quotes** | `> Quote` | Source excerpts, emphasis |

### Message Structure Pattern

```
┌─────────────────────────────────────┐
│ ## 🎯 Summary/Answer                │  ← Lead with value
│ [Key finding or action taken]       │
├─────────────────────────────────────┤
│ ### Details                         │  ← Supporting info
│ • Point 1                           │
│ • Point 2 [Source](link)            │
├─────────────────────────────────────┤
│ 📎 Sources: [1] [2] [3]             │  ← Context block
├─────────────────────────────────────┤
│ 👍 👎                               │  ← Feedback
└─────────────────────────────────────┘
```

### Voice & Tone Principles

| Principle | Guideline | Example |
|-----------|-----------|---------|
| **Concise** | Lead with answer, details follow | ✅ "Found 3 relevant sources." |
| **Confident** | State findings directly | ✅ "The campaign launched Dec 1." |
| **Action-oriented** | Emphasize what was done | ✅ "I filed ticket #123." |
| **Transparent** | Acknowledge limits honestly | ✅ "I couldn't access X, but found Y." |
| **Helpful** | Offer next steps | ✅ "Want me to dig deeper into [topic]?" |

### Accessibility Considerations

| Consideration | Implementation |
|---------------|----------------|
| **Screen readers** | Emoji have alt-text in Slack |
| **Cognitive load** | Consistent structure reduces learning curve |
| **Scannability** | Headers + bullets for quick parsing |
| **Link clarity** | Descriptive link text, not "click here" |

---

## Response Patterns

### Core Response Types

Five patterns cover the majority of Orion interactions:

| Pattern | Structure | Use Case |
|---------|-----------|----------|
| **Research Response** | Summary → Details → Sources → Follow-up | Multi-source research, synthesis |
| **Action Confirmation** | Status → What was done → Details → Link | After executing work |
| **Error with Alternative** | Acknowledge → Explain → Offer options | When requests fail |
| **Clarification Request** | Question → Options → Invite specificity | Ambiguous input |
| **Long-Running Progress** | Status cycling → Streaming when ready | Tasks > 10 seconds |

### Pattern 1: Research Response

```
🔍 Searched 3 sources, synthesizing findings...

## [Topic Summary]

**Key Finding:** [One-sentence takeaway]

### Details
• Point 1 [Source 1]
• Point 2 [Source 2]

📎 Sources: [1] Name | [2] Name | [3] Name

👍 👎  Want me to dig deeper into [aspect]?
```

### Pattern 2: Action Confirmation

```
✅ [Action] Completed

## [Title/ID]

**Status:** [Confirmation details]

### Details Captured
• [Key detail 1]
• [Key detail 2]

🔗 [View in System](link)

👍 👎  Need any adjustments?
```

### Pattern 3: Error with Alternative

```
⚠️ Couldn't [Action]

[Clear explanation of why]

### What I Can Do Instead
• 💡 Alternative option 1
• 💡 Alternative option 2

Want to try one of these?
```

### Pattern 4: Clarification Request

```
🤔 I need a bit more context

**[Clarifying question]**

I found a few possibilities:
• Option A — [brief context]
• Option B — [brief context]

Select one, or tell me more?
```

### Design Direction Summary

| Element | Decision |
|---------|----------|
| **Response lead** | Value/answer first, always |
| **Section structure** | Header → Details → Sources → Actions |
| **Emoji usage** | Functional, section-start only |
| **Source handling** | Inline citations + context block |
| **Error pattern** | Acknowledge → Explain → Alternatives |
| **Feedback** | 👍/👎 on all substantive responses |
| **Follow-ups** | Suggested prompts after complex responses |

---

## User Journey Flows

### Journey 1: First Thread (Onboarding)

**Goal:** Convert skeptic to believer in first interaction

```mermaid
flowchart TD
    Start([User opens Orion thread]) --> Prompts[Show suggested prompts]
    Prompts --> UserAsk[User sends message]
    UserAsk --> Processing[Show status: "Looking into this..."]
    Processing --> Execute[Execute with real capability]
    Execute --> Response[Deliver substantive result with sources]
    Response --> Follow[Show follow-up suggestions]
    Follow --> Decision{User continues?}
    Decision -->|Yes| UserAsk
    Decision -->|No| End([Thread dormant])
```

**Critical Moments:**
- Suggested prompts must showcase capability, not be generic
- First response must demonstrate *doing work*, not just answering
- Sources must be cited to build trust immediately

### Journey 2: Research Request

**Goal:** Synthesize multi-source research with full transparency

```mermaid
flowchart TD
    Ask([User asks research question]) --> Status1[Status: "🔍 Searching sources..."]
    Status1 --> Search[Query MCP tools / web]
    Search --> Status2[Status: "📊 Analyzing findings..."]
    Status2 --> Synthesize[Synthesize results]
    Synthesize --> Response[Deliver structured response]
    Response --> Sources[Show source context block]
    Sources --> Feedback[Show 👍 👎 buttons]
    Feedback --> Prompts[Suggest follow-up questions]
    Prompts --> Decision{User continues?}
    Decision -->|Deeper dive| Ask
    Decision -->|Done| End([Satisfied])
```

**Key States:** `Searching` → `Analyzing` → `Response` with cycling status messages. Source block always present for research responses. Follow-up prompts are context-aware.

### Journey 3: Task Execution (MCP Tool)

**Goal:** Execute work and prove it was done

```mermaid
flowchart TD
    Ask([User requests action]) --> Clarify{Need clarification?}
    Clarify -->|Yes| Question[Ask clarifying question]
    Question --> UserResponse[User clarifies]
    UserResponse --> Clarify
    Clarify -->|No| Status1[Status: "🔄 Executing..."]
    Status1 --> Execute[Call MCP tool]
    Execute --> Result{Success?}
    Result -->|Yes| Confirm[Show confirmation + link]
    Result -->|Partial| Partial[Show partial + remaining]
    Result -->|No| Error[Show error + alternatives]
    Confirm --> Feedback[Show 👍 👎]
    Partial --> Retry{Retry?}
    Error --> Alt{Try alternative?}
    Feedback --> End([Complete])
```

**Critical Design:** Always link back to external systems. Partial success better than hiding failures. Alternatives offered proactively.

### Journey 4: Long-Running Task (>30s)

**Goal:** Maintain confidence during extended processing

```mermaid
flowchart TD
    Ask([Complex request]) --> Status1[Status: "🔍 Starting..."]
    Status1 --> Cycle[Status cycles every 3-5s]
    Cycle --> Streaming{Ready to stream?}
    Streaming -->|Yes| Stream[Begin streaming response]
    Streaming -->|No| Cycle
    Stream --> Complete[Show complete response]
    Complete --> Summary[Summary: "Analyzed X sources in Ys"]
    Summary --> Feedback[Show 👍 👎]
    Feedback --> End([Complete])
```

**Key Pattern:** Never static "thinking..." for >5s. Cycling messages maintain progress feeling. Streaming begins when first content ready.

### Journey Patterns

| Pattern | Usage | Implementation |
|---------|-------|----------------|
| **Progressive Status** | All tasks >3s | `setStatus` with cycling messages |
| **Clarify Before Execute** | Ambiguous requests | Question → Options format |
| **Action + Proof** | After executing work | Confirmation + link to system |
| **Error + Alternative** | Any failure state | Never dead-end, always offer path |
| **Follow-up Prompts** | Substantive responses | Context-aware `setSuggestedPrompts` |
| **Feedback Collection** | All meaningful responses | 👍/👎 via Block Kit buttons |

### Flow Optimization Principles

1. **Minimize time-to-value** — Get to useful response as fast as possible
2. **Never leave user hanging** — Status cycling for any wait >3 seconds
3. **Prove, don't claim** — Link to artifacts, cite sources, show receipts
4. **Offer exits gracefully** — Failures always have alternatives
5. **Build context progressively** — Each interaction teaches Orion about user

---

## Implementation Notes

Orion's "component library" is Slack Block Kit + native AI app APIs. No custom UI components needed.

### Key Implementation Details

| Feature | Implementation |
|---------|----------------|
| Response formatting | Follow Response Patterns section; use mrkdwn |
| Progress indicators | `assistant.threads.setStatus({ status: "message" })` |
| Follow-up prompts | `assistant.threads.setSuggestedPrompts({ prompts: [...] })` |
| Thread titles | `assistant.threads.setTitle({ title: "..." })` |
| Streaming | `chat.startStream` → `chat.appendStream` → `chat.stopStream` |
| Feedback buttons | Block Kit actions with `action_id: "feedback_positive"` / `"feedback_negative"` |
| Source citations | Inline `[1]`, `[2]` refs + context block at end |

### Status Message Rotation

For tasks >3 seconds, cycle through contextual status messages:

```typescript
const statusMessages = [
  "🔍 Searching sources...",
  "📊 Analyzing findings...",
  "✍️ Drafting response..."
];
// Rotate every 3-5 seconds until streaming begins
```

### Block Kit Essentials

- **Section blocks** for main content
- **Context blocks** for sources/metadata
- **Actions blocks** for feedback buttons
- **Dividers** sparingly for section breaks

That's it. Block Kit handles the rest.

---

## UX Consistency Patterns

### Behavioral Consistency Rules

| Situation | Consistent Behavior |
|-----------|---------------------|
| Action placement | Feedback buttons at end; follow-ups via `setSuggestedPrompts` |
| Clarification needed | 🤔 + question + 2-4 options + open invite |
| Error occurred | ⚠️ + what failed + why + 💡 alternative |
| Loading <3s | No status shown |
| Loading 3-30s | Single status message |
| Loading >30s | Cycling status messages |
| No results | 🔍 + acknowledge + suggest alternatives |

### Message Structure Consistency

All substantive responses follow:
1. **Lead with value** — Answer/result first
2. **Support with details** — Bulleted specifics
3. **Cite sources** — Inline `[1]` refs + context block
4. **Enable action** — Feedback buttons + follow-ups

### Emoji Consistency

| Context | Emoji | Never Use |
|---------|-------|-----------|
| Searching | 🔍 | 🔎 👀 |
| Processing | 🔄 ⏳ | ⚙️ 🔃 |
| Success | ✅ | ✔️ 👍 (reserve for feedback) |
| Warning | ⚠️ | ❗ 🚨 |
| Error | ❌ | 🚫 ⛔ |
| Tip/Alternative | 💡 | 💭 🤔 (reserve for clarification) |

---

## Accessibility

### Platform Responsibilities

Slack handles responsive design, keyboard navigation, screen reader support, and color contrast through Block Kit. Orion inherits these capabilities automatically.

### Orion's Accessibility Responsibilities

| Responsibility | Implementation |
|----------------|----------------|
| Image alt text | All images include descriptive `alt_text` property |
| Clear language | Avoid jargon; explain acronyms on first use |
| Logical structure | Headers and bullets follow consistent hierarchy |
| Link descriptions | Descriptive text (not "click here") |
| Error clarity | Plain language explaining what went wrong |
| Timeout handling | Graceful handling of slow responses |

### Content Accessibility Checklist

- [ ] Images have descriptive `alt_text`
- [ ] No meaning conveyed by emoji alone (always paired with text)
- [ ] Headers follow logical order
- [ ] Links describe their destination
- [ ] Errors explain what happened in plain language
- [ ] Complex information has text alternative

---


