-- ============================================================
-- AI agents foundation
--
-- Adds a small, channel-agnostic agent layer that can be tested from
-- an internal playground before WhatsApp/Telegram webhooks are wired in.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Rod SDR',
  role TEXT NOT NULL DEFAULT 'support_sdr'
    CHECK (role IN ('support_sdr', 'support', 'sdr', 'knowledge_trainer')),
  model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.40
    CHECK (temperature >= 0 AND temperature <= 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  system_prompt TEXT NOT NULL,
  knowledge_mode TEXT NOT NULL DEFAULT 'suggestions'
    CHECK (knowledge_mode IN ('off', 'suggestions', 'approved_only')),
  openai_vector_store_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_user_id ON ai_agents(user_id);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own ai agents" ON ai_agents;
CREATE POLICY "Users manage own ai agents" ON ai_agents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_agent_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  title TEXT,
  channel TEXT NOT NULL DEFAULT 'playground'
    CHECK (channel IN ('playground', 'whatsapp', 'telegram', 'api')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'closed')),
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_user_time
  ON ai_agent_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_agent
  ON ai_agent_sessions(agent_id);

ALTER TABLE ai_agent_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own ai sessions" ON ai_agent_sessions;
CREATE POLICY "Users manage own ai sessions" ON ai_agent_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_agent_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES ai_agent_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_messages_session_time
  ON ai_agent_messages(session_id, created_at ASC);

ALTER TABLE ai_agent_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own ai messages" ON ai_agent_messages;
CREATE POLICY "Users manage own ai messages" ON ai_agent_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_knowledge_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  session_id UUID REFERENCES ai_agent_sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES ai_agent_messages(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_suggestions_user_status
  ON ai_knowledge_suggestions(user_id, status, created_at DESC);

ALTER TABLE ai_knowledge_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own ai knowledge suggestions" ON ai_knowledge_suggestions;
CREATE POLICY "Users manage own ai knowledge suggestions" ON ai_knowledge_suggestions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_tool_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  session_id UUID REFERENCES ai_agent_sessions(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_logs_session_time
  ON ai_tool_logs(session_id, created_at DESC);

ALTER TABLE ai_tool_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own ai tool logs" ON ai_tool_logs;
CREATE POLICY "Users see own ai tool logs" ON ai_tool_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON ai_agents;
DROP TRIGGER IF EXISTS set_updated_at ON ai_agent_sessions;
DROP TRIGGER IF EXISTS set_updated_at ON ai_knowledge_suggestions;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_knowledge_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
