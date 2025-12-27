display_information:
  name: orion
  description: ai assistant
  background_color: "#000000"
features:
  bot_user:
    display_name: orion
    always_online: true
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
settings:
  event_subscriptions:
    bot_events:
      - app_mention
      - assistant_thread_started
      - assistant_thread_context_changed
      - message.channels
      - message.groups
      - message.im
      - message.mpim
  interactivity:
    is_enabled: true
  org_deploy_enabled: false
  socket_mode_enabled: true
  token_rotation_enabled: false
