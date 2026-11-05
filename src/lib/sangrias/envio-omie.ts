// Envio das sangrias conferidas ao Omie (servidor). Para cada empresa: lê os departamentos e as sangrias já lançadas no
// Omie, confere uma a uma (conferirSangriaNoOmie) e só lança a que não está lá. O que acontece fica na própria sangria
// (omie_*): lançada, barrada por duplicidade, parecida ou erro. Quem chama precisa ser do financeiro ou administrador:
// o banco só deixa esse perfil gravar os campos do Omie.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chavesOmie,
  consultarContaReceber,
  departamentoPorPrefixo,
  EMPRESAS_OMIE,
  gravarContaReceber,
  listarContasReceberDoCliente,
  listarDepartamentosOmie,
  normOmie,
  type EmpresaOmie,
} from "@/lib/conciliacao/omie-api";
import type { Database } from "@/lib/supabase/types";
import { codigoIntegracaoSangria, conferirSangriaNoOmie, dataOmie, lancamentoDaSangria, SANGRIA_NO_OMIE, type TituloSangriaOmie } from "./omie";

type Cliente = SupabaseClient<Database>;
type Quem = { id: string; nome: string };

/** Por chamada: cada lançamento leva 1 a 2 segundos no Omie. O resto fica para o próximo "Enviar ao Omie". */
export const MAX_SANGRIAS_POR_ENVIO = 40;
/**
 * O botão da leva só pega o que foi cadastrado no portal a partir daqui (a 1ª loja começa em 06/11/2026). As cadastradas
 * antes (testes de 27/10) só vão se o financeiro mandar uma a uma, na própria sangria.
 */
export const INICIO_SANGRIAS_NO_OMIE = "2026-11-06T00:00:00-03:00";
const PRAZO_MS = 240_000;
/** Quantos dias antes do depósito mais antigo procurar sangrias já lançadas (pela data de registro no Omie). */
const DIAS_ANTES = 7;

export type ResultadoSangria =
  | { tipo: "lancada"; codigo: string }
  | { tipo: "ja_estava"; codigo: string }
  | { tipo: "barrada" | "parecida"; codigo: string; motivo: string }
  | { tipo: "erro"; motivo: string };

