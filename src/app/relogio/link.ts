// Cookie com o link do relógio da filial, gravado ao entrar por ele (só no caminho /relogio): a tela do relógio usa
// para oferecer "Instalar app" com o manifesto do "Relógio <filial>", que abre sempre pelo link.
export const COOKIE_LINK_RELOGIO = "fct_relogio_link";

export const linkValido = (t: string | undefined): t is string => !!t && /^[A-Za-z0-9_-]{40,64}$/.test(t);
