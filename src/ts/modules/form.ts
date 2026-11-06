import { $, $$, track } from '../utils';

/**
 * Formulário → WhatsApp (sem backend, sem armazenar dados).
 * Valida nome e telefone, monta a mensagem e abre o WhatsApp do comercial.
 * O número vem do atributo data-wa ou, na falta, do link de WhatsApp da página.
 */
const DIGITS = /\D+/g;

function waNumber(): string {
  const link = $<HTMLAnchorElement>('a[href*="wa.me/"]');
  const m = link?.href.match(/wa\.me\/(\d+)/);
  return m?.[1] ?? '5511947901159';
}

/** Máscara simples de telefone BR: (11) 91234-5678 */
function maskPhone(v: string): string {
  const d = v.replace(DIGITS, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function setError(input: HTMLInputElement, msg: string): void {
  const field = input.closest('.field');
  field?.classList.toggle('is-invalid', Boolean(msg));
  input.setAttribute('aria-invalid', String(Boolean(msg)));
  const out = field?.querySelector('.field__error');
  if (out) out.textContent = msg;
}

export function initForms(): void {
  $$<HTMLFormElement>('[data-wa-form]').forEach((form) => {
    const tel = $<HTMLInputElement>('input[type="tel"]', form);
    tel?.addEventListener('input', () => (tel.value = maskPhone(tel.value)));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const get = (k: string): string => String(data.get(k) ?? '').trim();
      const nameEl = form.elements.namedItem('nome') as HTMLInputElement | null;
      const telEl = form.elements.namedItem('telefone') as HTMLInputElement | null;

      let ok = true;
      if (nameEl) {
        const err = get('nome').length < 2 ? 'Informe seu nome para sabermos com quem falar.' : '';
        setError(nameEl, err);
        if (err) ok = false;
      }
      if (telEl) {
        const err = get('telefone').replace(DIGITS, '').length < 10 ? 'Informe um telefone com DDD, por exemplo (11) 91234-5678.' : '';
        setError(telEl, err);
        if (err) ok = false;
      }
      if (!ok) {
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
        return;
      }

      const lines = [
        'Olá! Vim pelo site da Ground Security.',
        `Nome: ${get('nome')}`,
        get('empresa') && `Empresa: ${get('empresa')}`,
        get('email') && `E-mail: ${get('email')}`,
        `Telefone: ${get('telefone')}`,
        get('solucao') && `Interesse: ${get('solucao')}`,
        get('mensagem') && `Mensagem: ${get('mensagem')}`,
      ].filter(Boolean);

      const url = `https://wa.me/${form.dataset.wa ?? waNumber()}?text=${encodeURIComponent(lines.join('\n'))}`;
      track('generate_lead', { method: 'whatsapp_form', solucao: get('solucao') || 'nao-informado' });
      const status = $('.form__status', form);
      if (status) status.textContent = 'Abrindo o WhatsApp com a sua mensagem…';
      window.open(url, '_blank', 'noopener');
    });
  });
}
