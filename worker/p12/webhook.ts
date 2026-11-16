// POST /api/p12/webhook: recebe os posts e as categorias do Rankeando e responde às leituras dele (CONTRATO.md v3 do pacote do blog).
// A assinatura é conferida primeiro, só com RANKEANDO_WEBHOOK_SECRET (ou a antiga P12_WEBHOOK_SECRET) e o relógio do servidor;
// depois, uma X-Rankeando-Entrega repetida (ou X-P12-Entrega) recebe a resposta guardada; só então o evento é aplicado.
import { readBody } from '../body';
import { lerCabecalhoDoRankeando, verificarAssinatura } from './assinatura';
import { CONTRATO, RECURSOS, ERROS, erro, lerEvento, resposta, type PostP12, type Resposta } from './contrato';
import { acharEntrada, entradas, lerPostDaEntrada, paginaDePosts, urlDoPost } from './posts';
import type { P12Store } from './store';

export const P12_WEBHOOK_PATH = '/api/p12/webhook';

/** O JSON de um post inteiro raramente passa de 200 KB; o D1 guarda linhas de até 2 MB. */
const MAX_CORPO = 1_500_000;

/** Endereços de um só segmento que o blog usa para outra coisa: um post do Rankeando não pode tomá-los. */
export const SLUGS_RESERVADOS = new Set(['categoria', 'page']);

export type Dependencias = {
  /** `segredoDoRankeando(env)`: RANKEANDO_WEBHOOK_SECRET ou, se ela não existir, P12_WEBHOOK_SECRET. */
  segredo: string | undefined;
  store: P12Store;
  /** Segundos Unix: o relógio do servidor em produção. */
  agora: number;
};

