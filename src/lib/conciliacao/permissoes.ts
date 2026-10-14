// Quem pode o quê na conciliação — espelha o RLS de conc_* (migração 0018).
import type { AppRole } from "@/lib/roles";

/** Vê arquivos, conciliações, pendências e de-para. */
export const podeVerConciliacao = (papel: AppRole) => papel === "admin" || papel === "financeiro" || papel === "contador";
/** Envia arquivos, concilia, trata pendências, edita de-para, envia ao Omie. */
export const podeConciliar = (papel: AppRole) => papel === "admin" || papel === "financeiro";
/** Configurações (Omie, faixas) e agentes de arquivos. */
export const podeConfigurarConciliacao = (papel: AppRole) => papel === "admin";
