"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { CirclePause, FileSpreadsheet, Send } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Ponto } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { conferirDuplicidade, type TituloOmie } from "@/lib/conciliacao/duplicidade";
import type { ContaEnvio } from "@/lib/conciliacao/omie-envio";
import { CATEGORIA_LABEL, LIMITE_LANCAMENTO_API } from "@/lib/conciliacao/rotulos";
import type { Tom } from "@/lib/tons";
import type { EstadoValidacao } from "../omie-actions";

type StatusEmpresa = { nome: string; configurado: boolean; pronto: boolean; testado: boolean };
type Props = {
  conciliacaoId: string;
  contas: ContaEnvio[];
  api: Record<"nazario" | "varela", StatusEmpresa>;
  config: { categoria: string; conta: string };
  podeEnviar: boolean;
  /** Grupo carregado em `contas`: a página traz um grupo por vez, só o que falta enviar. */
  grupo: string;
  /** Quantas contas faltam enviar em cada grupo. */
  contagem: Record<string, number>;
  /** Grupo que veio no endereço (da lista: ?grupo=so_dda). Sem ele, os exatos já abrem marcados. */
  grupoInicial?: string;
  /** Contas marcadas na lista; com elas, a seleção começa só com essas. */
  marcadas?: string[];
  validar: (prev: EstadoValidacao, fd: FormData) => Promise<EstadoValidacao>;
  enviarPlanilha: (prev: EstadoValidacao, fd: FormData) => Promise<EstadoValidacao>;
};

const GRUPOS: { chave: string; rotulo: string; dica: string }[] = [
  { chave: "exato", rotulo: "Exatos", dica: "Boleto do Itaú e título do Trier batem (inclui tarifa, desconto e boleto que é a soma de várias notas)." },
  { chave: "aproximado", rotulo: "Aproximados", dica: "Bateram por valor/vencimento, nº do documento, ou com data/valor/filial diferente. Vale conferir." },
  { chave: "so_trier", rotulo: "Só no Trier", dica: "Sem boleto no banco: vai sem código de barras, pelo nome do fornecedor." },
  { chave: "so_dda", rotulo: "Só no DDA", dica: "Boletos sem título no Trier (despesas, notas não lançadas)." },
];

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (v: number) => v.toLocaleString("pt-BR");

