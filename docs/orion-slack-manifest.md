display_information:
  name: orion
  description: ai assistant
  background_color: "#000000"
features:
  bot_user:
    display_name: orion
    always_online: true
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
oauth_config:
  scopes:
    user:
      - channels:write
      - chat:write
      - files:read
      - files:write
      - groups:read
      - im:read
      - mpim:read
      - reactions:read
      - reactions:write
      - stars:read
      - stars:write
      - users.profile:write
      - users:read
    bot:
      - app_mentions:read
      - channels:history
      - channels:join
      - channels:read
      - chat:write
      - chat:write.public
      - commands
      - groups:history
      - groups:read
      - im:history
      - im:read
      - mpim:history
      - reactions:write
      - users:read
      - users:read.email
      - usergroups:write
      - usergroups:read
      - users.profile:read
      - assistant:write
      - im:write
      - mpim:write
settings:
  event_subscriptions:
    bot_events:
      - app_mention
      - assistant_thread_started
      - assistant_thread_context_changed
      - message.channels
      - message.groups
      - message.im           # DM messages to the bot
      - message.mpim         # Group DM messages with the bot
  interactivity:
    is_enabled: true
  org_deploy_enabled: false
  socket_mode_enabled: true
  token_rotation_enabled: false

# DM and Group DM Support
#
# Orion supports direct messages and group DMs via two parallel paths:
#
# 1. **Slack Assistant API** (app.assistant())
#    - Handles DMs initiated from the "Orion" entry in Slack's Apps sidebar
#    - Uses threadStarted, threadContextChanged, userMessage events
#    - Provides rich Assistant thread UI experience
#
# 2. **Message Handlers** (app.message())
#    - Handles raw message.im and message.mpim events
#    - Responds to direct DMs and group DMs with the bot
#    - Uses same agent infrastructure as channel @mentions
#
# Both paths can coexist - event deduplication prevents double-processing.
#
# Required scopes for DM support:
# - im:read, im:history, im:write (DMs)
# - mpim:history, mpim:write (Group DMs)
#
# Feature flag: ENABLE_DM_SUPPORT=true (default)
# Set to "false" to disable DM handlers if issues arise.
