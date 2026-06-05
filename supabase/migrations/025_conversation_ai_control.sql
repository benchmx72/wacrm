alter table conversations
  add column if not exists ai_paused boolean not null default false,
  add column if not exists ai_paused_at timestamptz,
  add column if not exists ai_paused_by uuid,
  add column if not exists ai_pause_reason text;

create index if not exists idx_conversations_ai_paused
  on conversations(user_id, ai_paused)
  where ai_paused = true;

comment on column conversations.ai_paused is
  'When true, channel webhooks should not trigger the AI agent for this conversation.';
