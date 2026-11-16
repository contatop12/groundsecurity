// Segredos do Worker (não aparecem no wrangler.jsonc, então `wrangler types` não os conhece).
interface Env {
  /** Chave do Rankeando: `npx wrangler secret put RANKEANDO_WEBHOOK_SECRET`. */
  RANKEANDO_WEBHOOK_SECRET?: string;
  /** Nome antigo da chave, aceito se a nova não existir. */
  P12_WEBHOOK_SECRET?: string;
}
