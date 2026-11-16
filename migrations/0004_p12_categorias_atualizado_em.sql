-- Data de cada categoria (`atualizado_em` opcional de cada item do evento `categorias`, modo mesclar): um item mais velho nunca sobrescreve um guardado mais novo.
ALTER TABLE p12_categorias ADD COLUMN atualizado_em TEXT;