/** Envio em lotes: cada empresa tem a sua fila, porque a Omie aceita cerca de 1 conta por segundo em cada uma. */
type EnvioEmLotes = {
  total: number;
  lancadas: number;
  jaNaOmie: number;
  vencidas: number;
  parecidas: number;
  barradas: { nome: string; filial: number | null; valor: number; venc: string | null; motivo: string }[];
  qtdErros: number;
  motivos: Record<string, number>;
  filas: Record<string, { total: number; etapa: string }>;
  rodando: boolean;
  aviso?: string;
};
type RespostaLote = { lancadas: number; adiadas: string[]; parada: string | null; bloqueadas: number; erros: { nome: string; valor: number; erro: string }[]; modoTeste: string[] };
const ROTULO_FILA: Record<string, string> = { nazario: "Nazário", varela: "Varela", sem: "Sem empresa" };
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const data = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function EnvioOmie({ conciliacaoId, contas, grupo, contagem, api, config, podeEnviar, grupoInicial, marcadas, validar, enviarPlanilha }: Props) {
  const [filial, setFilial] = React.useState("");
  const [q, setQ] = React.useState("");
  // sem marcação vinda da lista, começa com os exatos que faltam (o caso comum); vindo da lista, só o que foi marcado
  const [sel, setSel] = React.useState<Set<string>>(() => {
    if (marcadas?.length) {
      const quer = new Set(marcadas);
      return new Set(contas.filter((c) => quer.has(c.chave)).map((c) => c.chave));
    }
    return grupoInicial ? new Set() : new Set(contas.map((c) => c.chave));
  });
  const [cadastrar, setCadastrar] = React.useState(true);
  const [validacao, acaoValidar, validando] = useActionState(validar, {});
  const [planilha, acaoPlanilha, gerando] = useActionState(enviarPlanilha, {});
  const [lote, setLote] = React.useState<EnvioEmLotes | null>(null);
  const parar = React.useRef(false);
  const emLotes = !!lote?.rodando;
  React.useEffect(() => {
    if (!emLotes) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [emLotes]);

  const filiais = [...new Set(contas.map((c) => c.filial).filter((f): f is number => f != null))].sort((a, b) => a - b);
  const termo = q.trim().toUpperCase();
  const visiveis = contas.filter(
    (c) =>
      (!filial || String(c.filial) === filial) &&
      (!termo || `${c.nome} ${c.fornecedor ?? ""} ${c.cnpj ?? ""} ${c.fornecedorReal ?? ""}`.toUpperCase().includes(termo)),
  );
  const selecionadas = contas.filter((c) => sel.has(c.chave));
  const marcadasNo = (g: string) => selecionadas.filter((c) => c.grupo === g).length;
  const totalSel = selecionadas.reduce((s, c) => s + c.valor, 0);
  const apiDisponivel = api.nazario.configurado || api.varela.configurado;

  const alternar = (chave: string, marcar: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (marcar) n.add(chave);
      else n.delete(chave);
      return n;
    });
  const marcarVisiveis = (marcar: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const c of visiveis) if (marcar) n.add(c.chave);
      else n.delete(c.chave);
      return n;
    });

  const fdCom = (chaves: string[], extras: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("conciliacao", conciliacaoId);
    for (const k of chaves) fd.append("chave", k);
    for (const [k, v] of Object.entries(extras)) fd.set(k, v);
    return fd;
  };
  const pedirValidacao = (verbo: "planilha" | "api") => React.startTransition(() => acaoValidar(fdCom([...sel], { verbo })));
  const lancarEmLotes = async (chaves: string[]) => {
    parar.current = false;
    const porChave = new Map(contas.map((c) => [c.chave, c]));
    const filas = new Map<string, ContaEnvio[]>();
    for (const k of chaves) {
      const c = porChave.get(k);
      if (!c) continue;
      const emp = c.empresa ?? "sem";
      const fila = filas.get(emp);
      if (fila) fila.push(c);
      else filas.set(emp, [c]);
    }
    setLote({ total: chaves.length, lancadas: 0, jaNaOmie: 0, vencidas: 0, parecidas: 0, barradas: [], qtdErros: 0, motivos: {}, filas: Object.fromEntries([...filas].map(([e, f]) => [e, { total: f.length, etapa: "aguardando" }])), rodando: true });
    const etapa = (emp: string, texto: string) => setLote((l) => (l ? { ...l, filas: { ...l.filas, [emp]: { ...l.filas[emp], etapa: texto } } } : l));
    const avisar = (emp: string, texto: string) => setLote((l) => (l ? { ...l, aviso: [l.aviso, `${ROTULO_FILA[emp] ?? emp}: ${texto}`].filter(Boolean).join(" · ") } : l));
    const postar = async <T,>(url: string, corpo: unknown): Promise<T> => {
      let ultimo = "";
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
          const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
          const r = (await resp.json()) as T & { erro?: string };
          if (resp.ok) return r;
          ultimo = r.erro ?? `HTTP ${resp.status}`;
          if (/bloqueada/i.test(ultimo)) break; // a Omie já disse quanto falta: insistir não adianta
        } catch (e) {
          ultimo = e instanceof Error ? e.message : "sem conexão";
        }
        await dormir(15_000);
      }
      throw new Error(ultimo);
    };
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const rodarFila = async (emp: string, lista: ContaEnvio[]) => {
      try {
        // 1) o que já está na Omie, pelo código de integração ou pelo código de barras
        const titulos: TituloOmie[] = [];
        if (emp !== "sem") {
          const vencs = lista.map((c) => c.vencimento).filter((v): v is string => !!v).sort();
          for (let pagina = 1, paginas = 1; pagina <= paginas && !parar.current; pagina++) {
            etapa(emp, `consultando a Omie, página ${inteiro(pagina)}${paginas > 1 ? ` de ${inteiro(paginas)}` : ""}`);
            const r = await postar<{ paginas: number; titulos: [string, string, string, string, string, number][] }>("/api/conciliacao/omie-existentes", { empresa: emp, de: vencs[0], ate: vencs[vencs.length - 1], pagina });
            paginas = r.paginas;
            for (const [codigo, barra, omie, doc, venc, valor] of r.titulos) titulos.push({ codigo, barra, omie, doc, venc, valor });
          }
        }
        if (parar.current) return;
        // 2) separa: já está lá, vencida (a Omie pede vencimento a partir de hoje) ou nova
        const conferencia = conferirDuplicidade(
          lista.map((c) => ({ chave: c.chave, codigo: c.chave.split("|")[0], barra: c.barra, doc: c.cnpj, venc: c.vencimento ? data(c.vencimento) : null, valor: c.valor })),
          titulos,
        );
        const ja = conferencia.bloqueadas.filter((b) => b.tipo === "ja_na_omie" && b.codigoOmie).map((b) => ({ chave: b.chave, codigo: b.codigoOmie! }));
        const parecidas = conferencia.bloqueadas.length - ja.length;
        const barradas = conferencia.bloqueadas
          .filter((b) => !(b.tipo === "ja_na_omie" && b.codigoOmie))
          .map((b) => {
            const c = porChave.get(b.chave);
            return { nome: c?.nome ?? b.chave, filial: c?.filial ?? null, valor: c?.valor ?? 0, venc: c?.vencimento ?? null, motivo: b.motivo };
          });
        const vencimento = new Map(lista.map((c) => [c.chave, c.vencimento]));
        const novas = conferencia.liberadas.filter((k) => !(vencimento.get(k) && vencimento.get(k)! < hoje));
        const vencidas = conferencia.liberadas.length - novas.length;
        setLote((l) => (l ? { ...l, vencidas: l.vencidas + vencidas, parecidas: l.parecidas + parecidas, barradas: [...l.barradas, ...barradas] } : l));
        // 3) quem já está lá sai de "a enviar", sem mexer no título da Omie
        for (let i = 0; i < ja.length && !parar.current; i += 500) {
          etapa(emp, `marcando ${inteiro(ja.length)} que já estão na Omie`);
          const pedaco = ja.slice(i, i + 500);
          await postar("/api/conciliacao/omie-marcar", { conciliacao: conciliacaoId, contas: pedaco });
          setLote((l) => (l ? { ...l, jaNaOmie: l.jaNaOmie + pedaco.length } : l));
        }
        // 4) lança só as novas
        const inicioNovas = novas.length;
        while (novas.length && !parar.current) {
          etapa(emp, `lançando novas, faltam ${inteiro(novas.length)} de ${inteiro(inicioNovas)}`);
          const pedaco = novas.slice(0, LIMITE_LANCAMENTO_API);
          const r = await postar<RespostaLote>("/api/conciliacao/omie-lote", { conciliacao: conciliacaoId, chaves: pedaco, cadastrar });
          if (r.modoTeste.length) throw new Error(`modo teste em ${r.modoTeste.join(", ")}: libere o lote em Conciliação → Omie`);
          novas.splice(0, pedaco.length);
          novas.push(...r.adiadas);
          setLote((l) => {
            if (!l) return l;
            const motivos = { ...l.motivos };
            for (const x of r.erros) motivos[x.erro] = (motivos[x.erro] ?? 0) + 1;
            return { ...l, lancadas: l.lancadas + r.lancadas, qtdErros: l.qtdErros + r.erros.length, parecidas: l.parecidas + r.bloqueadas, motivos };
          });
          if (r.parada) throw new Error(r.parada);
          if (!r.lancadas && !r.erros.length && !r.bloqueadas) throw new Error("nenhuma conta foi processada neste lote");
        }
        etapa(emp, parar.current ? "parada" : "terminou");
      } catch (e) {
        etapa(emp, "parou");
        avisar(emp, `${e instanceof Error ? e.message : "falha"}. O que já foi feito está marcado; recarregue e marque de novo para continuar.`);
      }
    };
    await Promise.all([...filas].map(([emp, lista]) => rodarFila(emp, lista)));
    setLote((l) => (l ? { ...l, rodando: false } : l));
  };
  const executar = (chaves: string[]) => {
    if (!validacao.verbo) return;
    if (validacao.verbo === "planilha") React.startTransition(() => acaoPlanilha(fdCom(chaves)));
    else void lancarEmLotes(chaves);
  };
  const ocupado = validando || gerando || emLotes;
  const v = validacao.validacao;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 text-sm">
        <p>
          <strong>Categoria:</strong> {config.categoria} · <strong>Conta corrente:</strong> {config.conta} ·{" "}
          <Link href="/conciliacao/omie" className="text-fct-tinta underline">
            configuração e envios
          </Link>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Planilha: baixa o modelo oficial de importação preenchido (importar em Finanças → Contas a pagar → Importar). API: lança direto — filiais 300 em diante (e TRIO) na Omie da Nazário, abaixo de 300 na da Varela.{" "}
          {(["nazario", "varela"] as const).map((e) => (
            <span key={e} className="mr-2">
              <Ponto tom={api[e].pronto ? "sucesso" : api[e].configurado ? "alerta" : "neutro"} rotulo={api[e].pronto ? "Pronto" : api[e].configurado ? "Com chave, falta conferir" : "Sem chave"} className="mr-1" /> {api[e].nome}
              {api[e].configurado && !api[e].testado ? " (modo teste: 1 conta)" : ""}
            </span>
          ))}
        </p>
      </section>

      <nav aria-label="Grupos" className="flex flex-wrap gap-2">
        {GRUPOS.map((g) => (
          <Link
            key={g.chave}
            href={`/conciliacao/${conciliacaoId}?aba=omie&grupo=${g.chave}`}
            title={g.dica}
            aria-current={grupo === g.chave ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${grupo === g.chave ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"} ${emLotes ? "pointer-events-none opacity-60" : ""}`}
          >
            {g.rotulo} <span className={grupo === g.chave ? "opacity-80" : "text-muted-foreground"}>({contagem[g.chave] ?? 0} a enviar{marcadasNo(g.chave) ? ` · ${marcadasNo(g.chave)} marcada(s)` : ""})</span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
        <SelectNativo value={filial} onChange={(e) => setFilial(e.target.value)} aria-label="Filial" className="w-36">
          <option value="">Todas as filiais</option>
          {filiais.map((f) => (
            <option key={f} value={String(f)}>
              {String(f).padStart(3, "0")}
            </option>
          ))}
        </SelectNativo>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Beneficiário, fornecedor, CNPJ" aria-label="Buscar" className="w-64" />
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => marcarVisiveis(true)} className="text-xs text-fct-tinta underline">
            marcar visíveis
          </button>
          <button type="button" onClick={() => marcarVisiveis(false)} className="text-xs text-fct-tinta underline">
            desmarcar visíveis
          </button>
        </span>
      </div>

      <div className="rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="w-8 p-2"></th>
              <th className="p-2">Filial</th>
              <th className="p-2">Venc.</th>
              <th className="p-2">Beneficiário</th>
              <th className="p-2 text-right">Valor</th>
              <th className="hidden p-2 md:table-cell">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={6} className="vazio">
                  Nada neste grupo com esses filtros.
                </td>
              </tr>
            ) : (
              visiveis.slice(0, 800).map((c) => (
                <tr key={c.chave} className="border-b last:border-0">
                  <td className="p-2">
                    <input type="checkbox" checked={sel.has(c.chave)} disabled={!podeEnviar} onChange={(e) => alternar(c.chave, e.target.checked)} className="size-4 accent-fct-tinta" aria-label={`Selecionar ${c.nome}`} />
                  </td>
                  <td className="p-2 font-mono text-xs text-fct-tinta">{c.filial != null ? String(c.filial).padStart(3, "0") : "—"}</td>
                  <td className="p-2 tabular-nums">{data(c.vencimento)}</td>
                  <td className="p-2">
                    <p className="font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.fornecedor && c.fornecedor !== c.nome ? `Trier: ${c.fornecedor} · ` : ""}
                      {c.cnpj ?? ""}
                      {c.fornecedorReal ? ` · real: ${c.fornecedorReal}` : ""}
                      {c.semDepartamento ? " · sem departamento no Omie" : ""}
                    </p>
                    {c.regras && (
                      <p className="text-xs text-violet-800" title={`Regra automática: ${c.regras.nomes}`}>
                        Regra {c.regras.nomes}
                        {c.regras.categoria ? ` → categoria ${c.regras.categoria}` : ""}
                        {c.regras.departamento ? ` → departamento ${c.regras.departamento}` : ""}
                      </p>
                    )}
                    {c.alerta &&<p className="text-xs font-semibold text-red-700">ALERTA: {c.alerta}</p>}
                  </td>
                  <td className="p-2 text-right tabular-nums">{moeda(c.valor)}</td>
                  <td className="hidden p-2 text-xs md:table-cell">
                    <span className="text-muted-foreground">{CATEGORIA_LABEL[c.categoria] ?? c.categoria}</span>
                    {c.pendencia && c.pendencia.status !== "pendente" && <p className="text-amber-800">pendência {c.pendencia.status}{c.pendencia.motivo ? `: ${c.pendencia.motivo}` : ""}</p>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {visiveis.length > 800 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">Mostrando 800 de {visiveis.length} na tela; as marcadas que não aparecem aqui também vão no envio.</p>}
      </div>

      {podeEnviar && (
        <section className="sticky bottom-2 rounded-xl border bg-card p-4 shadow-md">
          <ErroFormulario mensagem={validacao.erro ?? planilha.erro} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">
              {selecionadas.length} conta(s) · {moeda(totalSel)}
              {selecionadas.length > 0 && (
                <span className="block text-xs font-normal text-muted-foreground">
                  {GRUPOS.filter((g) => marcadasNo(g.chave))
                    .map((g) => `${marcadasNo(g.chave)} em ${g.rotulo}`)
                    .join(" · ")}{" "}
                  ·{" "}
                  <button type="button" onClick={() => setSel(new Set())} className="text-fct-tinta underline">
                    limpar seleção
                  </button>
                </span>
              )}
            </span>
            <Button type="button" disabled={ocupado || selecionadas.length === 0} onClick={() => pedirValidacao("planilha")}>
              <FileSpreadsheet data-icon="inline-start" />
              {validando ? "Validando…" : "Gerar planilha do Omie"}
            </Button>
            <Button type="button" variant="outline" disabled={ocupado || selecionadas.length === 0 || !apiDisponivel} onClick={() => pedirValidacao("api")} title={apiDisponivel ? "" : "Chaves da Omie não configuradas no servidor"}>
              <Send data-icon="inline-start" />
              Lançar pela API
            </Button>
            {apiDisponivel && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={cadastrar} onChange={(e) => setCadastrar(e.target.checked)} className="size-4 accent-fct-tinta" />
                cadastrar na Omie o fornecedor que ainda não existir (pelo CNPJ)
              </label>
            )}
          </div>

          {v && validacao.verbo && (
            <div className="mt-4 space-y-3 border-t pt-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold text-emerald-800"><Ponto tom="sucesso" className="mr-1.5" />Válidas</p>
                  <p className="numero-sm">{v.validas.length}</p>
                  <p className="text-xs text-emerald-800">{moeda(v.totalValidas)}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800"><Ponto tom="atencao" className="mr-1.5" />Precisam de atenção</p>
                  <p className="numero-sm">{v.atencao.length}</p>
                  <p className="text-xs text-amber-800">vão junto, mas confira</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-800"><Ponto tom="perigo" className="mr-1.5" />Com problema</p>
                  <p className="numero-sm">{v.grave.length}</p>
                  <p className="text-xs text-red-800">duplicidade, já enviada, sem departamento, alerta</p>
                </div>
              </div>
              {[
                ["Com problema", v.grave, "perigo"],
                ["Atenção", v.atencao, "atencao"],
              ].map(([titulo, lista, tom]) =>
                (lista as typeof v.grave).length ? (
                  <details key={titulo as string} open={titulo === "Com problema"}>
                    <summary className="cursor-pointer font-medium">
                      <Ponto tom={tom as Tom} className="mr-1.5" />
                      {titulo as string} ({(lista as typeof v.grave).length})
                    </summary>
                    <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs">
                      {(lista as typeof v.grave).slice(0, 60).map((x) => (
                        <li key={x.chave}>
                          <span className="font-mono text-fct-tinta">{x.filial != null ? String(x.filial).padStart(3, "0") : "—"}</span> {x.nome} · {moeda(x.valor)} · {data(x.vencimento)} — <span className="text-muted-foreground">{x.motivos.join(" · ")}</span>
                        </li>
                      ))}
                      {(lista as typeof v.grave).length > 60 && <li className="text-muted-foreground">… e mais {(lista as typeof v.grave).length - 60}</li>}
                    </ul>
                  </details>
                ) : null,
              )}
              <div className="flex flex-wrap items-center gap-2">
                {v.grave.length > 0 && v.validas.length > 0 && (
                  <Button type="button" disabled={ocupado} onClick={() => executar(v.validas)}>
                    {validacao.verbo === "planilha" ? "Gerar só as válidas" : "Lançar só as válidas"} ({v.validas.length})
                  </Button>
                )}
                <Button type="button" variant={v.grave.length ? "outline" : "default"} disabled={ocupado} onClick={() => executar(validacao.chaves ?? [])}>
                  {gerando ? "Aguarde…" : v.grave.length ? `${validacao.verbo === "planilha" ? "Gerar" : "Lançar"} mesmo assim (todas, ${validacao.chaves?.length ?? 0})` : validacao.verbo === "planilha" ? `Gerar planilha (${validacao.chaves?.length ?? 0})` : `Lançar no Omie (${validacao.chaves?.length ?? 0})`}
                </Button>
                {!v.grave.length && !v.atencao.length && <span className="text-xs text-emerald-700">Tudo certo para enviar.</span>}
              </div>
              {validacao.verbo === "api" && (
                <p className="text-xs text-muted-foreground">Antes de lançar, o sistema consulta o Omie: o que já está lá fica marcado como enviado, sem mexer no título, e só as novas são lançadas. Deixe esta aba aberta até terminar.</p>
              )}
            </div>
          )}

          {lote && (
            <div className="mt-4 space-y-2 border-t pt-3 text-sm">
              <p className="font-medium" aria-live="polite">
                {lote.rodando ? "Enviando ao Omie" : "Envio parado"}: {inteiro(lote.jaNaOmie)} já estavam lá, {inteiro(lote.lancadas)} lançada(s), {inteiro(lote.qtdErros)} com erro, {inteiro(lote.vencidas)} vencida(s) e {inteiro(lote.parecidas)} barrada(s) por possível duplicidade (não lançadas), de {inteiro(lote.total)}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-fct-tinta" style={{ width: `${Math.min(100, ((lote.jaNaOmie + lote.lancadas + lote.qtdErros + lote.vencidas + lote.parecidas) / Math.max(1, lote.total)) * 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {Object.entries(lote.filas)
                  .map(([e, f]) => `${ROTULO_FILA[e] ?? e} (${inteiro(f.total)}): ${f.etapa}`)
                  .join(" · ")}
                {lote.rodando ? " · deixe esta aba aberta" : ""}
              </p>
              {lote.aviso && <p role="alert" className="text-xs font-semibold text-red-700">{lote.aviso}</p>}
              {lote.rodando && (
                <Button type="button" size="sm" variant="outline" onClick={() => (parar.current = true)}>
                  <CirclePause data-icon="inline-start" />
                  Parar
                </Button>
              )}
              {lote.qtdErros > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium">Motivos dos erros</summary>
                  <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs">
                    {Object.entries(lote.motivos)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 30)
                      .map(([m, q]) => (
                        <li key={m}>
                          <strong>{inteiro(q)}×</strong> {m}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              {lote.barradas.length > 0 && (
                <details open>
                  <summary className="cursor-pointer font-medium">Barradas por possível duplicidade ({inteiro(lote.barradas.length)}): confira no Omie, o portal não lança estas</summary>
                  <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto text-xs">
                    {lote.barradas.slice(0, 500).map((b, i) => (
                      <li key={i}>
                        <span className="font-mono text-fct-tinta">{b.filial != null ? String(b.filial).padStart(3, "0") : "—"}</span> {b.nome} · {moeda(b.valor)} · {data(b.venc)} — <span className="text-muted-foreground">{b.motivo}</span>
                      </li>
                    ))}
                    {lote.barradas.length > 500 && <li className="text-muted-foreground">… e mais {inteiro(lote.barradas.length - 500)}</li>}
                  </ul>
                </details>
              )}
              {!lote.rodando && <p className="text-xs text-muted-foreground">Recarregue a página para ver as contas marcadas como enviadas.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
