-- Rankeando (CONTRATO.md do pacote do blog): os posts que ele envia e cada entrega respondida com sucesso. Este 0001 é o
-- texto original da v1; as categorias da v2 estão no 0002.

-- Uma linha por post do Rankeando, gravada e atualizada pelo `id` dele. Campos de texto como o contrato os envia;
-- `capa`, `seo` e `faq_jsonld` em colunas; datas em ISO 8601 UTC.
CREATE TABLE p12_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  resumo TEXT NOT NULL,
  conteudo_html TEXT NOT NULL,
  conteudo_markdown TEXT NOT NULL,
  capa_url TEXT,
  capa_alt TEXT,
  seo_titulo TEXT NOT NULL,
  seo_descricao TEXT NOT NULL,
  seo_palavra_chave TEXT,
  seo_canonical TEXT,
  faq_jsonld TEXT,
  autor TEXT NOT NULL,
  publicado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  -- Lista JSON dos endereços anteriores do post: cada um responde 301 para o atual.
  slugs_antigos TEXT NOT NULL DEFAULT '[]',
  recebido_em TEXT NOT NULL
);

CREATE INDEX p12_posts_publicado_em ON p12_posts (publicado_em DESC);

-- X-Rankeando-Entrega de cada resposta de sucesso (2xx) e a resposta exata, para uma entrega repetida receber
-- a mesma resposta sem gravar nada. Entregas que falharam não são guardadas: o Rankeando pode reenviá-las.
CREATE TABLE p12_entregas (
  entrega TEXT PRIMARY KEY,
  evento TEXT NOT NULL,
  status INTEGER NOT NULL,
  corpo TEXT NOT NULL,
  recebido_em TEXT NOT NULL
);

CREATE INDEX p12_entregas_evento_recebido ON p12_entregas (evento, recebido_em);
