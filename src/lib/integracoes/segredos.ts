// Segredos das integrações (Trier, Omie…) guardados no Supabase Vault (criptografado), gravados e lidos só por
// funções SQL security definer (migração 0023): admin grava; admin e financeiro leem (quem opera as integrações).
// Nunca vão para o navegador: as telas recebem só "configurado" e o final da chave. Variáveis de ambiente continuam
// valendo como alternativa (quem já configurou na Vercel não precisa mudar nada).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Cliente = SupabaseClient<Database>;

export const SEGREDOS = {
  trier_url: "integ_trier_url",
  trier_usuario: "integ_trier_usuario",
  trier_senha: "integ_trier_senha",
  omie_nazario_app_key: "integ_omie_nazario_app_key",
  omie_nazario_app_secret: "integ_omie_nazario_app_secret",
  omie_varela_app_key: "integ_omie_varela_app_key",
  omie_varela_app_secret: "integ_omie_varela_app_secret",
} as const;
export type NomeSegredo = (typeof SEGREDOS)[keyof typeof SEGREDOS];

export async function lerSegredos(supabase: Cliente, nomes: NomeSegredo[]): Promise<Partial<Record<NomeSegredo, string>>> {
  const { data, error } = await supabase.rpc("integracao_ler_segredos", { p_nomes: nomes });
  if (error) throw new Error(`Não consegui ler as integrações: ${error.message}`);
  const out: Partial<Record<NomeSegredo, string>> = {};
  for (const r of data ?? []) if (r.valor) out[r.nome as NomeSegredo] = r.valor;
  return out;
}

/** Grava (ou apaga, se vazio) um segredo. Só admin — a função SQL confere. */
export async function salvarSegredo(supabase: Cliente, nome: NomeSegredo, valor: string | null | undefined) {
  const { error } = await supabase.rpc("integracao_salvar_segredo", { p_nome: nome, p_valor: valor?.trim() ?? "" });
  if (error) throw new Error(error.message);
}

export type StatusSegredo = { configurado: boolean; final: string; atualizadoEm: string | null };

/** Para as telas: se cada segredo existe, os 4 últimos caracteres (só para chaves) e quando foi alterado. */
export async function statusSegredos(supabase: Cliente): Promise<Record<NomeSegredo, StatusSegredo>> {
  const { data, error } = await supabase.rpc("integracao_status_segredos");
  if (error) throw new Error(`Não consegui ler o status das integrações: ${error.message}`);
  const porNome = new Map((data ?? []).map((r) => [r.nome, r]));
  const out = {} as Record<NomeSegredo, StatusSegredo>;
  for (const nome of Object.values(SEGREDOS)) {
    const r = porNome.get(nome);
    const mostraFinal = /app_key$/.test(nome);
    out[nome] = { configurado: !!r, final: r && mostraFinal ? r.final : "", atualizadoEm: r?.atualizado_em ?? null };
  }
  return out;
}

// ---------- resolução com fallback para variáveis de ambiente ----------

export type CredenciaisTrier = { url: string; usuario: string; senha: string; origem: "sistema" | "ambiente" | null };
const TRIER_URL_PADRAO = "http://redefct.ddns.com.br:4647/sgfpod1/";
const comBarra = (u: string) => (u.endsWith("/") ? u : `${u}/`);

/** Trier: primeiro o que foi gravado na tela de Integrações; se não houver, as variáveis TRIER_*. */
export async function credenciaisTrier(supabase: Cliente): Promise<CredenciaisTrier> {
  let s: Partial<Record<NomeSegredo, string>> = {};
  try {
    s = await lerSegredos(supabase, [SEGREDOS.trier_url, SEGREDOS.trier_usuario, SEGREDOS.trier_senha]);
  } catch {
    /* sem permissão de leitura: cai no ambiente */
  }
  if (s.integ_trier_usuario && s.integ_trier_senha) {
    return { url: comBarra((s.integ_trier_url || process.env.TRIER_URL || TRIER_URL_PADRAO).trim()), usuario: s.integ_trier_usuario, senha: s.integ_trier_senha, origem: "sistema" };
  }
  const usuario = (process.env.TRIER_USUARIO ?? "").trim();
  const senha = process.env.TRIER_SENHA ?? "";
  return { url: comBarra((s.integ_trier_url || process.env.TRIER_URL || TRIER_URL_PADRAO).trim()), usuario, senha, origem: usuario && senha ? "ambiente" : null };
}

export type ChavesOmie = { app_key: string; app_secret: string; origem: "sistema" | "ambiente" };

/** Omie: chaves gravadas na tela de Integrações ou, se não houver, OMIE_<EMPRESA>_APP_KEY/SECRET. */
export async function chavesOmieDe(supabase: Cliente, empresa: "nazario" | "varela"): Promise<ChavesOmie | null> {
  const nomeKey = empresa === "nazario" ? SEGREDOS.omie_nazario_app_key : SEGREDOS.omie_varela_app_key;
  const nomeSecret = empresa === "nazario" ? SEGREDOS.omie_nazario_app_secret : SEGREDOS.omie_varela_app_secret;
  let s: Partial<Record<NomeSegredo, string>> = {};
  try {
    s = await lerSegredos(supabase, [nomeKey, nomeSecret]);
  } catch {
    /* idem */
  }
  if (s[nomeKey] && s[nomeSecret]) return { app_key: s[nomeKey]!, app_secret: s[nomeSecret]!, origem: "sistema" };
  const prefixo = empresa === "nazario" ? "OMIE_NAZARIO" : "OMIE_VARELA";
  const app_key = process.env[`${prefixo}_APP_KEY`]?.trim();
  const app_secret = process.env[`${prefixo}_APP_SECRET`]?.trim();
  return app_key && app_secret ? { app_key, app_secret, origem: "ambiente" } : null;
}
