import { Hono } from 'hono';
import postgres from 'postgres';

export function createMigrateRoutes() {
  const app = new Hono();

  app.post('/run', async (c) => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return c.json({ error: 'DATABASE_URL not set' }, 500);

    const sql = postgres(dbUrl, { max: 1 });

    const results: { migration: string; status: string; error?: string }[] = [];

    // Migration 0008: Product classification
    try {
      await sql.unsafe(`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity integer;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS form text;
        DO $$ BEGIN
          ALTER TABLE products ADD COLUMN product_type text NOT NULL DEFAULT 'reference'
            CHECK (product_type IN ('reference', 'similar', 'generic'));
        EXCEPTION WHEN duplicate_column THEN NULL; END $$;
        DO $$ BEGIN
          ALTER TABLE products ADD COLUMN reference_product_id uuid
            REFERENCES products(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_column THEN NULL; END $$;

        ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS product_type text
          CHECK (product_type IN ('reference', 'similar', 'generic'));
        ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS laboratory text;
        ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS dosage_mentioned text;
        ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS quantity_mentioned integer;
        ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS form_mentioned text;

        CREATE INDEX IF NOT EXISTS idx_products_reference ON products(reference_product_id)
          WHERE reference_product_id IS NOT NULL;
      `);
      results.push({ migration: '0008_product_classification', status: 'ok' });
    } catch (err) {
      results.push({ migration: '0008_product_classification', status: 'error', error: String(err) });
    }

    // Migration 0009: Prompt registry
    try {
      await sql.unsafe(`
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

        CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_prompts_active ON agent_prompts(agent_name, prompt_type) WHERE is_active = true;
        CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions(prompt_id);
      `);
      results.push({ migration: '0009_prompt_registry', status: 'ok' });
    } catch (err) {
      results.push({ migration: '0009_prompt_registry', status: 'error', error: String(err) });
    }

    // Migration 0010: Campaign reports
    try {
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS campaign_reports (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          campaign_id uuid NOT NULL REFERENCES campaigns(id),
          report jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_campaign_reports_campaign ON campaign_reports(campaign_id);
      `);
      results.push({ migration: '0010_campaign_reports', status: 'ok' });
    } catch (err) {
      results.push({ migration: '0010_campaign_reports', status: 'error', error: String(err) });
    }

    await sql.end();
    return c.json({ results });
  });

  return app;
}
