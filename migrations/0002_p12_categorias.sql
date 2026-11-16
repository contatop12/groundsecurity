-- Contrato v2 do Rankeando (CONTRATO.md do pacote do blog): categorias do blog. Só acrescenta: tabelas novas, nada em
-- p12_posts muda, então os posts já guardados ficam como estão (sem categoria).

-- As categorias do blog, pelo slug. `ordem` segue a tela do Rankeando (0, 1, 2...).
CREATE TABLE IF NOT EXISTS p12_categorias (
  slug TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0
);

-- A categoria de um post (no máximo uma). Um post sem linha aqui não tem categoria (todo post da v1).
CREATE TABLE IF NOT EXISTS p12_post_categoria (
  post_id TEXT PRIMARY KEY,
  categoria_slug TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS p12_post_categoria_slug ON p12_post_categoria (categoria_slug);

-- Pequenos ajustes do recebimento: `categorias_atualizado_em` é o `atualizado_em` da última lista de categorias
-- aplicada, para ignorar uma lista mais velha que chegue atrasada.
CREATE TABLE IF NOT EXISTS p12_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
