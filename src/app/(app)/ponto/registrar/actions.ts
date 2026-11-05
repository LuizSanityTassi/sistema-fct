"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { lerUuid } from "@/lib/data/ponto";
import { local, TIPO_MARCACAO_LABEL, TIPOS_MARCACAO, TIPOS_NORMAIS, type TipoMarcacao } from "@/lib/ponto/calculo";
import { mensagemBanco } from "@/lib/ponto/form";
import type { LeituraDigital } from "@/lib/ponto/leitor-digital";
import { createClient } from "@/lib/supabase/server";

export type ResultadoRegistro = { ok: true; texto: string; nsr: number; nome: string; tipo: TipoMarcacao } | { ok: false; erro: string };

/** IP e aparelho de quem registra (vão junto com a marcação, para auditoria). */
async function origem() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent") ?? "";
  return { ip, dispositivo: ua.slice(0, 300) || null };
}

function textoConfirmacao(tipo: TipoMarcacao, momento: string) {
  const l = local(momento);
  return `${TIPO_MARCACAO_LABEL[tipo]} registrada às ${String(Math.floor(l.min / 60)).padStart(2, "0")}:${String(l.min % 60).padStart(2, "0")}`;
}

export type Identificado = { ok: true; id: string; nome: string; temPin: boolean; temDigital: boolean; sugestao: TipoMarcacao; tiposExtra: TipoMarcacao[]; ultima: string | null } | { ok: false; erro: string };

type PessoaDoBanco = { id: string; nome: string; tem_pin: boolean; tem_digital?: boolean; qtd_hoje?: number; extra_liberada?: boolean; em_extra?: boolean; ultima?: { tipo: TipoMarcacao; momento: string } | null };

/** Sugestão do próximo tipo pelas marcações de hoje (vêm do próprio banco: o login do relógio não lê as marcações). */
function pessoaIdentificada(f: PessoaDoBanco): Identificado {
  const qtd = f.qtd_hoje ?? 0;
  // a extra só aparece para quem o RH/DP liberou; quem está nela, só pode sair
  const tiposExtra: TipoMarcacao[] = f.em_extra ? ["saida_extra"] : f.extra_liberada ? ["entrada_extra"] : [];
  const sugestao: TipoMarcacao = f.em_extra ? "saida_extra" : f.extra_liberada && qtd > 0 && qtd % 4 === 0 ? "entrada_extra" : TIPOS_NORMAIS[qtd % 4];
  return { ok: true, id: f.id, nome: f.nome, temPin: f.tem_pin, temDigital: f.tem_digital === true, sugestao, tiposExtra, ultima: f.ultima ? textoConfirmacao(f.ultima.tipo, f.ultima.momento) : null };
}

