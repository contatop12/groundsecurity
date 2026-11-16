/**
 * Worker do site. Os arquivos estáticos (dist/) saem direto da Cloudflare; o Worker só roda onde `assets.run_worker_first`
 * (wrangler.jsonc) manda: /api/*, o blog (/blog, /blog/*), /sitemap.xml, /feed.xml e /p12-kit/*.
 *
 * POST /api/p12/webhook — recebe os posts e as categorias do Rankeando (contrato v3, assinatura HMAC). Segredo: RANKEANDO_WEBHOOK_SECRET.
 * Páginas do blog: worker/p12/site.ts. Tipos de Env: worker/worker-configuration.d.ts (gerado por `npm run cf:types`).
 */
import { segredoDoRankeando } from './p12/assinatura';
import { servirSite } from './p12/site';
import { D1Store } from './p12/store';
import { handleP12Webhook, P12_WEBHOOK_PATH } from './p12/webhook';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * Endereços *.workers.dev (produção e pré-visualizações) não devem ser indexados: o oficial é https://groundsecurity.com.br.
 * public/_headers já faz isso nos arquivos estáticos; aqui a mesma regra vale para o que o Worker responde.
 */
export function comNoindexNoWorkersDev(res: Response, hostname: string): Response {
  if (!/\.workers\.dev$/i.test(hostname)) return res;
  const r = new Response(res.body, res);
  r.headers.set('X-Robots-Tag', 'noindex');
  return r;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    let res: Response;
    if (url.pathname === P12_WEBHOOK_PATH || url.pathname === `${P12_WEBHOOK_PATH}/`) {
      // A assinatura é a autenticação e é conferida antes de qualquer outra coisa.
      res = await handleP12Webhook(request, {
        segredo: segredoDoRankeando({ RANKEANDO_WEBHOOK_SECRET: env.RANKEANDO_WEBHOOK_SECRET, P12_WEBHOOK_SECRET: env.P12_WEBHOOK_SECRET }),
        store: new D1Store(env.DB),
        agora: Math.floor(Date.now() / 1000),
      });
    } else if (url.pathname.startsWith('/api/')) {
      res = json({ ok: false, erro: 'nao_encontrado' }, 404);
    } else {
      // Páginas do blog, sitemap e feed; o resto sai como o build fez.
      res = await servirSite(request, env);
    }
    return comNoindexNoWorkersDev(res, url.hostname);
  },
} satisfies ExportedHandler<Env>;
