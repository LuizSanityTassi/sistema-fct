// Leitura da planilha "RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO" que a contabilidade devolve (uma por CNPJ),
// para tirar dela só os CÓDIGOS — os valores são ignorados (os do sistema é que valem). Na Domínio cada CNPJ tem os
// seus próprios códigos de evento ("Feriado trabalhado" é 259 numa filial, 261 noutra, 202 noutra) e a sua ordem de
// colunas; daqui saem: código da empresa, CNPJ, as colunas de evento (rótulo + código, na ordem) e o código de cada
// funcionário. Puro (recebe a matriz da aba, linhas × colunas).

export type ColunaContabilidade = {
  /** posição da coluna de evento: 1 = a 1ª depois de "Função" (coluna E) */
  coluna: number;
  rotulo: string;
  codigo: number;
  /** evento do sistema que vai nessa coluna (null = coluna que a contabilidade tem e o sistema não usa) */
  chave: string | null;
};

export type PlanilhaContabilidade = {
  codigoEmpresa: number | null;
  razaoSocial: string | null;
  /** só dígitos */
  cnpj: string | null;
  colunas: ColunaContabilidade[];
  funcionarios: { codigo: string; nome: string; funcao: string }[];
};

const sem = (t: unknown) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Evento do sistema pelo rótulo da coluna. "Outros Eventos" com código 9999 é o "outros" do sistema; a outra coluna de
 * outros (999, sempre vazia nas planilhas de 09/2026) e "Horas Extras 110%" não têm evento no sistema.
 */
export function chaveDoRotulo(rotulo: string, codigo: number): string | null {
  const t = sem(rotulo);
  const he = /horas? extras?\s*(\d+)\s*%/.exec(t);
  if (he) return ({ "50": "he50", "60": "he60", "75": "he75", "100": "he100" } as Record<string, string>)[he[1]] ?? null;
  if (/notur/.test(t)) return "adc_noturno";
  if (/feriado/.test(t)) return "feriado";
  if (/domingo/.test(t)) return "domingo";
  if (/falta/.test(t)) return "faltas_parciais";
  if (/comiss/.test(t)) return "comissoes";
  if (/farmac/.test(t)) return "farmacia";
  if (/quebra/.test(t)) return "quebra_caixa";
  if (/vale.?transp/.test(t)) return "vale_transporte";
  if (/adiant/.test(t)) return "adiantamento";
  if (/consign/.test(t)) return "consignado";
  if (/outros/.test(t)) return codigo === 9999 ? "outros" : null;
  return null;
}

/** Lê a 1ª aba da planilha da contabilidade (matriz como o SheetJS devolve com header:1, raw:true, blankrows:true). */
export function lerPlanilhaContabilidade(matriz: unknown[][]): PlanilhaContabilidade {
  const rotuloLinha = (re: RegExp) => matriz.find((r) => Array.isArray(r) && re.test(sem(r[0])));
  const valorDe = (r: unknown[] | undefined) => (r ? r.slice(1).find((c) => c !== null && c !== undefined && String(c).trim() !== "") : undefined);
  const cod = valorDe(rotuloLinha(/^codigo empresa/));
  const razao = valorDe(rotuloLinha(/^razao social/));
  const cnpj = valorDe(rotuloLinha(/^inscricao/));
  const iCab = matriz.findIndex((r) => Array.isArray(r) && /^tipo de/.test(sem(r[0])));
  const colunas: ColunaContabilidade[] = [];
  const funcionarios: PlanilhaContabilidade["funcionarios"] = [];
  if (iCab >= 0) {
    const rotulos = matriz[iCab] ?? [];
    const codigos = matriz[iCab + 1] ?? [];
    for (let c = 4; c < Math.max(rotulos.length, codigos.length); c++) {
      const rotulo = String(rotulos[c] ?? "").replace(/\s+/g, " ").trim();
      const codigo = Number(codigos[c]);
      if (!rotulo || !Number.isInteger(codigo) || codigo <= 0) continue;
      colunas.push({ coluna: colunas.length + 1, rotulo, codigo, chave: chaveDoRotulo(rotulo, codigo) });
    }
    for (let i = iCab + 2; i < matriz.length; i++) {
      const r = matriz[i] ?? [];
      if (/^(s|total)$/.test(sem(r[0]))) break;
      const nome = String(r[2] ?? "").replace(/\s+/g, " ").trim();
      if (!nome) continue;
      funcionarios.push({ codigo: String(r[1] ?? "").trim(), nome, funcao: String(r[3] ?? "").replace(/\s+/g, " ").trim() });
    }
  }
  return {
    codigoEmpresa: Number.isInteger(Number(cod)) && Number(cod) > 0 ? Number(cod) : null,
    razaoSocial: razao ? String(razao).trim() : null,
    cnpj: cnpj ? String(cnpj).replace(/\D/g, "") || null : null,
    colunas,
    funcionarios,
  };
}
