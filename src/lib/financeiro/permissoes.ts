// Quem pode o quê no financeiro. Espelha as políticas de RLS de fin_* (migração 0016);
// a tela esconde botões, mas é o banco que garante.
import type { AppRole } from "@/lib/roles";

/** Lança, edita e classifica categorias. */
export const podeLancar = (papel: AppRole) => papel === "admin" || papel === "financeiro" || papel === "contador";
/** Exclui lançamentos. O contador não exclui: pede ao financeiro. */
export const podeExcluirLancamento = (papel: AppRole) => papel === "admin" || papel === "financeiro";
export const podeFecharMes = (papel: AppRole) => papel === "admin" || papel === "financeiro";
/** Reabrir mês fechado é ato do administrador. */
export const podeReabrirMes = (papel: AppRole) => papel === "admin";
export const podeEditarCategorias = podeLancar;
