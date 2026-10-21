// Monta as planilhas da contabilidade de uma competência (só servidor): um .xls por CNPJ com os funcionários
// registrados nele e os eventos que têm código da Domínio.
import { arquivoDaFilial, codigoEmpresaDaPlanilha, razaoSocialDaPlanilha, type DadosCompetencia, type FilialFolha } from "@/lib/data/lancamentos-folha";
import { CHAVE_QUEBRA_CAIXA, matriculaPlanilha, ordenarPorMatricula } from "./lancamentos";
import { gerarPlanilhaDominio, type ColunaEvento } from "./planilha-dominio";

export type PlanilhaGerada = {
  filial: FilialFolha;
  arquivo: string;
  funcionarios: number;
  /** valores lançados em eventos que não saem na planilha (sem código da Domínio) */
  foraDaPlanilha: number;
  /** código da empresa = número da filial no CNPJ (sem o código da Domínio cadastrado) */
  codigoProvisorio: boolean;
  buffer: Buffer | null;
  erro: string | null;
};

export function colunasDaPlanilha(dados: DadosCompetencia): ColunaEvento[] {
  return dados.eventos
    .filter((e) => e.ativo && e.naPlanilha && e.codigo !== null)
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => ({ id: e.id, codigo: e.codigo!, nome: e.nome }));
}

export function gerarPlanilhas(dados: DadosCompetencia, filtro: { branchId?: string; raiz?: string }): PlanilhaGerada[] {
  const colunas = colunasDaPlanilha(dados);
  const naPlanilha = new Set(colunas.map((c) => c.id));
  const chavePorId = new Map(dados.eventos.map((e) => [e.id, e.chave]));
  const saida: PlanilhaGerada[] = [];
  for (const filial of dados.filiais) {
    if (filtro.branchId && filial.id !== filtro.branchId) continue;
    if (filtro.raiz && filial.raiz !== filtro.raiz) continue;
    const funcionarios = ordenarPorMatricula(
      dados.funcionarios.filter((f) => f.branchPlanilha === filial.id && (f.ativoNoMes || Object.values(dados.valores.get(f.id) ?? {}).some((v) => v > 0))),
    );
    if (funcionarios.length === 0) continue;
    const arquivo = arquivoDaFilial(filial, dados.competencia);
    let foraDaPlanilha = 0;
    for (const f of funcionarios) for (const [ev, v] of Object.entries(dados.valores.get(f.id) ?? {})) if (v > 0 && !naPlanilha.has(ev)) foraDaPlanilha++;
    const codigo = codigoEmpresaDaPlanilha(filial);
    const base = { filial, arquivo, funcionarios: funcionarios.length, foraDaPlanilha, codigoProvisorio: codigo.provisorio };
    if (!filial.cnpj || codigo.codigo === null) {
      saida.push({ ...base, buffer: null, erro: "filial sem CNPJ no cadastro" });
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = gerarPlanilhaDominio({
      codigoEmpresa: codigo.codigo,
      razaoSocial: razaoSocialDaPlanilha(filial),
      cnpj: filial.cnpj,
      competencia: dados.competencia,
      eventos: colunas,
      linhas: funcionarios.map((f) => ({
        matricula: matriculaPlanilha(f.matricula),
        nome: f.nome.toUpperCase(),
        funcao: f.funcao,
        valores: Object.fromEntries(Object.entries(dados.valores.get(f.id) ?? {}).filter(([ev]) => !(f.semQuebra && chavePorId.get(ev) === CHAVE_QUEBRA_CAIXA))),
      })),
      });
    } catch (e) {
      saida.push({ ...base, buffer: null, erro: e instanceof Error ? e.message : String(e) });
      continue;
    }
    saida.push({ ...base, buffer, erro: null });
  }
  return saida;
}