/** Relógio da filial, passo 1: matrícula → funcionário (só filiais que o usuário do relógio atende). */
export async function identificarNoRelogio(filial: string, matricula: string): Promise<Identificado> {
  const b = lerUuid(filial);
  const m = matricula.trim().slice(0, 20);
  if (!b || !m) return { ok: false, erro: "Digite a matrícula." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_relogio_identificar", { p_branch: b, p_matricula: m });
  if (error) return { ok: false, erro: mensagemBanco(error, "Não foi possível consultar.") };
  const f = data as PessoaDoBanco | null;
  if (!f) return { ok: false, erro: "Matrícula não encontrada nesta filial." };
  return pessoaIdentificada(f);
}

export type LeituraAberta = ({ ok: true } & LeituraDigital) | { ok: false; erro: string };

/** Relógio da filial com digital, passo 1: já tem dedo no leitor; abre uma leitura com as digitais da filial, cifradas (só o programa do leitor abre). */
export async function iniciarLeituraNoRelogio(filial: string, leitorId: string): Promise<LeituraAberta> {
  const b = lerUuid(filial);
  const leitor = lerUuid(leitorId);
  if (!b || !leitor) return { ok: false, erro: "Leitor ou filial inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_digital_iniciar_filial", { p_branch: b, p_leitor: leitor });
  if (error) return { ok: false, erro: mensagemBanco(error, "Não foi possível abrir a leitura da digital.") };
  return { ok: true, ...(data as LeituraDigital) };
}

/** Relógio da filial com digital, passo 2: o banco confere a assinatura do programa do leitor e diz quem é. */
export async function identificarDigitalNoRelogio(desafio: string, employeeId: string, dedo: number, assinatura: string): Promise<Identificado> {
  const id = lerUuid(desafio);
  const pessoa = lerUuid(employeeId);
  if (!id || !pessoa || !Number.isInteger(dedo) || !/^[0-9a-f]{64}$/.test(assinatura)) return { ok: false, erro: "A leitura da digital veio incompleta. Coloque o dedo de novo." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_digital_identificar", { p_desafio: id, p_employee: pessoa, p_dedo: dedo, p_assinatura: assinatura });
  if (error) return { ok: false, erro: mensagemBanco(error, "Não foi possível confirmar a digital.") };
  const r = data as (PessoaDoBanco & { erro?: undefined }) | { erro: string };
  if (r.erro !== undefined) return { ok: false, erro: r.erro };
  return pessoaIdentificada(r);
}

/** Relógio da filial com digital, passo 3: tipo + assinatura do programa do leitor. */
export async function registrarDigitalNoRelogio(desafio: string, dedo: number, assinatura: string, tipo: string | null): Promise<ResultadoRegistro> {
  const id = lerUuid(desafio);
  if (!id || !Number.isInteger(dedo) || !/^[0-9a-f]{64}$/.test(assinatura)) return { ok: false, erro: "A leitura da digital veio incompleta. Coloque o dedo de novo." };
  const t = tipo && (TIPOS_MARCACAO as readonly string[]).includes(tipo) ? tipo : null;
  const o = await origem();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_registrar_digital", {
    p_desafio: id,
    p_dedo: dedo,
    p_assinatura: assinatura,
    p_tipo: t,
    p_dispositivo: o.dispositivo ? `Relógio da filial · ${o.dispositivo}`.slice(0, 300) : "Relógio da filial",
    p_ip: o.ip,
  });
  if (error) return { ok: false, erro: mensagemBanco(error, "Não foi possível registrar.") };
  const r = data as { erro?: string; nsr: number; momento: string; tipo: TipoMarcacao; funcionario: string };
  if (r.erro) return { ok: false, erro: r.erro };
  revalidatePath("/ponto", "layout");
  return { ok: true, texto: textoConfirmacao(r.tipo, r.momento), nsr: r.nsr, nome: r.funcionario, tipo: r.tipo };
}

/** Relógio da filial, passo 2: PIN + tipo. PIN errado conta tentativa (5 erros = 15 minutos bloqueado). */
export async function registrarNoRelogio(employeeId: string, pin: string, tipo: string | null): Promise<ResultadoRegistro> {
  const id = lerUuid(employeeId);
  if (!id) return { ok: false, erro: "Funcionário inválido." };
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, erro: "Digite o PIN (4 a 6 números)." };
  const t = tipo && (TIPOS_MARCACAO as readonly string[]).includes(tipo) ? tipo : null;
  const o = await origem();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_registrar", {
    p_employee: id,
    p_tipo: t,
    p_metodo: "relogio_pin",
    p_pin: pin,
    p_dispositivo: o.dispositivo ? `Relógio da filial · ${o.dispositivo}`.slice(0, 300) : "Relógio da filial",
    p_ip: o.ip,
    p_latitude: null,
    p_longitude: null,
    p_precisao: null,
  });
  if (error) return { ok: false, erro: mensagemBanco(error, "Não foi possível registrar.") };
  const r = data as { erro?: string; nsr: number; momento: string; tipo: TipoMarcacao; funcionario: string };
  if (r.erro) return { ok: false, erro: r.erro };
  revalidatePath("/ponto", "layout");
  return { ok: true, texto: textoConfirmacao(r.tipo, r.momento), nsr: r.nsr, nome: r.funcionario, tipo: r.tipo };
}
