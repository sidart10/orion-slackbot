# Debug Report: Orion Bot Not Working in DMs (Personal and Group)
Generated: 2026-01-21

## Symptom
Orion Slack bot only works in channels but NOT in:
- Personal DMs (1:1 with the bot)
- Group DMs (multi-person DMs including the bot)

## Investigation Steps

1. Reviewed Slack app manifest configuration
2. Analyzed event handler code (`user-message.ts`, `thread-started.ts`)
3. Checked event subscriptions and OAuth scopes
4. Researched Slack Assistant class behavior and requirements
5. Investigated App Home / Messages Tab configuration

## Evidence

### Finding 1: Missing Manifest Feature Configuration
- **Location:** `docs/orion-slack-manifest.md`
- **Observation:** The manifest is missing the `features.app_home` and `features.assistant_view` sections
- **Relevance:** These are required for the Assistant class to work with DMs

Current manifest `features` section:
```yaml
features:
  bot_user:
    display_name: orion
    always_online: true
```

Missing configuration:
```yaml
features:
  bot_user:
    display_name: orion
    always_online: true
  app_home:
    messages_tab_enabled: true
  assistant_view:
    assistant_description: "Orion AI assistant"
    suggested_prompts:
      - title: "Get help"
        message: "What can you help me with?"
```

### Finding 2: Missing `im:write` OAuth Scope (Bot)
- **Location:** `docs/orion-slack-manifest.md`, lines 25-44 (bot scopes)
- **Observation:** The manifest has `im:read` and `im:history` but is missing `im:write`
- **Relevance:** The `im:write` scope is needed to "start direct messages with people" per [Slack documentation](https://api.slack.com/scopes/im:write)

Current bot scopes include:
- `im:history` (read history)
- `im:read` (read channel info)

Missing scope:
- `im:write` (open/start DM conversations)

### Finding 3: Missing `mpim:write` OAuth Scope (Bot)
- **Location:** `docs/orion-slack-manifest.md`, lines 25-44 (bot scopes)
- **Observation:** The manifest has `mpim:history` but is missing `mpim:write`
- **Relevance:** For group DMs (MPIMs), the bot needs write permission to respond

### Finding 4: App Home Messages Tab Not Enabled
- **Location:** Slack App Settings (UI configuration, not in manifest)
- **Observation:** The "Agents & AI Apps" feature and Messages Tab must be enabled in the Slack app settings
- **Relevance:** Per [Slack documentation](https://docs.slack.dev/surfaces/app-home/), the Messages Tab must be enabled: "Go to your app settings and find App Home. Enable 'Allow users to send Slash commands and messages to the bot' (opens the Messages Tab)."

### Finding 5: Code Correctly Handles DM Channel IDs
- **Location:** `src/slack/handlers/user-message.ts:126`
- **Observation:** Code uses `channelId.startsWith('D')` to detect personal DMs
- **Relevance:** This is correct. Personal DM channel IDs start with 'D', group DMs (MPIMs) start with 'G'

```typescript
const isDm = channelId.startsWith('D');
```

The code logic is correct - the issue is configuration, not code.

## Root Cause Analysis

**Primary Cause: Missing Slack App Configuration**

The Orion bot is not receiving DM events because:

1. **Missing manifest features** - The `features.app_home.messages_tab_enabled` is not set to `true`
2. **Missing OAuth scopes** - `im:write` and `mpim:write` are not included in the bot token scopes
3. **Agents & AI Apps feature** - May not be enabled in the Slack app settings UI

The Slack Assistant class requires these features to be enabled for DM interactions to work. Without them, Slack does not route `message.im` and `message.mpim` events to the app.

**Confidence:** High

**Alternative hypotheses:**
1. The Slack app's "Agents & AI Apps" feature toggle is disabled in the app settings UI
2. The app hasn't been reinstalled after adding new scopes (OAuth scopes require reinstall to take effect)

## Recommended Fix

### Step 1: Update the Manifest (docs/orion-slack-manifest.md)

Add the following sections:

**Add missing OAuth scopes (bot section):**
```yaml
oauth_config:
  scopes:
    bot:
      # ... existing scopes ...
      - im:write       # NEW: Required to respond in DMs
      - mpim:write     # NEW: Required to respond in group DMs
```

**Add features configuration:**
```yaml
features:
  bot_user:
    display_name: orion
    always_online: true
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true        # NEW: Enable Messages Tab for DMs
    messages_tab_read_only_enabled: false
  assistant_view:                     # NEW: Enable AI assistant features
    assistant_description: "Orion is your AI assistant. Ask me anything!"
    suggested_prompts:
      - title: "What can you help with?"
        message: "What can you help me with?"
      - title: "Summarize this thread"
        message: "Summarize this thread for me"
```

### Step 2: Enable Agents & AI Apps in Slack App Settings

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Select the Orion app
3. Navigate to **Features > Agents & AI Apps** in the left sidebar
4. Toggle ON the "Agents & AI Apps" feature
5. Fill in the assistant description and suggested prompts
6. Click **Save**

### Step 3: Reinstall the App

After updating scopes, the app must be reinstalled to pick up the new permissions:

1. Go to **Install App** in the Slack app settings
2. Click **Reinstall to Workspace**
3. Authorize the new scopes

### Step 4: Test

After the above changes:
1. Open a personal DM with the Orion bot
2. Send a message
3. Verify the bot responds
4. Test in a group DM (add Orion to a multi-person DM)
5. Send a message and verify response

## Files to Modify

| File | Change |
|------|--------|
| `docs/orion-slack-manifest.md` | Add `im:write`, `mpim:write` scopes and `features.app_home`, `features.assistant_view` sections |

## Prevention

1. **Document Slack feature requirements** - Add a setup guide documenting all required Slack app settings
2. **Validate manifest completeness** - Add a checklist for required scopes and features when setting up new Slack apps
3. **Test all interaction modes** - Include DM testing in the QA process, not just channel interactions

## References

- [Slack App Home Documentation](https://docs.slack.dev/surfaces/app-home/)
- [Slack AI Apps Documentation](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/)
- [im:write Scope Reference](https://api.slack.com/scopes/im:write)
- [Slack App Manifest Reference](https://docs.slack.dev/reference/app-manifest/)
