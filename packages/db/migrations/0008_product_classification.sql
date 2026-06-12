-- Product classification fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS form text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'reference'
  CHECK (product_type IN ('reference', 'similar', 'generic'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS reference_product_id uuid
  REFERENCES products(id) ON DELETE SET NULL;

-- Product finding classification fields
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS product_type text
  CHECK (product_type IN ('reference', 'similar', 'generic'));
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS laboratory text;
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS dosage_mentioned text;
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS quantity_mentioned integer;
ALTER TABLE product_findings ADD COLUMN IF NOT EXISTS form_mentioned text;

-- Index for querying competitors of a reference product
CREATE INDEX IF NOT EXISTS idx_products_reference ON products(reference_product_id)
  WHERE reference_product_id IS NOT NULL;
