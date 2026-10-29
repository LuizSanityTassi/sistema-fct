"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { lerUuid } from "@/lib/data/ponto";
import { local, TIPO_MARCACAO_LABEL, TIPOS_MARCACAO, type TipoMarcacao } from "@/lib/ponto/calculo";
import { mensagemBanco } from "@/lib/ponto/form";
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

export type Identificado = { ok: true; id: string; nome: string; temPin: boolean; sugestao: TipoMarcacao; ultima: string | null } | { ok: false; erro: string };

/** Relógio da filial, passo 1: matrícula → funcionário (só filiais que o usuário do relógio atende). */
export async function identificarNoRelogio(filial: string, matricula: string): Promise<Identificado> {
  const b = lerUuid(filial);
  const m = matricula.trim().slice(0, 20);
  if (!b || !m) return { ok: false, erro: "Digite a matrícula." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_relogio_identificar", { p_branch: b, p_matricula: m });
  if (error) return { ok: false, erro: mensagemBanco(error, "Não foi possível consultar.") };
  const f = data as { id: string; nome: string; tem_pin: boolean; qtd_hoje?: number; ultima?: { tipo: TipoMarcacao; momento: string } | null } | null;
  if (!f) return { ok: false, erro: "Matrícula não encontrada nesta filial." };
  // sugestão do próximo tipo pelas marcações de hoje (vêm do próprio banco: o login do relógio não lê as marcações)
  const qtd = f.qtd_hoje ?? 0;
  return { ok: true, id: f.id, nome: f.nome, temPin: f.tem_pin, sugestao: TIPOS_MARCACAO[qtd % 4], ultima: f.ultima ? textoConfirmacao(f.ultima.tipo, f.ultima.momento) : null };
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
