"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, CircleAlert, FileSpreadsheet, Send } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContaEnvio } from "@/lib/conciliacao/omie-envio";
import { CATEGORIA_LABEL } from "@/lib/conciliacao/rotulos";
import type { EstadoLancamentoApi, EstadoValidacao } from "../omie-actions";

type StatusEmpresa = { nome: string; configurado: boolean; pronto: boolean; testado: boolean };
type Props = {
  conciliacaoId: string;
  contas: ContaEnvio[];
  api: Record<"nazario" | "varela", StatusEmpresa>;
  config: { categoria: string; conta: string };
  podeEnviar: boolean;
  validar: (prev: EstadoValidacao, fd: FormData) => Promise<EstadoValidacao>;
  enviarPlanilha: (prev: EstadoValidacao, fd: FormData) => Promise<EstadoValidacao>;
  lancarApi: (prev: EstadoLancamentoApi, fd: FormData) => Promise<EstadoLancamentoApi>;
};

const GRUPOS: { chave: string; rotulo: string; dica: string }[] = [
  { chave: "exato", rotulo: "Exatos", dica: "Boleto do Itaú e título do Trier batem (inclui tarifa, desconto e boleto que é a soma de várias notas)." },
  { chave: "aproximado", rotulo: "Aproximados", dica: "Bateram por valor/vencimento, nº do documento, ou com data/valor/filial diferente. Vale conferir." },
  { chave: "so_trier", rotulo: "Só no Trier", dica: "Sem boleto no banco: vai sem código de barras, pelo nome do fornecedor." },
  { chave: "so_dda", rotulo: "Só no DDA", dica: "Boletos sem título no Trier (despesas, notas não lançadas)." },
];

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function EnvioOmie({ conciliacaoId, contas, api, config, podeEnviar, validar, enviarPlanilha, lancarApi }: Props) {
  const [grupo, setGrupo] = React.useState("exato");
  const [env, setEnv] = React.useState<"faltam" | "enviados" | "todos">("faltam");
  const [filial, setFilial] = React.useState("");
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState<Set<string>>(() => new Set(contas.filter((c) => c.grupo === "exato" && !c.enviadoEm).map((c) => c.chave)));
  const [cadastrar, setCadastrar] = React.useState(true);
  const [validacao, acaoValidar, validando] = useActionState(validar, {});
  const [planilha, acaoPlanilha, gerando] = useActionState(enviarPlanilha, {});
  const [lancamento, acaoLancar, lancando] = useActionState(lancarApi, {});

  const filiais = [...new Set(contas.map((c) => c.filial).filter((f): f is number => f != null))].sort((a, b) => a - b);
  const termo = q.trim().toUpperCase();
  const visiveis = contas.filter(
    (c) =>
      c.grupo === grupo &&
      (env === "todos" || (env === "enviados" ? !!c.enviadoEm : !c.enviadoEm)) &&
      (!filial || String(c.filial) === filial) &&
      (!termo || `${c.nome} ${c.fornecedor ?? ""} ${c.cnpj ?? ""} ${c.fornecedorReal ?? ""}`.toUpperCase().includes(termo)),
  );
  const contagem = (g: string) => contas.filter((c) => c.grupo === g && !c.enviadoEm).length;
  const selecionadas = contas.filter((c) => sel.has(c.chave));
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
      for (const c of visiveis) if (marcar && !c.enviadoEm) n.add(c.chave);
      else if (!marcar) n.delete(c.chave);
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
  const executar = (chaves: string[]) => {
    if (!validacao.verbo) return;
    if (validacao.verbo === "planilha") React.startTransition(() => acaoPlanilha(fdCom(chaves)));
    else React.startTransition(() => acaoLancar(fdCom(chaves, { cadastrar_fornecedor: cadastrar ? "on" : "" })));
  };
  const ocupado = validando || gerando || lancando;
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
              {api[e].pronto ? "🟢" : api[e].configurado ? "🟠" : "⚪"} {api[e].nome}
              {api[e].configurado && !api[e].testado ? " (modo teste: 1 conta)" : ""}
            </span>
          ))}
        </p>
      </section>

      <nav aria-label="Grupos" className="flex flex-wrap gap-2">
        {GRUPOS.map((g) => (
          <button
            key={g.chave}
            type="button"
            onClick={() => setGrupo(g.chave)}
            title={g.dica}
            className={`rounded-full border px-3 py-1 text-sm ${grupo === g.chave ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}
          >
            {g.rotulo} <span className={grupo === g.chave ? "opacity-80" : "text-muted-foreground"}>({contagem(g.chave)} a enviar)</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
        <SelectNativo value={env} onChange={(e) => setEnv(e.target.value as typeof env)} aria-label="Enviados" className="w-48">
          <option value="faltam">Só os que faltam enviar</option>
          <option value="enviados">Só os já enviados</option>
          <option value="todos">Todos</option>
        </SelectNativo>
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
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  Nada neste grupo com esses filtros.
                </td>
              </tr>
            ) : (
              visiveis.slice(0, 800).map((c) => (
                <tr key={c.chave} className="border-b last:border-0">
                  <td className="p-2">
                    <input type="checkbox" checked={sel.has(c.chave)} disabled={!!c.enviadoEm || !podeEnviar} onChange={(e) => alternar(c.chave, e.target.checked)} className="size-4 accent-fct-tinta" aria-label={`Selecionar ${c.nome}`} />
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
                    {c.enviadoEm && <p className="text-emerald-700">✔ enviado {data(c.enviadoEm.slice(0, 10))} ({c.enviadoVia})</p>}
                    {c.pendencia && c.pendencia.status !== "pendente" && <p className="text-amber-800">pendência {c.pendencia.status}{c.pendencia.motivo ? `: ${c.pendencia.motivo}` : ""}</p>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {visiveis.length > 800 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">Mostrando 800 de {visiveis.length}; use os filtros.</p>}
      </div>

      {podeEnviar && (
        <section className="sticky bottom-2 rounded-xl border bg-card p-4 shadow-md">
          <ErroFormulario mensagem={validacao.erro ?? planilha.erro ?? lancamento.erro} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">
              {selecionadas.length} conta(s) · {moeda(totalSel)}
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
                  <p className="text-xs font-semibold text-emerald-800">🟢 Válidas</p>
                  <p className="numero-sm">{v.validas.length}</p>
                  <p className="text-xs text-emerald-800">{moeda(v.totalValidas)}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800">🟡 Precisam de atenção</p>
                  <p className="numero-sm">{v.atencao.length}</p>
                  <p className="text-xs text-amber-800">vão junto, mas confira</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-800">🔴 Com problema</p>
                  <p className="numero-sm">{v.grave.length}</p>
                  <p className="text-xs text-red-800">duplicidade, já enviada, sem departamento, alerta</p>
                </div>
              </div>
              {[
                ["🔴 Com problema", v.grave],
                ["🟡 Atenção", v.atencao],
              ].map(([titulo, lista]) =>
                (lista as typeof v.grave).length ? (
                  <details key={titulo as string} open={titulo === "🔴 Com problema"}>
                    <summary className="cursor-pointer font-medium">
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
                  {gerando || lancando ? "Aguarde…" : v.grave.length ? `${validacao.verbo === "planilha" ? "Gerar" : "Lançar"} mesmo assim (todas, ${validacao.chaves?.length ?? 0})` : validacao.verbo === "planilha" ? `Gerar planilha (${validacao.chaves?.length ?? 0})` : `Lançar no Omie (${validacao.chaves?.length ?? 0})`}
                </Button>
                {!v.grave.length && !v.atencao.length && <span className="text-xs text-emerald-700">Tudo certo para enviar.</span>}
              </div>
            </div>
          )}

          {lancamento.resultado && (
            <div className="mt-4 border-t pt-3 text-sm">
              <p className="font-medium">
                Lançamento pela API: {lancamento.resultado.resultados.filter((r) => r.ok).length} lançada(s), {lancamento.resultado.resultados.filter((r) => !r.ok).length} com erro, {lancamento.resultado.fora.length} fora
                {lancamento.resultado.modoTeste.length ? ` · modo teste em ${lancamento.resultado.modoTeste.join(", ")} (só 1 conta; confira na Omie e libere o lote em Conciliação → Omie)` : ""}
              </p>
              <ul className="mt-1 max-h-56 space-y-0.5 overflow-y-auto text-xs">
                {lancamento.resultado.resultados.map((r) => (
                  <li key={r.chave} className="flex items-start gap-1">
                    {r.ok ? <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-600" aria-hidden /> : <CircleAlert className="mt-0.5 size-3.5 text-red-600" aria-hidden />}
                    <span>
                      {r.nome} · {moeda(r.valor)} {r.ok ? `· Omie nº ${r.codigoOmie ?? "—"}` : `· ${r.erro}`}
                    </span>
                  </li>
                ))}
                {lancamento.resultado.fora.map((f) => (
                  <li key={f.chave} className="text-muted-foreground">
                    ⏸ {f.nome}: {f.motivo}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Recarregue a página para ver as contas marcadas como enviadas.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
