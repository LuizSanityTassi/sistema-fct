"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { configFiliais, lerUuid, meuFuncionario } from "@/lib/data/ponto";
import { local, TIPO_MARCACAO_LABEL, TIPOS_MARCACAO, type TipoMarcacao } from "@/lib/ponto/calculo";
import { mensagemBanco } from "@/lib/ponto/form";
import { createClient } from "@/lib/supabase/server";

export type ResultadoRegistro = { ok: true; texto: string; nsr: number; nome: string; tipo: TipoMarcacao } | { ok: false; erro: string };

type Coordenadas = { latitude: number; longitude: number; precisao: number } | null;

/** IP e aparelho de quem registra (vão junto com a marcação, para auditoria). */
async function origem() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent") ?? "";
  const celular = /Mobi|Android|iPhone|iPad/i.test(ua);
  return { ip, dispositivo: ua.slice(0, 300) || null, celular };
}

function textoConfirmacao(tipo: TipoMarcacao, momento: string) {
  const l = local(momento);
  return `${TIPO_MARCACAO_LABEL[tipo]} registrada às ${String(Math.floor(l.min / 60)).padStart(2, "0")}:${String(l.min % 60).padStart(2, "0")}`;
}

function coordenadasValidas(c: Coordenadas): Coordenadas {
  if (!c) return null;
  const ok = Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
  return ok ? { latitude: Number(c.latitude.toFixed(6)), longitude: Number(c.longitude.toFixed(6)), precisao: Math.min(999999, Math.max(0, Math.round(c.precisao * 10) / 10)) } : null;
}

/** "Meu ponto": o funcionário registra o próprio ponto (computador ou celular). */
export async function registrarMeuPonto(tipo: string | null, coords: Coordenadas): Promise<ResultadoRegistro> {
  const func = await meuFuncionario();
  if (!func) return { ok: false, erro: "Seu usuário não está ligado a um funcionário. Fale com o RH." };
  const t = tipo && (TIPOS_MARCACAO as readonly string[]).includes(tipo) ? tipo : null;
  const c = coordenadasValidas(coords);
  const cfg = (await configFiliais()).get(func.branch_id);
  const o = await origem();
  if (cfg?.exige_localizacao && o.celular && !c) return { ok: false, erro: "Sua filial exige a localização para registrar pelo celular. Permita o acesso à localização e tente de novo." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_registrar", {
    p_employee: func.id,
    p_tipo: t,
    p_metodo: o.celular ? "celular" : "web",
    p_pin: null,
    p_dispositivo: o.dispositivo,
    p_ip: o.ip,
    p_latitude: c?.latitude ?? null,
    p_longitude: c?.longitude ?? null,
    p_precisao: c?.precisao ?? null,
  });
  if (error) return { ok: false, erro: mensagemBanco(error, "Não foi possível registrar.") };
  const r = data as { erro?: string; nsr: number; momento: string; tipo: TipoMarcacao; funcionario: string };
  if (r.erro) return { ok: false, erro: r.erro };
  revalidatePath("/ponto", "layout");
  return { ok: true, texto: textoConfirmacao(r.tipo, r.momento), nsr: r.nsr, nome: r.funcionario, tipo: r.tipo };
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
  const f = data as { id: string; nome: string; tem_pin: boolean } | null;
  if (!f) return { ok: false, erro: "Matrícula não encontrada nesta filial." };
  // sugestão do próximo tipo pelas marcações de hoje (o relógio de gestor enxerga as da filial)
  const hoje = local(new Date().toISOString()).data;
  const { data: ms } = await supabase
    .from("ponto_marcacoes")
    .select("tipo, momento")
    .eq("employee_id", f.id)
    .eq("anulada", false)
    .gte("momento", new Date(`${hoje}T00:00:00-03:00`).toISOString())
    .order("momento");
  const qtd = ms?.length ?? 0;
  const ultima = ms?.length ? ms[ms.length - 1] : null;
  return { ok: true, id: f.id, nome: f.nome, temPin: f.tem_pin, sugestao: TIPOS_MARCACAO[qtd % 4], ultima: ultima ? textoConfirmacao(ultima.tipo as TipoMarcacao, ultima.momento) : null };
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
