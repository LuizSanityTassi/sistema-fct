// Tema claro/escuro: a escolha fica no navegador (localStorage) e a classe .dark vai no <html>.
// O script abaixo roda no <head>, antes de pintar a página, para não piscar o tema errado.

export type Tema = "claro" | "escuro" | "sistema";
export const CHAVE_TEMA = "fct.tema";
export const TEMA_PADRAO: Tema = "claro";

export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE_TEMA}")||"${TEMA_PADRAO}";var d=t==="escuro"||(t==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches);var h=document.documentElement;h.classList.toggle("dark",d);h.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

/** Cookie do menu lateral recolhido (lido no servidor para a página já vir no estado certo). */
export const COOKIE_MENU = "fct.menu";
