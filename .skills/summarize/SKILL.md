---
name: summarize
description: Summarize Slack conversations, threads, channels, group DMs, and direct messages
---

# Conversation Summarization Skill

When users ask to summarize or catch up on conversations, use this skill to analyze message history and provide structured summaries.

## Tool: summarize_conversation

This is a **single tool** with smart context-aware routing. It automatically detects:
- Thread URLs in the request
- Whether the user is in a thread asking "this" / "tldr"
- Channel/conversation summarization with time ranges

**DO NOT USE THIS TOOL FOR:**
- "Find me the thread about X" — this tool cannot search for threads
- "Where did we discuss X?" — this tool cannot search for topics
- Searching or finding specific messages

## When to Activate

Trigger this skill when the user:
- Says "summarize", "tldr", "catch me up", "what happened"
- Mentions a specific channel, thread, or conversation to summarize
- Asks about past discussions or decisions in a conversation
- Pastes a Slack thread URL

## Supported Conversation Types

| Type | Detection | API |
|------|-----------|-----|
| Current Thread | User says "summarize this" while in a thread | \`conversations.replies\` |
| Thread URL | User pastes a Slack thread link | \`conversations.replies\` |
| Current Channel | User says "summarize this channel" | \`conversations.history\` |
| Specific Channel | User mentions \`#channel-name\` | \`conversations.history\` |
| Group DM (MPIM) | User in a group DM context | \`conversations.history\` |
| Direct Message | User in a 1:1 DM context | \`conversations.history\` |

## Time Range Parsing

Parse natural language time expressions:

| User Says | Interpretation |
|-----------|----------------|
| "past week", "last 7 days", "this week" | 7 days |
| "past month", "last 30 days", "this month" | 30 days |
| "today", "past 24 hours" | 1 day |
| "yesterday" | Previous calendar day |
| "past N days" | N days dynamically |
| (no time specified) | Default to 7 days |

## Context-Aware Routing

1. **Check for Thread URL** — If the user message contains a Slack URL like \`https://workspace.slack.com/archives/C123/p1234567890\`, extract channel and timestamp, summarize that thread.

2. **Check if User is in Thread** — If \`thread_ts\` is present and user says "this", "here", "summarize", or "tldr", summarize the current thread.

3. **Otherwise** — Summarize the channel/conversation with the parsed time range.

## Summary Output Format

Use Slack mrkdwn format (NOT markdown):

\`\`\`
🔍 Summarized *42* messages from #channel (past 7 days)

*Summary*
[2-3 sentence overview of what was discussed]

*Key Decisions*
• [Decision 1]
• [Decision 2]

*Action Items*
• @person: [Task description]

*Topics Discussed*
• [Topic 1]: [Brief description]

*Unresolved Questions*
• [Question 1]

*Active Participants*
[Name 1], [Name 2], [Name 3]

_Need more detail on a specific topic? Just ask!_
\`\`\`

**Formatting Rules:**
- Use \`*bold*\` (NOT \`**bold**\`)
- Use \`_italic_\` (NOT \`*italic*\`)
- Use \`•\` for bullet points
- Omit empty sections entirely
- Include truncation warning if >500 messages: \`⚠️ _Showing summary of first 500 messages — conversation had more._\`

## Error Handling

Handle errors gracefully with user-friendly messages:

| Error | User Message |
|-------|--------------|
| \`channel_not_found\` | "I couldn't find that channel. It may have been deleted." |
| \`not_in_channel\` | "I'm not a member of that channel. Please invite me with \`/invite @Orion\`." |
| \`missing_scope\` | "I don't have permission to read that conversation. An admin may need to update my permissions." |
| No messages found | "No messages found in this conversation for the past 7 days." |

## Rate Limiting

- Delay 100ms between pagination requests
- Cap at 500 messages maximum
- Limit permalink fetching: 25 for threads, 15 for channels
- Inform user if conversation was truncated

## Example Interactions

**User:** "Summarize #sales-enablement-hub for the past week"
→ Fetch channel history for 7 days, generate structured summary

**User:** "What happened in this chat today?"
→ Summarize current conversation for past 24 hours

**User:** "Summarize this thread"
→ Detect thread context, use \`conversations.replies\`

**User:** (pastes thread URL)
→ Parse URL, extract channel + timestamp, summarize that thread

**User:** "tldr"
→ If in thread, summarize thread; if in channel, summarize last 7 days