const json = (r: Resposta) => Response.json(r.corpo, { status: r.status, headers: { 'cache-control': 'no-store' } });
const salvo = (status: number, corpo: string) =>
  new Response(corpo, { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const LEITURAS = new Set(['categorias.listar', 'posts.listar', 'post.ler']);
const NAO_EXISTE = () => erro(404, 'nao_encontrado', 'post não existe');

export async function handleP12Webhook(request: Request, deps: Dependencias): Promise<Response> {
  if (request.method !== 'POST') return json(erro(405, 'metodo_nao_permitido', 'use POST'));
  if (!deps.segredo) {
    console.error({ message: 'p12 webhook: RANKEANDO_WEBHOOK_SECRET (ou P12_WEBHOOK_SECRET) não configurada' });
    return json(erro(503, 'nao_configurado', 'o site ainda não tem a chave RANKEANDO_WEBHOOK_SECRET'));
  }
  const corpo = await readBody(request, MAX_CORPO);
  if (corpo === null) return json(erro(413, 'corpo_invalido', 'corpo maior que 1,5 MB'));

  const conferencia = await verificarAssinatura(deps.segredo, lerCabecalhoDoRankeando(request.headers, 'Assinatura'), corpo, deps.agora);
  if (conferencia === 'fora_do_horario') return json(ERROS.horario());
  if (conferencia !== 'ok') return json(ERROS.assinatura());

  const cabecalhoEvento = lerCabecalhoDoRankeando(request.headers, 'Evento');
  // As leituras (categorias.listar, posts.listar, post.ler) só leem: cada pedido tem entrega nova e a resposta é sempre fresca, nunca a guardada.
  const leitura = cabecalhoEvento !== null && LEITURAS.has(cabecalhoEvento);
  const entrega = lerCabecalhoDoRankeando(request.headers, 'Entrega') ?? '';
  if (!leitura && (!entrega || entrega.length > 300)) return json(ERROS.corpo('cabeçalho X-Rankeando-Entrega ausente ou inválido'));

  try {
    if (!leitura) {
      const anterior = await deps.store.entrega(entrega);
      if (anterior) return salvo(anterior.status, anterior.corpo);
    }

    const evento = lerEvento(corpo, cabecalhoEvento);
    if ('status' in evento) return json(evento);

    if (evento.evento === 'categorias.listar') {
      // O site não tem categorias fixas no código: só as do banco.
      const todas = await deps.store.categorias();
      return json(resposta(200, {
        ok: true,
        categorias: todas.map((c) => ({
          slug: c.slug,
          nome: c.nome,
          ...(c.descricao ? { descricao: c.descricao } : {}),
          pai: c.pai,
          ordem: c.ordem,
          total_posts: c.posts,
        })),
      }));
    }

    if (evento.evento === 'posts.listar') {
      const pagina = paginaDePosts(await entradas(deps.store), evento);
      if (!pagina) return json(ERROS.corpo('cursor inválido: use o proximo_cursor que o site deu'));
      return json(resposta(200, { ok: true, posts: pagina.posts, total: pagina.total, proximo_cursor: pagina.proximo_cursor }));
    }
    if (evento.evento === 'post.ler') {
      const e = acharEntrada(await entradas(deps.store), evento.id_no_site);
      if (!e) return json(NAO_EXISTE());
      const post = await lerPostDaEntrada(e, deps.store);
      if (!post) throw new Error(`dados do post ${e.idNoSite} indisponíveis`);
      return json(resposta(200, { ok: true, ...post }));
    }

    const agora = new Date(deps.agora * 1000).toISOString();
    const nova = (r: Resposta) => ({ entrega, evento: evento.evento, status: r.status, corpo: JSON.stringify(r.corpo) });

    if (evento.evento === 'ping') {
      const r = resposta(200, { ok: true, desafio: evento.desafio, contrato: CONTRATO, recursos: [...RECURSOS] });
      await deps.store.salvarPing(nova(r), agora);
      return json(r);
    }
    if (evento.evento === 'categorias') {
      const r = resposta(200, { ok: true });
      // Modo mesclar (ou sem modo): toda lista é aplicada item a item (o store pula o item mais velho que o guardado),
      // então uma lista parcial que chega tarde não se perde. Qualquer outro modo mantém a regra antiga: lista mais velha que a última não muda nada.
      const mescla = evento.modo === null || evento.modo === 'mesclar';
      const ultima = mescla ? null : await deps.store.categoriasAtualizadoEm();
      if (ultima && ultima > evento.atualizado_em) await deps.store.salvarEntrega(nova(r), agora);
      else await deps.store.salvarCategorias({ categorias: evento.categorias, atualizadoEm: evento.atualizado_em, entrega: nova(r), agora });
      return json(r);
    }
    if (evento.evento === 'categorias.remover') {
      const r = resposta(200, { ok: true });
      await deps.store.removerCategorias({ slugs: evento.slugs, entrega: nova(r), agora });
      return json(r);
    }
    if (evento.evento === 'post.remover') {
      const r = resposta(200, { ok: true });
      await deps.store.remover(evento.id, nova(r), agora);
      return json(r);
    }
    return json(await publicar(evento.post, deps, agora, nova));
  } catch (e) {
    console.error({ message: 'p12 webhook: falha no armazenamento', entrega, error: e instanceof Error ? e.message : String(e) });
    return json(erro(503, 'indisponivel', 'banco do site indisponível; tente de novo'));
  }
}

async function publicar(
  post: PostP12,
  deps: Dependencias,
  agora: string,
  nova: (r: Resposta) => { entrega: string; evento: string; status: number; corpo: string },
): Promise<Resposta> {
  const { store } = deps;
  const atual = await store.porId(post.id);
  // Versão mais velha que a do site (reenvio que chega depois de uma mais nova, ou depois de o post ser removido):
  // responde sucesso e mantém o site como está.
  const removido = atual ? null : await store.removidoEm(post.id);
  if ((atual && atual.atualizadoEm > post.atualizado_em) || (removido && removido > post.atualizado_em)) {
    const r = resposta(200, { ok: true, url: urlDoPost(atual?.slug ?? post.slug) });
    await store.salvarEntrega(nova(r), agora);
    return r;
  }
  // 409: o endereço é de uma rota do blog (o site não tem posts próprios).
  if (SLUGS_RESERVADOS.has(post.slug)) return ERROS.slugDoSite();
  const dono = await store.idDoSlug(post.slug);
  if (dono && dono !== post.id) return ERROS.slugDoPublisher();

  const antigos = new Set(atual?.slugsAntigos ?? []);
  if (atual && atual.slug !== post.slug) antigos.add(atual.slug);
  antigos.delete(post.slug);
  // O endereço antigo de outro post agora é deste: o 301 dele some.
  const liberar = (await store.donosDoSlugAntigo(post.slug)).filter((r) => r.id !== post.id);

  const r = resposta(200, { ok: true, url: urlDoPost(post.slug) });
  await store.gravar({ post, slugsAntigos: [...antigos], liberar, entrega: nova(r), agora });
  return r;
}
