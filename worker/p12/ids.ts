// `id_no_site` do contrato v3: texto estável de 1 a 128 caracteres, sem caractere de controle, que nomeia um post do blog para sempre
// (`posts.listar`, `post.ler`). Na Ground todo post vem do Rankeando: "rk:<id do Rankeando>" (o id, não o slug, porque o slug pode mudar).
// Texto longo demais ou com caractere de controle mantém o começo limpo e ganha "~" mais um hash FNV-1a do texto inteiro.

export const MAX_ID_NO_SITE = 128;
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/g;

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** O próprio texto, se já for um id válido; senão o começo limpo mais "~" e o hash do original. */
export function ajustarId(s: string): string {
  CONTROLE.lastIndex = 0;
  if (s.length <= MAX_ID_NO_SITE && !CONTROLE.test(s)) return s;
  const inicio = s.replace(CONTROLE, '').slice(0, MAX_ID_NO_SITE - 9).replace(/[\ud800-\udbff]$/, '');
  return `${inicio}~${fnv1a(s)}`;
}

export const idDoPostDoPublisher = (id: string) => ajustarId(`rk:${id}`);
