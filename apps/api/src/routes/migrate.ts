import { Hono } from 'hono';
import postgres from 'postgres';

export function createMigrateRoutes() {
  const app = new Hono();

  app.post('/run', async (c) => {
    // Simple auth: require MIGRATE_KEY env var (skip in dev)
    const migrateKey = process.env.MIGRATE_KEY;
    if (migrateKey) {
      const provided = c.req.header('X-Migrate-Key');
      if (provided !== migrateKey) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }

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

    // Migration 0011: Anvisa products, campaign groups, state-based campaigns
    try {
      await sql.unsafe(`
        -- Enable trigram extension for fuzzy search
        CREATE EXTENSION IF NOT EXISTS pg_trgm;

        -- Anvisa CMED product table (25K+ rows)
        CREATE TABLE IF NOT EXISTS anvisa_products (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          substancia text NOT NULL,
          produto text NOT NULL,
          apresentacao text NOT NULL,
          laboratorio text,
          tipo_produto text NOT NULL,
          ean text,
          codigo_ggrem text,
          registro text,
          classe_terapeutica text,
          tarja text,
          regime_preco text,
          pmc_by_icms jsonb NOT NULL,
          pf_by_icms jsonb,
          restricao_hospitalar text,
          cap text,
          confaz_87 text,
          icms_0 text,
          comercializacao text,
          destinacao_comercial text,
          imported_at timestamptz NOT NULL DEFAULT now(),
          data_publicacao date
        );

        CREATE INDEX IF NOT EXISTS idx_anvisa_substancia ON anvisa_products USING gin (substancia gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_anvisa_produto ON anvisa_products USING gin (produto gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_anvisa_ean ON anvisa_products(ean) WHERE ean IS NOT NULL AND ean != '    -     ';
        CREATE INDEX IF NOT EXISTS idx_anvisa_codigo_ggrem ON anvisa_products(codigo_ggrem) WHERE codigo_ggrem IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_anvisa_tipo ON anvisa_products(tipo_produto);

        -- Campaign groups (state-based multi-campaign parent)
        CREATE TABLE IF NOT EXISTS campaign_groups (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL,
          script_id uuid NOT NULL REFERENCES scripts(id),
          product_ids jsonb NOT NULL,
          target_states jsonb NOT NULL,
          settings jsonb NOT NULL,
          status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed')),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        -- Add state to wa_sessions
        ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS state text;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_sessions_state ON wa_sessions(state) WHERE state IS NOT NULL;

        -- Add anvisa link to products
        DO $$ BEGIN
          ALTER TABLE products ADD COLUMN anvisa_product_id uuid REFERENCES anvisa_products(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_column THEN NULL; END $$;
        CREATE INDEX IF NOT EXISTS idx_products_anvisa ON products(anvisa_product_id) WHERE anvisa_product_id IS NOT NULL;

        -- Add campaign group + state to campaigns
        DO $$ BEGIN
          ALTER TABLE campaigns ADD COLUMN campaign_group_id uuid REFERENCES campaign_groups(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_column THEN NULL; END $$;
        ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_state text;

        -- Add PMC validation to product_findings
        ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS pmc_value numeric(10,2);
        ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS pmc_exceeded boolean;
      `);
      results.push({ migration: '0011_anvisa_state_campaigns', status: 'ok' });
    } catch (err) {
      results.push({ migration: '0011_anvisa_state_campaigns', status: 'error', error: String(err) });
    }

    // Migration 0012: Parsed apresentacao fields (dosagem, forma, quantidade)
    try {
      await sql.unsafe(`
        ALTER TABLE anvisa_products ADD COLUMN IF NOT EXISTS dosagem text;
        ALTER TABLE anvisa_products ADD COLUMN IF NOT EXISTS forma text;
        ALTER TABLE anvisa_products ADD COLUMN IF NOT EXISTS quantidade text;
        CREATE INDEX IF NOT EXISTS idx_anvisa_dosagem ON anvisa_products(dosagem) WHERE dosagem IS NOT NULL;
      `);
      results.push({ migration: '0012_apresentacao_fields', status: 'ok' });
    } catch (err) {
      results.push({ migration: '0012_apresentacao_fields', status: 'error', error: String(err) });
    }

    // Migration 0013: campaign_products role (survey vs competitor) + fix script trees
    try {
      await sql.unsafe(`
        ALTER TABLE campaign_products ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'survey';
        UPDATE campaign_products SET role = 'competitor'
          WHERE id NOT IN (
            SELECT DISTINCT ON (campaign_id) id
            FROM campaign_products
            ORDER BY campaign_id, id ASC
          );
      `);
      // Patch existing script trees: rewire branches that go to next_product → closing
      const scriptRows = await sql`SELECT id, tree FROM scripts WHERE tree::text LIKE '%next_product%'`;
      for (const row of scriptRows) {
        const tree = typeof row.tree === 'string' ? JSON.parse(row.tree) : row.tree;
        let changed = false;
        for (const [, node] of Object.entries(tree) as [string, Record<string, unknown>][]) {
          if (node.type === 'classify' && Array.isArray(node.branches)) {
            for (const branch of node.branches as Record<string, unknown>[]) {
              if (branch.next === 'next_product') {
                branch.next = 'closing';
                changed = true;
              }
            }
            if (node.timeout_next === 'next_product') {
              node.timeout_next = 'closing';
              changed = true;
            }
          }
        }
        // Remove next_product and transition_product nodes
        if (tree.next_product) { delete tree.next_product; changed = true; }
        if (tree.transition_product) { delete tree.transition_product; changed = true; }
        if (changed) {
          await sql`UPDATE scripts SET tree = ${JSON.stringify(tree)}::jsonb WHERE id = ${row.id}`;
        }
      }
      results.push({ migration: '0013_campaign_product_role', status: 'ok' });
    } catch (err) {
      results.push({ migration: '0013_campaign_product_role', status: 'error', error: String(err) });
    }

    // Migration 0014: Training module (campaign mode + training_evaluations table)
    try {
      await sql.unsafe(`
        ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'auto';
        CREATE TABLE IF NOT EXISTS training_evaluations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          extraction_result jsonb,
          admin_corrections jsonb,
          notes text,
          status text NOT NULL DEFAULT 'pending',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      results.push({ migration: '0014_training_module', status: 'ok' });
    } catch (err) {
      results.push({ migration: '0014_training_module', status: 'error', error: String(err) });
    }

    // Migration 0015: Enrich pharmacies table (CNPJ data, address, chain, associations, WhatsApp)
    try {
      await sql.unsafe(`
        -- Remove unique constraint on phone_number (many pharmacies share chain phone)
        ALTER TABLE pharmacies DROP CONSTRAINT IF EXISTS pharmacies_phone_number_key;
        ALTER TABLE pharmacies DROP CONSTRAINT IF EXISTS pharmacies_phone_number_unique;

        -- CNPJ data
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS cnpj text UNIQUE;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS matriz_filial text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS razao_social text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS nome_fantasia text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS phone2 text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS email text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS cnae_primario text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS cnae_descricao text;

        -- Address
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS tipo_logradouro text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS logradouro text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS numero text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS complemento text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS bairro text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS cep text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS codigo_municipio integer;

        -- Company info
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS porte text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS natureza_juridica text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS data_atividade text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS data_situacao text;

        -- Enrichment
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS chain_name text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS association_name text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS whatsapp_number text;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS whatsapp_verified boolean DEFAULT false;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS last_scraped_at timestamptz;
        ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS scrape_source text;

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_pharmacies_cnpj ON pharmacies(cnpj) WHERE cnpj IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_pharmacies_state ON pharmacies(state) WHERE state IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_pharmacies_chain ON pharmacies(chain_name) WHERE chain_name IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_pharmacies_cep ON pharmacies(cep) WHERE cep IS NOT NULL;
      `);
      results.push({ migration: '0015_enrich_pharmacies', status: 'ok' });
    } catch (err) {
      results.push({ migration: '0015_enrich_pharmacies', status: 'error', error: String(err) });
    }

    await sql.end();
    return c.json({ results });
  });

  return app;
}
