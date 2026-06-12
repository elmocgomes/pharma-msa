CREATE TABLE IF NOT EXISTS agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  prompt_type text NOT NULL,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES agent_prompts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content text NOT NULL,
  changed_by text,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_agent_prompts_active ON agent_prompts(agent_name, prompt_type) WHERE is_active = true;
CREATE INDEX idx_prompt_versions_prompt ON prompt_versions(prompt_id);