const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (iso: string, dias: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Empresa no Omie pela empresa do cadastro da filial. */
export function empresaDaOrganizacao(nome: string | null | undefined): EmpresaOmie | null {
  const n = normOmie(nome);
  return n === "VARELA" ? "varela" : n === "NAZARIO" ? "nazario" : null;
}

type SangriaLida = {
  id: string;
  conta_id: string;
  conta_apelido: string;
  data_retirada: string;
  data_deposito: string;
  numero_deposito: string | null;
  valor: number;
  situacao: string;
  omie_codigo: number | null;
  omie_sugerido: number | null;
  conferida_por_nome: string | null;
  filial: { codigo: string; organizacao: { nome_fantasia: string | null } | null } | null;
};

async function lerSangrias(supabase: Cliente, ids: string[]) {
  const { data, error } = await supabase
    .from("caixa_sangrias")
    .select(
      "id, conta_id, conta_apelido, data_retirada, data_deposito, numero_deposito, valor, situacao, omie_codigo, omie_sugerido, conferida_por_nome, filial:branches!caixa_sangrias_branch_id_fkey(codigo, organizacao:organizations(nome_fantasia))",
    )
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SangriaLida[];
}

async function marcarNoOmie(supabase: Cliente, id: string, emp: EmpresaOmie, codigo: string, vinculada: boolean, quem: Quem) {
  const { error } = await supabase
    .from("caixa_sangrias")
    .update({ omie_empresa: emp, omie_codigo: Number(codigo), omie_vinculada: vinculada, omie_enviado_em: new Date().toISOString(), omie_enviado_por_nome: quem.nome, omie_situacao: null, omie_mensagem: null, omie_sugerido: null })
    .eq("id", id)
    .is("omie_codigo", null);
  if (error) throw new Error(`lançada no Omie (${codigo}), mas não consegui marcar no portal: ${error.message}. Envie de novo: o portal reconhece o lançamento e só marca.`);
}

async function anotarFalha(supabase: Cliente, id: string, situacao: "barrada" | "parecida" | "erro", motivo: string, sugerido?: string) {
  await supabase
    .from("caixa_sangrias")
    .update({ omie_situacao: situacao, omie_mensagem: motivo.slice(0, 1000), omie_sugerido: sugerido ? Number(sugerido) : null })
    .eq("id", id)
    .is("omie_codigo", null);
}

/**
 * Lança no Omie as sangrias conferidas e ainda não lançadas (no máximo MAX_SANGRIAS_POR_ENVIO). `mesmoParecida` lança
 * também a que só é parecida com outra do Omie (o financeiro conferiu e mandou); a duplicada nunca sobe.
 */
export async function enviarSangriasAoOmie(supabase: Cliente, ids: string[], quem: Quem, opcoes: { mesmoParecida?: boolean } = {}) {
  const porId = new Map<string, ResultadoSangria>();
  const prazo = Date.now() + PRAZO_MS;
  const hoje = hojeBrasil();
  const lidas = (await lerSangrias(supabase, ids.slice(0, MAX_SANGRIAS_POR_ENVIO))).filter((s) => s.situacao === "conferida" && s.omie_codigo == null);

  const falhar = async (s: SangriaLida, r: Extract<ResultadoSangria, { tipo: "barrada" | "parecida" | "erro" }>) => {
    porId.set(s.id, r);
    await anotarFalha(supabase, s.id, r.tipo, r.motivo, "codigo" in r ? r.codigo : undefined);
  };

  const porEmpresa = new Map<EmpresaOmie, SangriaLida[]>();
  for (const s of lidas) {
    const emp = empresaDaOrganizacao(s.filial?.organizacao?.nome_fantasia);
    if (!emp) {
      await falhar(s, { tipo: "erro", motivo: `a filial ${s.filial?.codigo ?? "?"} não é da Varela nem da Nazário no cadastro` });
      continue;
    }
    porEmpresa.set(emp, [...(porEmpresa.get(emp) ?? []), s]);
  }

  const contaIds = [...new Set(lidas.map((s) => s.conta_id))];
  const { data: contas } = contaIds.length ? await supabase.from("fin_contas_bancarias").select("id, omie_varela, omie_nazario").in("id", contaIds) : { data: [] };
  const contaOmie = new Map((contas ?? []).map((c) => [c.id, c]));

  for (const [emp, grupo] of porEmpresa) {
    const nomeEmp = EMPRESAS_OMIE[emp];
    const ch = await chavesOmie(supabase, emp);
    if (!ch) {
      for (const s of grupo) await falhar(s, { tipo: "erro", motivo: `as chaves do Omie da ${nomeEmp} não estão configuradas (Administração → Integrações)` });
      continue;
    }
    let deps: Awaited<ReturnType<typeof listarDepartamentosOmie>>;
    let titulos: TituloSangriaOmie[];
    try {
      deps = await listarDepartamentosOmie(ch, emp);
      const maisAntigo = grupo.map((s) => s.data_deposito).sort()[0];
      titulos = await listarContasReceberDoCliente(ch, emp, SANGRIA_NO_OMIE[emp].cliente, dataOmie(somarDias(maisAntigo, -DIAS_ANTES)), dataOmie(hoje));
    } catch (e) {
      // sem conseguir conferir o que já está no Omie, nada sobe
      for (const s of grupo) await falhar(s, { tipo: "erro", motivo: `não consegui conferir no Omie da ${nomeEmp}: ${mensagem(e)}` });
      continue;
    }

    for (const s of grupo) {
      if (Date.now() > prazo) {
        await falhar(s, { tipo: "erro", motivo: "não deu tempo nesta leva: clique em Enviar ao Omie de novo" });
        continue;
      }
      const codigoFilial = s.filial?.codigo ?? "";
      const dep = departamentoPorPrefixo(deps, codigoFilial);
      if (!dep) {
        await falhar(s, { tipo: "erro", motivo: `a filial ${codigoFilial} não tem departamento no Omie da ${nomeEmp}` });
        continue;
      }
      const c = contaOmie.get(s.conta_id);
      const contaCorrente = emp === "varela" ? c?.omie_varela : c?.omie_nazario;
      if (!contaCorrente) {
        await falhar(s, { tipo: "erro", motivo: `o banco ${s.conta_apelido} não tem conta no Omie da ${nomeEmp} (Financeiro → Carteira)` });
        continue;
      }
      const valor = Number(s.valor);
      const conf = conferirSangriaNoOmie({ id: s.id, deposito: s.data_deposito, valor, departamento: dep.codigo }, titulos);
      try {
        if (conf.tipo === "ja_enviada") {
          await marcarNoOmie(supabase, s.id, emp, conf.codigo, false, quem);
          porId.set(s.id, { tipo: "ja_estava", codigo: conf.codigo });
          continue;
        }
        if (conf.tipo === "duplicada") {
          await falhar(s, { tipo: "barrada", codigo: conf.codigo, motivo: conf.motivo });
          continue;
        }
        if (conf.tipo === "parecida" && !opcoes.mesmoParecida) {
          await falhar(s, { tipo: "parecida", codigo: conf.codigo, motivo: conf.motivo });
          continue;
        }
        const lanc = lancamentoDaSangria({
          id: s.id,
          empresa: emp,
          contaCorrente: Number(contaCorrente),
          departamento: dep.codigo,
          deposito: s.data_deposito,
          retirada: s.data_retirada,
          valor,
          numeroDeposito: s.numero_deposito,
          filial: `${codigoFilial}`,
          conferidaPor: s.conferida_por_nome,
          hoje,
        });
        const codigo = await gravarContaReceber(ch, emp, lanc);
        // a próxima da mesma leva já enxerga esta (duas iguais na mesma leva: a segunda é barrada)
        titulos.push({ codigo, integracao: codigoIntegracaoSangria(s.id), vencimento: dataOmie(s.data_deposito), valor, departamento: dep.codigo, status: "A VENCER" });
        await marcarNoOmie(supabase, s.id, emp, codigo, false, quem);
        porId.set(s.id, { tipo: "lancada", codigo });
      } catch (e) {
        await falhar(s, { tipo: "erro", motivo: mensagem(e) });
        if (/bloqueada/i.test(mensagem(e))) break;
      }
      await dormir(300);
    }
  }
  return porId;
}

/**
 * Liga a sangria ao lançamento que já está no Omie (o que a conferência achou igual), sem lançar outro. Confere de novo
 * no Omie: tem de ser sangria (Cliente Sangrias), da mesma filial, com o mesmo valor e não cancelada.
 */
export async function vincularSangriaAoOmie(supabase: Cliente, id: string, quem: Quem): Promise<ResultadoSangria> {
  const [s] = await lerSangrias(supabase, [id]);
  if (!s) return { tipo: "erro", motivo: "sangria não encontrada" };
  if (s.situacao !== "conferida" || s.omie_codigo != null) return { tipo: "erro", motivo: "só dá para ligar uma sangria conferida que ainda não está no Omie" };
  if (!s.omie_sugerido) return { tipo: "erro", motivo: "a conferência não achou lançamento igual no Omie para ligar" };
  const emp = empresaDaOrganizacao(s.filial?.organizacao?.nome_fantasia);
  if (!emp) return { tipo: "erro", motivo: "a filial não é da Varela nem da Nazário no cadastro" };
  const ch = await chavesOmie(supabase, emp);
  if (!ch) return { tipo: "erro", motivo: `as chaves do Omie da ${EMPRESAS_OMIE[emp]} não estão configuradas` };
  try {
    const [deps, t] = await Promise.all([listarDepartamentosOmie(ch, emp), consultarContaReceber(ch, emp, Number(s.omie_sugerido))]);
    const dep = departamentoPorPrefixo(deps, s.filial?.codigo ?? "");
    const problema =
      t.cliente !== SANGRIA_NO_OMIE[emp].cliente
        ? "o lançamento do Omie não é do Cliente Sangrias"
        : t.status === "CANCELADO"
          ? "o lançamento do Omie está cancelado"
          : !dep || t.departamento !== dep.codigo
            ? "o lançamento do Omie é de outra filial"
            : Math.abs(t.valor - Number(s.valor)) >= 0.005
              ? "o valor do lançamento do Omie é diferente"
              : null;
    if (problema) return { tipo: "erro", motivo: problema };
    await marcarNoOmie(supabase, s.id, emp, t.codigo, true, quem);
    return { tipo: "ja_estava", codigo: t.codigo };
  } catch (e) {
    return { tipo: "erro", motivo: mensagem(e) };
  }
}

/** Frase curta para a tela, a partir dos resultados. */
export function resumoDoEnvio(porId: Map<string, ResultadoSangria>) {
  const conta = (t: ResultadoSangria["tipo"]) => [...porId.values()].filter((r) => r.tipo === t).length;
  const partes = [
    conta("lancada") && `${conta("lancada")} lançada(s) no Omie`,
    conta("ja_estava") && `${conta("ja_estava")} já estava(m) lá (só marquei)`,
    conta("barrada") && `${conta("barrada")} barrada(s): já existe igual no Omie`,
    conta("parecida") && `${conta("parecida")} parecida(s) com outra do Omie, à espera da sua decisão`,
    conta("erro") && `${conta("erro")} com erro`,
  ].filter(Boolean);
  return { texto: partes.join(" · "), problemas: conta("barrada") + conta("parecida") + conta("erro") };
}
