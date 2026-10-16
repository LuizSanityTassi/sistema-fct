// Respostas das perguntas prontas (só servidor). Cada uma lê pelo client do usuário (RLS) e agrega aqui, porque o
// PostgREST não soma; o resultado é um Relatorio (mesma tabela e CSV dos Relatórios). `_href` em uma linha vira link
// na tela e não vai para a planilha.
import type { Sessao } from "@/lib/auth/session";
import { PRIORIDADE_LABEL } from "@/lib/chamados/rotulos";
import { PROBLEMA_LABEL, type Problema } from "@/lib/conciliacao/rotulos";
import { podeAcessar } from "@/lib/nav";
import { perguntaPorId, type Pergunta } from "@/lib/perguntas/catalogo";
import type { Linha, Relatorio } from "@/lib/relatorios/csv";
import { competenciaAtual, rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import { STATUS_LABEL } from "@/lib/rh/rotulos";
import { createClient } from "@/lib/supabase/server";
import { STATUS_ATIVO_LABEL, TIPO_ATIVO_LABEL } from "@/lib/ti/rotulos";

type Cliente = Awaited<ReturnType<typeof createClient>>;
export type FiltrosPergunta = { mes?: string; filial?: string };
export type Resposta = { pergunta: Pergunta; relatorio: Relatorio; mes: string | null; nota?: string | null };

const r2 = (v: number) => Math.round(v * 100) / 100;
const hojeBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
const fimDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const ehMes = (v: string | undefined): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const ehUuid = (v: string | undefined): v is string => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Todas as páginas de uma consulta (o PostgREST devolve até 1000 por vez). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 30_000) {
  const out: T[] = [];
  for (let de = 0; de < max; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function unidades(supabase: Cliente) {
  const { data } = await supabase.from("branches").select("id, codigo, nome");
  const mapa = new Map((data ?? []).map((b) => [b.id, b]));
  return (id: string | null | undefined) => (id ? mapa.get(id) : undefined);
}

function somarPor<T>(lista: T[], chave: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of lista) m.set(chave(x), [...(m.get(chave(x)) ?? []), x]);
  return m;
}

const totalDe = (linhas: Linha[], colunas: string[], rotulo: string, chaveRotulo: string): Linha => {
  const t: Linha = { [chaveRotulo]: rotulo };
  for (const c of colunas) t[c] = r2(linhas.reduce((s, l) => s + Number(l[c] ?? 0), 0));
  return t;
};

// ---------- caixa ----------

async function quebrasPorLoja(supabase: Cliente, mes: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  const linhas = await todas<{ branch_id: string; diferenca: number; valor_quebra: number }>((de, ate) =>
    supabase.from("caixa_diferencas").select("branch_id, diferenca, valor_quebra").eq("classe", "quebra").gte("dia", `${mes}-01`).lte("dia", fimDoMes(mes)).range(de, ate),
  );
  const out: Linha[] = [...somarPor(linhas, (l) => l.branch_id)].map(([id, ls]) => ({
    loja: un(id)?.codigo ?? "—",
    nome: un(id)?.nome ?? "",
    quebras: ls.length,
    faltas: ls.filter((l) => Number(l.diferenca) > 0).length,
    sobras: ls.filter((l) => Number(l.diferenca) < 0).length,
    valor: r2(ls.reduce((s, l) => s + Number(l.valor_quebra), 0)),
    _href: `/financeiro/diferenca-caixa?filial=${id}&situacao=quebra`,
  }));
  out.sort((a, b) => Number(b.valor) - Number(a.valor));
  return {
    titulo: `Quebras de caixa por loja · ${rotuloCompetencia(mes)}`,
    colunas: [
      { chave: "loja", titulo: "Loja" },
      { chave: "nome", titulo: "Nome" },
      { chave: "quebras", titulo: "Quebras", tipo: "inteiro" },
      { chave: "faltas", titulo: "Faltas", tipo: "inteiro" },
      { chave: "sobras", titulo: "Sobras", tipo: "inteiro" },
      { chave: "valor", titulo: "Valor", tipo: "moeda" },
    ],
    linhas: out,
    totais: out.length ? totalDe(out, ["quebras", "faltas", "sobras", "valor"], "Total", "loja") : undefined,
  };
}

async function quebrasPorOperador(supabase: Cliente, mes: string, filial?: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  let q = supabase.from("caixa_diferencas").select("branch_id, cod_operador, nome_operador, diferenca, valor_quebra").eq("classe", "quebra").gte("dia", `${mes}-01`).lte("dia", fimDoMes(mes));
  if (filial) q = q.eq("branch_id", filial);
  const linhas = await todas<{ branch_id: string; cod_operador: number | null; nome_operador: string | null; diferenca: number; valor_quebra: number }>((de, ate) => q.range(de, ate));
  const out: Linha[] = [...somarPor(linhas, (l) => `${l.cod_operador ?? ""}|${l.nome_operador ?? "manual"}`)].map(([, ls]) => ({
    operador: ls[0].nome_operador ?? "Lançada à mão",
    codigo: ls[0].cod_operador,
    lojas: [...new Set(ls.map((l) => un(l.branch_id)?.codigo ?? "—"))].sort().join(", "),
    quebras: ls.length,
    faltas: r2(ls.filter((l) => Number(l.diferenca) > 0).reduce((s, l) => s + Number(l.valor_quebra), 0)),
    sobras: r2(ls.filter((l) => Number(l.diferenca) < 0).reduce((s, l) => s + Number(l.valor_quebra), 0)),
    valor: r2(ls.reduce((s, l) => s + Number(l.valor_quebra), 0)),
  }));
  out.sort((a, b) => Number(b.valor) - Number(a.valor));
  return {
    titulo: `Quebras por operador · ${rotuloCompetencia(mes)}`,
    colunas: [
      { chave: "operador", titulo: "Operador" },
      { chave: "codigo", titulo: "Cód. Trier", tipo: "inteiro" },
      { chave: "lojas", titulo: "Loja(s)" },
      { chave: "quebras", titulo: "Quebras", tipo: "inteiro" },
      { chave: "faltas", titulo: "Faltas (R$)", tipo: "moeda" },
      { chave: "sobras", titulo: "Sobras (R$)", tipo: "moeda" },
      { chave: "valor", titulo: "Total", tipo: "moeda" },
    ],
    linhas: out,
    totais: out.length ? totalDe(out, ["quebras", "faltas", "sobras", "valor"], "Total", "operador") : undefined,
  };
}

async function quebrasSemJustificativa(supabase: Cliente, financeiro: boolean, filial?: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  const hoje = hojeBr();
  let q = supabase.from("caixa_diferencas").select("id, branch_id, dia, numero_caixa, nome_operador, diferenca, valor_quebra").eq("classe", "quebra").eq("andamento", "pendente").order("dia");
  if (filial) q = q.eq("branch_id", filial);
  const linhas = await todas<{ id: string; branch_id: string; dia: string; numero_caixa: number | null; nome_operador: string | null; diferenca: number; valor_quebra: number }>((de, ate) =>
    q.range(de, ate),
  );
  const out: Linha[] = linhas.map((l) => ({
    dia: l.dia,
    loja: un(l.branch_id)?.codigo ?? "—",
    caixa: l.numero_caixa,
    operador: l.nome_operador ?? "Lançada à mão",
    tipo: Number(l.diferenca) > 0 ? "Falta" : "Sobra",
    valor: r2(Number(l.valor_quebra)),
    dias: diasEntre(l.dia, hoje),
    _href: financeiro ? `/financeiro/diferenca-caixa/${l.id}` : "/caixa",
  }));
  return {
    titulo: "Quebras esperando justificativa",
    colunas: [
      { chave: "dia", titulo: "Dia", tipo: "data" },
      { chave: "loja", titulo: "Loja" },
      { chave: "caixa", titulo: "Caixa", tipo: "inteiro" },
      { chave: "operador", titulo: "Operador" },
      { chave: "tipo", titulo: "Tipo" },
      { chave: "valor", titulo: "Valor", tipo: "moeda" },
      { chave: "dias", titulo: "Dias em aberto", tipo: "inteiro" },
    ],
    linhas: out,
    totais: out.length ? { dia: `${out.length} quebra(s)`, valor: r2(out.reduce((s, l) => s + Number(l.valor), 0)) } : undefined,
  };
}

// ---------- conciliação ----------

async function pendenciasPorFornecedor(supabase: Cliente): Promise<Relatorio> {
  const linhas = await todas<{ beneficiario: string | null; cnpj: string | null; valor: number; vencimento: string | null }>((de, ate) =>
    supabase.from("conc_pendencias").select("beneficiario, cnpj, valor, vencimento").in("status", ["pendente", "em_analise"]).range(de, ate),
  );
  const out: Linha[] = [...somarPor(linhas, (l) => (l.beneficiario ?? "—").trim().toUpperCase())].map(([nome, ls]) => {
    const vencs = ls
      .map((l) => l.vencimento)
      .filter((v): v is string => !!v)
      .sort();
    return {
      fornecedor: nome,
      cnpj: ls.find((l) => l.cnpj)?.cnpj ?? "",
      pendencias: ls.length,
      valor: r2(ls.reduce((s, l) => s + Number(l.valor), 0)),
      vencimento: vencs[0] ?? null,
      _href: `/conciliacao/pendencias?q=${encodeURIComponent(nome.slice(0, 60))}`,
    };
  });
  out.sort((a, b) => Number(b.pendencias) - Number(a.pendencias) || Number(b.valor) - Number(a.valor));
  return {
    titulo: "Pendências em aberto por fornecedor",
    colunas: [
      { chave: "fornecedor", titulo: "Fornecedor / beneficiário" },
      { chave: "cnpj", titulo: "CNPJ" },
      { chave: "pendencias", titulo: "Pendências", tipo: "inteiro" },
      { chave: "valor", titulo: "Valor", tipo: "moeda" },
      { chave: "vencimento", titulo: "Vencimento mais antigo", tipo: "data" },
    ],
    linhas: out,
    totais: out.length ? totalDe(out, ["pendencias", "valor"], "Total", "fornecedor") : undefined,
  };
}

async function pendenciasVencendo(supabase: Cliente, filial?: string): Promise<Relatorio> {
  const hoje = hojeBr();
  let q = supabase
    .from("conc_pendencias")
    .select("beneficiario, documento, filial, problema, valor, vencimento, status")
    .in("status", ["pendente", "em_analise"])
    .lte("vencimento", somarDias(hoje, 7))
    .order("vencimento");
  if (filial) q = q.eq("branch_id", filial);
  const linhas = await todas<{ beneficiario: string | null; documento: string | null; filial: number | null; problema: string; valor: number; vencimento: string | null; status: string }>((de, ate) =>
    q.range(de, ate),
  );
  const out: Linha[] = linhas.filter((l): l is typeof l & { vencimento: string } => !!l.vencimento).map((l) => {
    const d = diasEntre(hoje, l.vencimento);
    return {
      vencimento: l.vencimento,
      situacao: d < 0 ? `vencida há ${-d} dia(s)` : d === 0 ? "vence hoje" : `vence em ${d} dia(s)`,
      filial: l.filial != null ? `F${String(l.filial).padStart(3, "0")}` : "—",
      fornecedor: l.beneficiario ?? "—",
      documento: l.documento ?? "",
      problema: PROBLEMA_LABEL[l.problema as Problema] ?? l.problema,
      valor: r2(Number(l.valor)),
      _href: `/conciliacao/pendencias?q=${encodeURIComponent((l.beneficiario ?? "").slice(0, 60))}`,
    };
  });
  return {
    titulo: "Pendências vencidas ou vencendo em 7 dias",
    colunas: [
      { chave: "vencimento", titulo: "Vencimento", tipo: "data" },
      { chave: "situacao", titulo: "Situação" },
      { chave: "filial", titulo: "Filial" },
      { chave: "fornecedor", titulo: "Fornecedor / beneficiário" },
      { chave: "documento", titulo: "Documento" },
      { chave: "problema", titulo: "Divergência" },
      { chave: "valor", titulo: "Valor", tipo: "moeda" },
    ],
    linhas: out,
    totais: out.length ? { vencimento: `${out.length} pendência(s)`, valor: r2(out.reduce((s, l) => s + Number(l.valor), 0)) } : undefined,
  };
}

async function enviadoOmie(supabase: Cliente, mes: string): Promise<Relatorio> {
  const linhas = await todas<{ empresa: string | null; via: string; valor: number | null }>((de, ate) =>
    supabase
      .from("conc_enviados_omie")
      .select("empresa, via, valor")
      .is("desfeito_em", null)
      .gte("enviado_em", `${mes}-01T00:00:00-03:00`)
      .lte("enviado_em", `${fimDoMes(mes)}T23:59:59.999-03:00`)
      .range(de, ate),
  );
  const nomeEmpresa = (e: string | null) => (e === "nazario" ? "Nazário" : e === "varela" ? "Varela" : "Sem empresa");
  const out: Linha[] = [...somarPor(linhas, (l) => `${l.empresa ?? ""}|${l.via}`)].map(([, ls]) => ({
    empresa: nomeEmpresa(ls[0].empresa),
    via: ls[0].via === "api" ? "API" : "Planilha",
    contas: ls.length,
    valor: r2(ls.reduce((s, l) => s + Number(l.valor ?? 0), 0)),
  }));
  out.sort((a, b) => String(a.empresa).localeCompare(String(b.empresa)) || String(a.via).localeCompare(String(b.via)));
  return {
    titulo: `Enviado ao Omie · ${rotuloCompetencia(mes)}`,
    colunas: [
      { chave: "empresa", titulo: "Empresa" },
      { chave: "via", titulo: "Como" },
      { chave: "contas", titulo: "Contas", tipo: "inteiro" },
      { chave: "valor", titulo: "Valor", tipo: "moeda" },
    ],
    linhas: out,
    totais: out.length ? totalDe(out, ["contas", "valor"], "Total", "empresa") : undefined,
  };
}

// ---------- financeiro ----------

/** Mês pedido ou, sem pedido, o último com lançamentos. */
async function mesFinanceiro(supabase: Cliente, pedido: string | undefined) {
  if (pedido) return pedido;
  const { data } = await supabase.from("fin_resumo_mensal").select("competencia").order("competencia", { ascending: false }).limit(1).maybeSingle();
  return data?.competencia?.trim() || competenciaAtual();
}

async function resultadoPorLoja(supabase: Cliente, mes: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  const linhas = await todas<{ branch_id: string | null; tipo: "receber" | "pagar" | null; total: number | null }>((de, ate) =>
    supabase.from("fin_resumo_mensal").select("branch_id, tipo, total").eq("competencia", mes).range(de, ate),
  );
  const out: Linha[] = [...somarPor(linhas, (l) => l.branch_id ?? "")].map(([id, ls]) => {
    const rec = ls.filter((l) => l.tipo === "receber").reduce((s, l) => s + Number(l.total ?? 0), 0);
    const desp = ls.filter((l) => l.tipo === "pagar").reduce((s, l) => s + Number(l.total ?? 0), 0);
    return { loja: un(id)?.codigo ?? "—", nome: un(id)?.nome ?? "", receitas: r2(rec), despesas: r2(desp), resultado: r2(rec - desp), _href: id ? `/filiais/${id}?aba=financeiro` : undefined };
  });
  out.sort((a, b) => Number(b.resultado) - Number(a.resultado));
  return {
    titulo: `Resultado por unidade · ${rotuloCompetencia(mes)}`,
    colunas: [
      { chave: "loja", titulo: "Unidade" },
      { chave: "nome", titulo: "Nome" },
      { chave: "receitas", titulo: "Receitas", tipo: "moeda" },
      { chave: "despesas", titulo: "Despesas", tipo: "moeda" },
      { chave: "resultado", titulo: "Resultado", tipo: "moeda" },
    ],
    linhas: out,
    totais: out.length ? totalDe(out, ["receitas", "despesas", "resultado"], "Total", "loja") : undefined,
  };
}

async function maioresDespesas(supabase: Cliente, mes: string, filial?: string): Promise<Relatorio> {
  let q = supabase.from("fin_resumo_categoria").select("categoria_id, qtd, total").eq("competencia", mes).eq("tipo", "pagar");
  if (filial) q = q.eq("branch_id", filial);
  const [linhas, { data: cats }] = await Promise.all([
    todas<{ categoria_id: string | null; qtd: number | null; total: number | null }>((de, ate) => q.range(de, ate)),
    supabase.from("fin_categorias").select("id, nome, grupo"),
  ]);
  const cat = new Map((cats ?? []).map((c) => [c.id, c]));
  const total = linhas.reduce((s, l) => s + Number(l.total ?? 0), 0);
  const out: Linha[] = [...somarPor(linhas, (l) => l.categoria_id ?? "")]
    .map(([id, ls]) => {
      const v = ls.reduce((s, l) => s + Number(l.total ?? 0), 0);
      return {
        categoria: cat.get(id)?.nome ?? "Sem categoria",
        grupo: cat.get(id)?.grupo ?? "",
        lancamentos: ls.reduce((s, l) => s + Number(l.qtd ?? 0), 0),
        valor: r2(v),
        pct: total ? r2((100 * v) / total) : 0,
      };
    })
    .sort((a, b) => Number(b.valor) - Number(a.valor))
    .slice(0, 25);
  return {
    titulo: `Maiores despesas por categoria · ${rotuloCompetencia(mes)}`,
    colunas: [
      { chave: "categoria", titulo: "Categoria" },
      { chave: "grupo", titulo: "Grupo" },
      { chave: "lancamentos", titulo: "Lançamentos", tipo: "inteiro" },
      { chave: "valor", titulo: "Valor", tipo: "moeda" },
      { chave: "pct", titulo: "% das despesas", tipo: "numero" },
    ],
    linhas: out,
    totais: total ? { categoria: "Total de despesas do mês", valor: r2(total) } : undefined,
  };
}

// ---------- pessoas ----------

async function funcionariosPorLoja(supabase: Cliente): Promise<Relatorio> {
  const un = await unidades(supabase);
  const linhas = await todas<{ branch_id: string; status: "ativo" | "afastado" | "ferias" | "desligado" }>((de, ate) =>
    supabase.from("employees").select("branch_id, status").neq("status", "desligado").range(de, ate),
  );
  const out: Linha[] = [...somarPor(linhas, (l) => l.branch_id)].map(([id, ls]) => ({
    loja: un(id)?.codigo ?? "—",
    nome: un(id)?.nome ?? "",
    ativos: ls.filter((l) => l.status === "ativo").length,
    afastados: ls.filter((l) => l.status === "afastado").length,
    ferias: ls.filter((l) => l.status === "ferias").length,
    total: ls.length,
    _href: `/rh/funcionarios?filial=${id}`,
  }));
  out.sort((a, b) => Number(b.total) - Number(a.total) || String(a.loja).localeCompare(String(b.loja)));
  return {
    titulo: "Funcionários por unidade",
    colunas: [
      { chave: "loja", titulo: "Unidade" },
      { chave: "nome", titulo: "Nome" },
      { chave: "ativos", titulo: "Ativos", tipo: "inteiro" },
      { chave: "afastados", titulo: "Afastados", tipo: "inteiro" },
      { chave: "ferias", titulo: "Férias", tipo: "inteiro" },
      { chave: "total", titulo: "Total", tipo: "inteiro" },
    ],
    linhas: out,
    totais: out.length ? totalDe(out, ["ativos", "afastados", "ferias", "total"], "Total", "loja") : undefined,
  };
}

async function movimentacaoDoMes(supabase: Cliente, mes: string, filial?: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  const ini = `${mes}-01`;
  const fim = fimDoMes(mes);
  type Func = { id: string; nome: string; cargo: string | null; branch_id: string; data_admissao: string | null; data_desligamento: string | null };
  const base = () => {
    let q = supabase.from("employees").select("id, nome, cargo, branch_id, data_admissao, data_desligamento");
    if (filial) q = q.eq("branch_id", filial);
    return q;
  };
  const [adm, desl] = await Promise.all([
    todas<Func>((de, ate) => base().gte("data_admissao", ini).lte("data_admissao", fim).range(de, ate)),
    todas<Func>((de, ate) => base().gte("data_desligamento", ini).lte("data_desligamento", fim).range(de, ate)),
  ]);
  const out: Linha[] = [
    ...adm.map((f) => ({ movimento: "Admissão", data: f.data_admissao, nome: f.nome, cargo: f.cargo ?? "", loja: un(f.branch_id)?.codigo ?? "—", _href: `/rh/funcionarios/${f.id}` })),
    ...desl.map((f) => ({ movimento: "Desligamento", data: f.data_desligamento, nome: f.nome, cargo: f.cargo ?? "", loja: un(f.branch_id)?.codigo ?? "—", _href: `/rh/funcionarios/${f.id}` })),
  ].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return {
    titulo: `Admissões e desligamentos · ${rotuloCompetencia(mes)}`,
    colunas: [
      { chave: "data", titulo: "Data", tipo: "data" },
      { chave: "movimento", titulo: "Movimento" },
      { chave: "nome", titulo: "Funcionário" },
      { chave: "cargo", titulo: "Cargo" },
      { chave: "loja", titulo: "Unidade" },
    ],
    linhas: out,
    totais: out.length ? { data: `${adm.length} admissão(ões) · ${desl.length} desligamento(s)` } : undefined,
  };
}

async function asoPendente(supabase: Cliente, filial?: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  const hoje = hojeBr();
  let q = supabase.from("employees").select("id, nome, cargo, branch_id, status").neq("status", "desligado").order("nome");
  if (filial) q = q.eq("branch_id", filial);
  const [funcs, asos] = await Promise.all([
    todas<{ id: string; nome: string; cargo: string | null; branch_id: string; status: "ativo" | "afastado" | "ferias" | "desligado" }>((de, ate) => q.range(de, ate)),
    todas<{ employee_id: string; data_validade: string | null }>((de, ate) => supabase.from("employee_aso").select("employee_id, data_validade").eq("ativo", true).range(de, ate)),
  ]);
  const validade = new Map<string, string>();
  for (const a of asos) if (a.data_validade && (!validade.has(a.employee_id) || a.data_validade > validade.get(a.employee_id)!)) validade.set(a.employee_id, a.data_validade);
  const out: Linha[] = funcs
    .filter((f) => !validade.has(f.id) || validade.get(f.id)! < hoje)
    .map((f) => ({
      nome: f.nome,
      cargo: f.cargo ?? "",
      loja: un(f.branch_id)?.codigo ?? "—",
      situacao: STATUS_LABEL[f.status],
      aso: validade.has(f.id) ? `vencido em ${validade.get(f.id)!.split("-").reverse().join("/")}` : "sem ASO cadastrado",
      _href: `/rh/funcionarios/${f.id}?aba=documentos`,
    }));
  return {
    titulo: "ASO vencido ou sem ASO",
    colunas: [
      { chave: "nome", titulo: "Funcionário" },
      { chave: "cargo", titulo: "Cargo" },
      { chave: "loja", titulo: "Unidade" },
      { chave: "situacao", titulo: "Situação" },
      { chave: "aso", titulo: "ASO" },
    ],
    linhas: out,
    totais: out.length ? { nome: `${out.length} funcionário(s)` } : undefined,
  };
}

async function horasExtrasPorLoja(supabase: Cliente, mes: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  const { data: evs } = await supabase.from("folha_eventos").select("id, chave").in("chave", ["he50", "he60", "he75", "he100"]);
  const chaveDo = new Map((evs ?? []).map((e) => [e.id, e.chave]));
  const linhas = chaveDo.size
    ? await todas<{ branch_id: string; evento_id: string; valor: number }>((de, ate) =>
        supabase
          .from("folha_lancamentos")
          .select("branch_id, evento_id, valor")
          .eq("competencia", `${mes}-01`)
          .in("evento_id", [...chaveDo.keys()])
          .range(de, ate),
      )
    : [];
  const out: Linha[] = [...somarPor(linhas, (l) => l.branch_id)].map(([id, ls]) => {
    const h = (c: string) => r2(ls.filter((l) => chaveDo.get(l.evento_id) === c).reduce((s, l) => s + Number(l.valor), 0));
    const linha: Linha = { loja: un(id)?.codigo ?? "—", nome: un(id)?.nome ?? "", he50: h("he50"), he60: h("he60"), he75: h("he75"), he100: h("he100") };
    linha.total = r2(Number(linha.he50) + Number(linha.he60) + Number(linha.he75) + Number(linha.he100));
    return linha;
  });
  out.sort((a, b) => Number(b.total) - Number(a.total));
  return {
    titulo: `Horas extras por unidade · ${rotuloCompetencia(mes)}`,
    colunas: [
      { chave: "loja", titulo: "Unidade" },
      { chave: "nome", titulo: "Nome" },
      { chave: "he50", titulo: "50% (h)", tipo: "numero" },
      { chave: "he60", titulo: "60% (h)", tipo: "numero" },
      { chave: "he75", titulo: "75% (h)", tipo: "numero" },
      { chave: "he100", titulo: "100% (h)", tipo: "numero" },
      { chave: "total", titulo: "Total (h)", tipo: "numero" },
    ],
    linhas: out,
    totais: out.length ? totalDe(out, ["he50", "he60", "he75", "he100", "total"], "Total", "loja") : undefined,
  };
}

// ---------- chamados e TI ----------

async function chamadosPorLoja(supabase: Cliente, mes: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  const linhas = await todas<{ branch_id: string | null; status: string; prioridade: keyof typeof PRIORIDADE_LABEL }>((de, ate) =>
    supabase
      .from("tickets")
      .select("branch_id, status, prioridade")
      .gte("created_at", `${mes}-01T00:00:00-03:00`)
      .lte("created_at", `${fimDoMes(mes)}T23:59:59.999-03:00`)
      .range(de, ate),
  );
  const out: Linha[] = [...somarPor(linhas, (l) => l.branch_id ?? "")].map(([id, ls]) => ({
    loja: un(id)?.codigo ?? "Sem unidade",
    nome: un(id)?.nome ?? "",
    chamados: ls.length,
    abertos: ls.filter((l) => l.status !== "resolvido" && l.status !== "cancelado").length,
    resolvidos: ls.filter((l) => l.status === "resolvido").length,
    urgentes: ls.filter((l) => l.prioridade === "alta" || l.prioridade === "critica").length,
    _href: id ? `/chamados?filial=${id}&status=todos` : undefined,
  }));
  out.sort((a, b) => Number(b.chamados) - Number(a.chamados));
  return {
    titulo: `Chamados por unidade · ${rotuloCompetencia(mes)}`,
    colunas: [
      { chave: "loja", titulo: "Unidade" },
      { chave: "nome", titulo: "Nome" },
      { chave: "chamados", titulo: "Abertos no mês", tipo: "inteiro" },
      { chave: "abertos", titulo: "Ainda em aberto", tipo: "inteiro" },
      { chave: "resolvidos", titulo: "Resolvidos", tipo: "inteiro" },
      { chave: "urgentes", titulo: "Alta/crítica", tipo: "inteiro" },
    ],
    linhas: out,
    totais: out.length ? totalDe(out, ["chamados", "abertos", "resolvidos", "urgentes"], "Total", "loja") : undefined,
  };
}

async function equipamentosAtencao(supabase: Cliente, filial?: string): Promise<Relatorio> {
  const un = await unidades(supabase);
  const hoje = hojeBr();
  const limite = somarDias(hoje, 60);
  let q = supabase
    .from("it_assets")
    .select("id, tipo, descricao, patrimonio, status, garantia_ate, branch_id, setor")
    .eq("ativo", true)
    .or(`status.eq.manutencao,garantia_ate.lte.${limite}`)
    .order("garantia_ate", { nullsFirst: false });
  if (filial) q = q.eq("branch_id", filial);
  const linhas = await todas<{
    id: string;
    tipo: string;
    descricao: string | null;
    patrimonio: string | null;
    status: keyof typeof STATUS_ATIVO_LABEL;
    garantia_ate: string | null;
    branch_id: string | null;
    setor: string | null;
  }>((de, ate) => q.range(de, ate));
  const out: Linha[] = linhas
    .filter((a) => a.status !== "baixado")
    .map((a) => ({
      patrimonio: a.patrimonio ?? "—",
      equipamento: [TIPO_ATIVO_LABEL[a.tipo] ?? a.tipo, a.descricao].filter(Boolean).join(" · "),
      loja: un(a.branch_id)?.codigo ?? "—",
      setor: a.setor ?? "",
      situacao: STATUS_ATIVO_LABEL[a.status],
      garantia: a.garantia_ate ? (a.garantia_ate < hoje ? `vencida em ${a.garantia_ate.split("-").reverse().join("/")}` : `vence em ${diasEntre(hoje, a.garantia_ate)} dia(s)`) : "",
      _href: `/ti/ativos/${a.id}`,
    }));
  return {
    titulo: "Equipamentos em manutenção ou com garantia acabando",
    colunas: [
      { chave: "patrimonio", titulo: "Patrimônio" },
      { chave: "equipamento", titulo: "Equipamento" },
      { chave: "loja", titulo: "Unidade" },
      { chave: "setor", titulo: "Setor" },
      { chave: "situacao", titulo: "Situação" },
      { chave: "garantia", titulo: "Garantia" },
    ],
    linhas: out,
    totais: out.length ? { patrimonio: `${out.length} equipamento(s)` } : undefined,
  };
}

/** Responde uma pergunta pelo id, com mês (aaaa-mm) e unidade opcionais. */
export async function responderPergunta(sessao: Sessao, id: string, filtros: FiltrosPergunta): Promise<Resposta | null> {
  const pergunta = perguntaPorId(id);
  if (!pergunta) return null;
  const supabase = await createClient();
  const filial = pergunta.parametros.includes("filial") && ehUuid(filtros.filial) ? filtros.filial : undefined;
  const pedido = pergunta.parametros.includes("mes") && ehMes(filtros.mes) ? filtros.mes : undefined;
  const financeiro = pergunta.area === "Financeiro";
  const mes = pergunta.parametros.includes("mes") ? (financeiro ? await mesFinanceiro(supabase, pedido) : (pedido ?? competenciaAtual())) : null;
  let relatorio: Relatorio;
  switch (id) {
    case "quebras-por-loja":
      relatorio = await quebrasPorLoja(supabase, mes!);
      break;
    case "quebras-por-operador":
      relatorio = await quebrasPorOperador(supabase, mes!, filial);
      break;
    case "quebras-sem-justificativa":
      relatorio = await quebrasSemJustificativa(supabase, podeAcessar(sessao.papel, "/financeiro/diferenca-caixa"), filial);
      break;
    case "pendencias-por-fornecedor":
      relatorio = await pendenciasPorFornecedor(supabase);
      break;
    case "pendencias-vencendo":
      relatorio = await pendenciasVencendo(supabase, filial);
      break;
    case "enviado-omie":
      relatorio = await enviadoOmie(supabase, mes!);
      break;
    case "resultado-por-loja":
      relatorio = await resultadoPorLoja(supabase, mes!);
      break;
    case "maiores-despesas":
      relatorio = await maioresDespesas(supabase, mes!, filial);
      break;
    case "funcionarios-por-loja":
      relatorio = await funcionariosPorLoja(supabase);
      break;
    case "movimentacao-do-mes":
      relatorio = await movimentacaoDoMes(supabase, mes!, filial);
      break;
    case "aso-pendente":
      relatorio = await asoPendente(supabase, filial);
      break;
    case "horas-extras-por-loja":
      relatorio = await horasExtrasPorLoja(supabase, mes!);
      break;
    case "chamados-por-loja":
      relatorio = await chamadosPorLoja(supabase, mes!);
      break;
    case "equipamentos-atencao":
      relatorio = await equipamentosAtencao(supabase, filial);
      break;
    default:
      return null;
  }
  const nota = financeiro && !pedido && mes ? `Sem mês escolhido: mostrando ${rotuloCompetencia(mes)}, o último mês com lançamentos.` : null;
  return { pergunta, relatorio, mes, nota };
}

/** Meses para o seletor: os 12 últimos (e o pedido, se for mais antigo). */
export function mesesParaEscolher(atual: string | null) {
  const base = competenciaAtual();
  const lista = Array.from({ length: 12 }, (_, i) => somarMeses(base, -i));
  if (atual && !lista.includes(atual)) lista.push(atual);
  return lista.sort().reverse();
}
