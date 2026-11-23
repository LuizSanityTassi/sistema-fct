// Folha para assinatura: quem entra na folha (filial, colaborador, período) e os dados de cada uma. Só leitura;
// o RLS (ponto_equipe, employees, branches) decide o que cada papel enxerga.
import type { Sessao } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { diasEntre, hojeLocal, somarDias, type TotaisPeriodo } from "@/lib/ponto/calculo";
import { montarFolha, type FolhaMontada } from "@/lib/ponto/folha";
import { createClient } from "@/lib/supabase/server";
import { formatarCnpj } from "@/lib/validacao/cnpj";
import { formatarCpf } from "@/lib/validacao/cpf";
import { apurar, lerData, lerUuid, listarEquipe, type FuncPonto } from "./ponto";

export const ROTA_FOLHA_ASSINATURA = "/ponto/folha-assinatura";
export const ROTA_IMPRIMIR_FOLHA = "/imprimir/ponto/folha";
/** Período máximo de uma folha (a planilha de hoje é mensal; 3 meses cobre folgas de fechamento). */
export const MAX_DIAS_FOLHA = 92;

export type ParamsFolha = { filial?: string; funcionario?: string; de: string; ate: string; cortado: boolean };

/** Filiais que a pessoa pode escolher: o gerente só a dele; admin, RH e coordenador escolhem (o RLS limita a equipe). */
export async function filiaisDaFolha(sessao: Sessao) {
  const unidades = (await listarUnidadesParaSelecao()).filter((u) => u.ativo);
  return sessao.papel === "gerente" ? unidades.filter((u) => u.id === sessao.branchId) : unidades;
}

/** Lê filial, colaborador e período da URL. Padrão: do dia 1º do mês até hoje; o gerente fica preso à filial dele. */
export function lerParamsFolha(sp: Record<string, string | string[] | undefined>, sessao: Sessao, agora = new Date()): ParamsFolha {
  const hoje = hojeLocal(agora);
  let de = lerData(sp.de) ?? `${hoje.slice(0, 7)}-01`;
  let ate = lerData(sp.ate) ?? hoje;
  if (de > ate) [de, ate] = [ate, de];
  const cortado = diasEntre(de, ate) > MAX_DIAS_FOLHA;
  if (cortado) ate = somarDias(de, MAX_DIAS_FOLHA);
  const pedida = lerUuid(sp.filial);
  const filial = sessao.papel === "gerente" ? (sessao.branchId ?? undefined) : (pedida ?? sessao.branchId ?? undefined);
  return { filial, funcionario: lerUuid(sp.funcionario), de, ate, cortado };
}

/** Colaboradores da filial que entram na folha: os ativos e quem foi desligado dentro do período (também assina). */
export async function colaboradoresDaFolha(filial: string, de: string): Promise<FuncPonto[]> {
  const todos = await listarEquipe({ filial, desligados: true });
  return todos.filter((f) => f.status !== "desligado" || (f.data_desligamento && f.data_desligamento >= de));
}

export type EmpresaFolha = { filialCodigo: string; filialNome: string; razaoSocial: string; cnpj: string };

async function empresaDaFilial(filial: string): Promise<EmpresaFolha | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").select("codigo, nome, razao_social, cnpj, organizations(razao_social, cnpj)").eq("id", filial).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const org = data.organizations as { razao_social: string | null; cnpj: string | null } | null;
  const cnpj = data.cnpj ?? org?.cnpj ?? "";
  return { filialCodigo: data.codigo, filialNome: data.nome, razaoSocial: data.razao_social ?? org?.razao_social ?? "", cnpj: cnpj ? formatarCnpj(cnpj) : "" };
}

/** CPF e PIS vêm direto de employees (RLS: admin, RH e gerente da filial; o coordenador vê a folha sem eles). */
async function documentos(ids: string[]) {
  const mapa = new Map<string, { cpf: string; pis: string; filialFolha: string }>();
  if (!ids.length) return mapa;
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("id, cpf, pis, branch_id").in("id", ids);
  for (const e of data ?? []) mapa.set(e.id, { cpf: e.cpf ? formatarCpf(e.cpf) : "", pis: e.pis ?? "", filialFolha: e.branch_id });
  return mapa;
}

/** `empresa` = a da filial da FOLHA da pessoa (quem registrou), quando é diferente da filial do ponto escolhida. */
export type FolhaFunc = { func: FuncPonto; cpf: string; pis: string; jornada: string | null; folha: FolhaMontada; totais: TotaisPeriodo; empresa: EmpresaFolha | null };

/** Uma folha por colaborador (todos da filial ou só o escolhido), com a apuração do módulo no período. */
export async function montarFolhasAssinatura(p: ParamsFolha): Promise<{ empresa: EmpresaFolha | null; folhas: FolhaFunc[] }> {
  if (!p.filial) return { empresa: null, folhas: [] };
  const [empresa, lista] = await Promise.all([empresaDaFilial(p.filial), colaboradoresDaFolha(p.filial, p.de)]);
  const funcs = p.funcionario ? lista.filter((f) => f.id === p.funcionario) : lista;
  if (!funcs.length) return { empresa, folhas: [] };
  const [aps, docs] = await Promise.all([apurar(funcs, p.de, p.ate), documentos(funcs.map((f) => f.id))]);
  // quem bate o ponto aqui mas é registrado em outra filial: o cabeçalho leva a empresa/CNPJ da filial da folha
  const outras = [...new Set([...docs.values()].map((d) => d.filialFolha).filter((b) => b !== p.filial))];
  const empresas = new Map(await Promise.all(outras.map(async (b) => [b, await empresaDaFilial(b)] as const)));
  return {
    empresa,
    folhas: aps.map((a) => {
      const doc = docs.get(a.func.id);
      return {
        func: a.func,
        cpf: doc?.cpf ?? "",
        pis: doc?.pis ?? "",
        jornada: a.jornadaAtual,
        folha: montarFolha(a.dias, a.totais),
        totais: a.totais,
        empresa: (doc && empresas.get(doc.filialFolha)) ?? null,
      };
    }),
  };
}
