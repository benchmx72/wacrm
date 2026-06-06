-- ============================================================
-- Conversation AI handoff history
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_last_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_last_resolved_by UUID;

CREATE TABLE IF NOT EXISTS conversation_ai_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('paused', 'resumed')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_ai_events_conversation
  ON conversation_ai_events(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_ai_events_user
  ON conversation_ai_events(user_id, created_at DESC);

ALTER TABLE conversation_ai_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account users can manage conversation AI events"
  ON conversation_ai_events;

CREATE POLICY "Account users can manage conversation AI events"
  ON conversation_ai_events
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

COMMENT ON TABLE conversation_ai_events IS
  'Audit trail for AI-to-human handoffs and their resolution.';
