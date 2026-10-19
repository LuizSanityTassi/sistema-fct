import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COR_SITUACAO, ROTULO_SITUACAO, situacaoDoCaixa, textoDiferenca } from "@/lib/caixa/rotulos";
import { anexosDasQuebras, quebrasVisiveis } from "@/lib/data/diferenca-caixa";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { competenciaAtual, rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import { AnexosQuebra } from "./anexos-quebra";

/** Quebras de caixa de todas as lojas da regional do coordenador (só leitura; quem justifica é o gestor da loja). */
export async function VisaoCoordenador({ usuarioId, regional, sp }: { usuarioId: string; regional: string | null; sp: Record<string, string | string[] | undefined> }) {
  const ver = sp.ver === "mes" ? "mes" : "abertas";
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : competenciaAtual();
  const filial = typeof sp.filial === "string" && sp.filial ? sp.filial : null;
  const supabase = await createClient();
  const [{ data: lojas }, quebras] = await Promise.all([
    supabase
      .from("branches")
      .select("id, codigo, nome")
      .eq("regional", regional ?? "—")
      .order("codigo"),
    quebrasVisiveis({ abertas: ver === "abertas", filial, mes: ver === "mes" ? mes : null }),
  ]);
  const anexos = await anexosDasQuebras(quebras.map((q) => q.id));

  // resumo por loja
  const porLoja = new Map<string, { codigo: string; nome: string; qtd: number; pendentes: number; justificadas: number; valor: number }>();
  for (const q of quebras) {
    const k = q.filial?.id ?? "—";
    const g = porLoja.get(k) ?? { codigo: q.filial?.codigo ?? "—", nome: q.filial?.nome ?? "", qtd: 0, pendentes: 0, justificadas: 0, valor: 0 };
    g.qtd += 1;
    if (q.andamento === "pendente") g.pendentes += 1;
    if (q.andamento === "justificada") g.justificadas += 1;
    g.valor = Math.round((g.valor + Number(q.valor_quebra)) * 100) / 100;
    porLoja.set(k, g);
  }
  const resumo = [...porLoja.values()].sort((a, b) => b.valor - a.valor);
  const total = resumo.reduce((s, l) => s + l.valor, 0);
  const pendentes = resumo.reduce((s, l) => s + l.pendentes, 0);
  const meses = Array.from({ length: 6 }, (_, i) => somarMeses(competenciaAtual(), -i));
  const link = (extra: Record<string, string>) => `/caixa?${new URLSearchParams({ ...(filial ? { filial } : {}), ...extra }).toString()}`;

  if (!regional) {
    return (
      <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Seu usuário é de coordenador, mas ainda não tem regional definida. Peça ao administrador para escolher a regional em Administração → Usuários.
      </p>
    );
  }

  return (
    <>
      <nav aria-label="Filtro" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={link({})}
          aria-current={ver === "abertas" ? "page" : undefined}
          className={`rounded-full border px-3 py-1 ${ver === "abertas" ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
        >
          Em aberto
        </Link>
        <Link
          href={link({ ver: "mes", mes })}
          aria-current={ver === "mes" ? "page" : undefined}
          className={`rounded-full border px-3 py-1 ${ver === "mes" ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
        >
          Por mês
        </Link>
      </nav>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        {ver === "mes" && <input type="hidden" name="ver" value="mes" />}
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Loja</span>
          <SelectNativo name="filial" defaultValue={filial ?? ""} className="w-64">
            <option value="">Todas da regional {regional}</option>
            {(lojas ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo} · {l.nome}
              </option>
            ))}
          </SelectNativo>
        </label>
        {ver === "mes" && (
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Mês da folha</span>
            <SelectNativo name="mes" defaultValue={mes} className="w-48">
              {meses.map((m) => (
                <option key={m} value={m}>
                  {rotuloCompetencia(m)}
                </option>
              ))}
            </SelectNativo>
          </label>
        )}
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Quebras", String(quebras.length), ver === "abertas" ? "em aberto (todos os meses)" : rotuloCompetencia(mes)],
          ["Esperando justificativa", String(pendentes), "o gestor da loja justifica"],
          ["Valor", formatarMoeda(total), "faltas e sobras acima da tolerância"],
          ["Lojas com quebra", String(resumo.length), `de ${(lojas ?? []).length} na regional ${regional}`],
        ].map(([r, v, n]) => (
          <div key={r} className="rounded-xl border bg-card px-4 py-3">
            <p className="rotulo">{r}</p>
            <p className="mt-1 numero">{v}</p>
            <p className="text-xs text-muted-foreground">{n}</p>
          </div>
        ))}
      </section>

      {quebras.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma quebra {ver === "abertas" ? "em aberto" : `em ${rotuloCompetencia(mes).toLowerCase()}`} nas lojas da regional {regional}.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
          <section className="h-fit rounded-xl border bg-card">
            <h2 className="px-4 pt-4 pb-2 text-sm font-semibold">Por loja</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead className="text-right">Quebras</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumo.map((l) => (
                  <TableRow key={l.codigo}>
                    <TableCell>
                      <span className="font-mono text-xs">{l.codigo}</span> <span className="text-xs text-muted-foreground">{l.nome}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.qtd}
                      {l.pendentes ? <span className="block text-[11px] text-amber-800">{l.pendentes} sem justificativa</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="rounded-xl border bg-card">
            <h2 className="px-4 pt-4 pb-2 text-sm font-semibold">Quebras</h2>
            <ul className="divide-y">
              {quebras.map((q) => {
                const st = situacaoDoCaixa(q.classe, q.andamento);
                const dif = Number(q.diferenca);
                const anx = anexos.get(q.id) ?? [];
                return (
                  <li key={q.id}>
                    <details className="group px-4 py-2.5">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="w-20 tabular-nums text-muted-foreground">{formatarData(q.dia)}</span>
                        <span className="font-mono text-xs">{q.filial?.codigo}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {q.origem === "manual" ? "Lançada pelo financeiro" : `Caixa ${q.numero_caixa}`} · {q.nome_operador}
                        </span>
                        <span className={`font-semibold tabular-nums ${dif > 0 ? "text-red-700" : "text-sky-700"}`}>{textoDiferenca(dif)}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[st]}`}>{ROTULO_SITUACAO[st]}</span>
                        {anx.length > 0 && <span className="text-xs text-muted-foreground">📎 {anx.length}</span>}
                      </summary>
                      <div className="mt-2 space-y-2 pl-0 text-sm sm:pl-[5.75rem]">
                        {q.origem === "manual" && q.descricao && <p className="text-muted-foreground">Motivo: {q.descricao}</p>}
                        {q.justificativa ? (
                          <p className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">
                            {q.justificativa}
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {q.justificada_por_nome ?? "—"} · {formatarDataHora(q.justificada_em)}
                            </span>
                          </p>
                        ) : (
                          <p className="text-amber-800">Ainda sem justificativa do gestor da loja.</p>
                        )}
                        {q.decisao_obs && <p className="text-muted-foreground">Financeiro: {q.decisao_obs}</p>}
                        <AnexosQuebra anexos={anx} usuarioId={usuarioId} aberta={false} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            {quebras.length >= 1000 && <p className="px-4 py-2 text-xs text-muted-foreground">Mostrando as 1.000 mais recentes: filtre por loja ou mês.</p>}
          </section>
        </div>
      )}
    </>
  );
}
