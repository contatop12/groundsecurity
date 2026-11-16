-- Contrato v2.1 do Rankeando (CONTRATO.md do pacote do blog): dois campos opcionais, só de acréscimo.
-- 1) post.assinatura: a caixa "Escrito por" de um post, guardada como JSON (NULL = sem caixa, como todo post guardado até aqui).
-- 2) pai em cada categoria do evento `categorias`: slug da categoria-mãe de uma subcategoria (NULL = categoria de cima).
-- ALTER TABLE ADD COLUMN simples: nada é reescrito, toda linha fica com NULL. Rode uma vez (o SQLite não tem IF NOT EXISTS para colunas).

ALTER TABLE p12_posts ADD COLUMN assinatura TEXT;

ALTER TABLE p12_categorias ADD COLUMN pai_slug TEXT;

CREATE INDEX IF NOT EXISTS p12_categorias_pai ON p12_categorias (pai_slug);
