-- ============================================================
-- Team-shared CRM data access
-- ============================================================
-- Most CRM tables store data under the account owner's auth user id.
-- Members invited to that account can read/write those rows through
-- current_account_owner_id().

CREATE OR REPLACE FUNCTION public.current_account_owner_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.account_owner_id
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
      LIMIT 1
    ),
    auth.uid()
  )
$$;

ALTER FUNCTION public.current_account_owner_id() OWNER TO postgres;

-- Profiles: members can see the team roster for their account. Direct
-- self-updates remain limited by the trigger that blocks role changes.
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can view account profiles" ON profiles
  FOR SELECT USING (account_owner_id = public.current_account_owner_id());

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Direct owner tables.
DROP POLICY IF EXISTS "Users can manage own contacts" ON contacts;
CREATE POLICY "Account users can manage contacts" ON contacts
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own tags" ON tags;
CREATE POLICY "Account users can manage tags" ON tags
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own custom fields" ON custom_fields;
CREATE POLICY "Account users can manage custom fields" ON custom_fields
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own notes" ON contact_notes;
CREATE POLICY "Account users can manage contact notes" ON contact_notes
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
CREATE POLICY "Account users can manage conversations" ON conversations
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own config" ON whatsapp_config;
CREATE POLICY "Account users can manage whatsapp config" ON whatsapp_config
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own templates" ON message_templates;
CREATE POLICY "Account users can manage message templates" ON message_templates
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own pipelines" ON pipelines;
CREATE POLICY "Account users can manage pipelines" ON pipelines
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own deals" ON deals;
CREATE POLICY "Account users can manage deals" ON deals
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage own broadcasts" ON broadcasts;
CREATE POLICY "Account users can manage broadcasts" ON broadcasts
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users manage own appointments" ON appointments;
CREATE POLICY "Account users can manage appointments" ON appointments
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

-- Child tables inherit access through their parent row.
DROP POLICY IF EXISTS "Users can manage contact tags" ON contact_tags;
CREATE POLICY "Account users can manage contact tags" ON contact_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_tags.contact_id
        AND contacts.user_id = public.current_account_owner_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_tags.contact_id
        AND contacts.user_id = public.current_account_owner_id()
    )
  );

DROP POLICY IF EXISTS "Users can manage custom values" ON contact_custom_values;
CREATE POLICY "Account users can manage custom values" ON contact_custom_values
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_custom_values.contact_id
        AND contacts.user_id = public.current_account_owner_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_custom_values.contact_id
        AND contacts.user_id = public.current_account_owner_id()
    )
  );

DROP POLICY IF EXISTS "Users can manage pipeline stages" ON pipeline_stages;
CREATE POLICY "Account users can manage pipeline stages" ON pipeline_stages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM pipelines
      WHERE pipelines.id = pipeline_stages.pipeline_id
        AND pipelines.user_id = public.current_account_owner_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipelines
      WHERE pipelines.id = pipeline_stages.pipeline_id
        AND pipelines.user_id = public.current_account_owner_id()
    )
  );

DROP POLICY IF EXISTS "Users can view own messages" ON messages;
CREATE POLICY "Account users can manage messages" ON messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = public.current_account_owner_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = public.current_account_owner_id()
    )
  );

DROP POLICY IF EXISTS "Users see reactions on their conversations" ON message_reactions;
DROP POLICY IF EXISTS "Users insert reactions on their conversations" ON message_reactions;
DROP POLICY IF EXISTS "Users delete their own agent reactions" ON message_reactions;
DROP POLICY IF EXISTS "Users update their own agent reactions" ON message_reactions;

CREATE POLICY "Account users can manage message reactions" ON message_reactions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = message_reactions.conversation_id
        AND conversations.user_id = public.current_account_owner_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = message_reactions.conversation_id
        AND conversations.user_id = public.current_account_owner_id()
    )
  );

DROP POLICY IF EXISTS "Users can manage broadcast recipients" ON broadcast_recipients;
CREATE POLICY "Account users can manage broadcast recipients" ON broadcast_recipients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM broadcasts
      WHERE broadcasts.id = broadcast_recipients.broadcast_id
        AND broadcasts.user_id = public.current_account_owner_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM broadcasts
      WHERE broadcasts.id = broadcast_recipients.broadcast_id
        AND broadcasts.user_id = public.current_account_owner_id()
    )
  );

-- Automations.
DROP POLICY IF EXISTS "Users can manage own automations" ON automations;
CREATE POLICY "Account users can manage automations" ON automations
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users can manage steps of own automations" ON automation_steps;
CREATE POLICY "Account users can manage automation steps" ON automation_steps
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = automation_steps.automation_id
        AND automations.user_id = public.current_account_owner_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations
      WHERE automations.id = automation_steps.automation_id
        AND automations.user_id = public.current_account_owner_id()
    )
  );

DROP POLICY IF EXISTS "Users can view own automation logs" ON automation_logs;
CREATE POLICY "Account users can view automation logs" ON automation_logs
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

-- Flows.
DROP POLICY IF EXISTS "Users can manage own flows" ON flows;
CREATE POLICY "Account users can manage flows" ON flows
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users manage nodes on their flows" ON flow_nodes;
CREATE POLICY "Account users can manage flow nodes" ON flow_nodes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM flows
      WHERE flows.id = flow_nodes.flow_id
        AND flows.user_id = public.current_account_owner_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flows
      WHERE flows.id = flow_nodes.flow_id
        AND flows.user_id = public.current_account_owner_id()
    )
  );

DROP POLICY IF EXISTS "Users see own flow runs" ON flow_runs;
CREATE POLICY "Account users can see flow runs" ON flow_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flows
      WHERE flows.id = flow_runs.flow_id
        AND flows.user_id = public.current_account_owner_id()
    )
  );

DROP POLICY IF EXISTS "Users see events on their runs" ON flow_run_events;
CREATE POLICY "Account users can see flow run events" ON flow_run_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flow_runs
      JOIN flows ON flows.id = flow_runs.flow_id
      WHERE flow_runs.id = flow_run_events.flow_run_id
        AND flows.user_id = public.current_account_owner_id()
    )
  );

-- AI agent configuration and playground data. The playground remains
-- visible only to super_admin in the app, but this keeps account-scoped
-- agent configuration shareable for future production agents.
DROP POLICY IF EXISTS "Users manage own ai agents" ON ai_agents;
CREATE POLICY "Account users can manage ai agents" ON ai_agents
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users manage own ai sessions" ON ai_agent_sessions;
CREATE POLICY "Account users can manage ai sessions" ON ai_agent_sessions
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users manage own ai messages" ON ai_agent_messages;
CREATE POLICY "Account users can manage ai messages" ON ai_agent_messages
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users manage own ai knowledge suggestions" ON ai_knowledge_suggestions;
CREATE POLICY "Account users can manage ai knowledge suggestions" ON ai_knowledge_suggestions
  FOR ALL
  USING (user_id = public.current_account_owner_id())
  WITH CHECK (user_id = public.current_account_owner_id());

DROP POLICY IF EXISTS "Users see own ai tool logs" ON ai_tool_logs;
CREATE POLICY "Account users can see ai tool logs" ON ai_tool_logs
  FOR SELECT USING (user_id = public.current_account_owner_id());
