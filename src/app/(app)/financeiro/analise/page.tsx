import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { inadimplencia } from "@/lib/data/analise";
import { lerEscopo } from "@/lib/data/dre";
import { podeFecharMes } from "@/lib/financeiro/permissoes";
import { formatarMoeda } from "@/lib/formatos";
import { salvarInadimplencia } from "../caixa/actions";
import { CelulaEditavel } from "../caixa-contabil/celula-editavel";

export const metadata = { title: "Inadimplência" };

const MES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const pct = (v: number, casas = 1) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
/** Abas que moravam aqui e passaram para o Caixa contábil (links antigos continuam funcionando). */
const ABAS_NO_CAIXA = ["ranking", "resumo", "comparativo"];

/** Inadimplência de crediário e convênio. Ranking de lojas, resumo por loja e comparativo mês a mês ficam no Caixa contábil. */
export default async function AnalisePage({ searchParams }: PageProps<"/financeiro/analise">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/analise"), searchParams]);
  if (typeof sp.aba === "string" && ABAS_NO_CAIXA.includes(sp.aba)) {
    const u = new URLSearchParams({ aba: sp.aba });
    for (const k of ["grupo", "filial", "ano", "mes", "metrica"]) if (typeof sp[k] === "string" && sp[k]) u.set(k, sp[k]);
    redirect(`/financeiro/caixa-contabil?${u}`);
  }
  const escopo = lerEscopo(sp);
  const podeEditar = podeFecharMes(sessao.papel);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Inadimplência"
        descricao="Inadimplência de crediário e convênio, mês a mês, com a taxa sobre o recebido."
        acoes={
          <Button variant="outline" nativeButton={false} render={<Link href="/financeiro/caixa-contabil?aba=ranking" />}>
            Ranking, resumo por loja e comparativo
          </Button>
        }
      />
      <InadimplenciaView podeEditar={podeEditar} anoBase={Number(escopo.ano)} />
    </>
  );
}

async function InadimplenciaView({ podeEditar, anoBase }: { podeEditar: boolean; anoBase: number }) {
  const rows = await inadimplencia();
  const anos = [anoBase - 1, anoBase];
  const TIPOS = [
    ["crediario", "Crediário"],
    ["convenio", "Convênio"],
  ] as const;
  const g = (tipo: string, ano: number, mes: number) => rows.find((r) => r.tipo === tipo && r.ano === ano && r.mes === mes);
  const taxa = (a: number | null | undefined, r: number | null | undefined) => {
    if (a == null || r == null || r === 0) return <span className="text-muted-foreground">—</span>;
    const t = (a / r) * 100;
    return <span className={`font-semibold ${t > 10 ? "text-red-700" : t > 5 ? "text-amber-700" : "text-emerald-700"}`}>{pct(t, 2)}</span>;
  };
  // resumo do último mês com dado no ano base
  const comDado = rows.filter((r) => r.ano === anoBase && (r.atrasado != null || r.recebido != null)).map((r) => r.mes);
  const ultMes = comDado.length ? Math.max(...comDado) : 0;
  const soma = (ano: number, mes: number, campo: "atrasado" | "recebido") => rows.filter((r) => r.ano === ano && r.mes === mes).reduce((s, r) => s + (r[campo] ?? 0), 0);
  const atA = soma(anoBase, ultMes, "atrasado");
  const reA = soma(anoBase, ultMes, "recebido");
  const txA = reA > 0 ? (atA / reA) * 100 : null;
  const mesAnt = ultMes > 1 ? ultMes - 1 : 12;
  const anoAnt = ultMes > 1 ? anoBase : anoBase - 1;
  const reB = soma(anoAnt, mesAnt, "recebido");
  const txB = reB > 0 ? (soma(anoAnt, mesAnt, "atrasado") / reB) * 100 : null;
  const vari = txA != null && txB != null ? txA - txB : null;

  return (
    <div className="space-y-6">
      {ultMes > 0 && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [`Em atraso — ${MES[ultMes]}/${anoBase}`, formatarMoeda(atA), "text-red-700"],
            ["Recebido", formatarMoeda(reA), "text-emerald-700"],
            ["Taxa atual", txA == null ? "—" : pct(txA, 2), txA == null ? "" : txA > 10 ? "text-red-700" : txA > 5 ? "text-amber-700" : "text-emerald-700"],
            ["Variação vs mês anterior", vari == null ? "—" : `${vari > 0.05 ? "+" : ""}${vari.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`, vari == null ? "" : vari > 0 ? "text-red-700" : "text-emerald-700"],
          ].map(([r, v, t]) => (
            <div key={r} className="rounded-xl border bg-card p-4">
              <p className="rotulo">{r}</p>
              <p className={`mt-1 numero-sm ${t}`}>{v}</p>
            </div>
          ))}
        </section>
      )}
      {TIPOS.map(([tipo, rotulo]) => (
        <section key={tipo} className="overflow-x-auto rounded-xl border bg-card">
          <h2 className="px-4 py-3 text-sm font-semibold">{rotulo}</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-y">
                <th rowSpan={2} className="px-2 py-1 text-left">
                  Mês
                </th>
                {anos.map((a) => (
                  <th key={a} colSpan={3} className="border-l px-2 py-1 text-center">
                    {a}
                  </th>
                ))}
              </tr>
              <tr className="border-b">
                {anos.map((a) => (
                  <React.Fragment key={a}>
                    <th className="border-l px-2 py-1 text-right">Atrasado</th>
                    <th className="px-2 py-1 text-right">Recebido</th>
                    <th className="px-2 py-1 text-right">Taxa</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
                <tr key={mes} className="border-b last:border-0">
                  <td className="px-2 py-1">{MES[mes]}</td>
                  {anos.map((a) => {
                    const r = g(tipo, a, mes);
                    return (
                      <React.Fragment key={a}>
                        <CelulaEditavel action={salvarInadimplencia} campos={{ tipo, ano: String(a), mes: String(mes), campo: "atrasado" }} valorAtual={r?.atrasado ?? null} exibicao={r?.atrasado == null ? "—" : formatarMoeda(r.atrasado)} classe="border-l" podeEditar={podeEditar} />
                        <CelulaEditavel action={salvarInadimplencia} campos={{ tipo, ano: String(a), mes: String(mes), campo: "recebido" }} valorAtual={r?.recebido ?? null} exibicao={r?.recebido == null ? "—" : formatarMoeda(r.recebido)} podeEditar={podeEditar} />
                        <td className="px-2 py-1 text-right">{taxa(r?.atrasado, r?.recebido)}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="px-2 py-1">Total / taxa</td>
                {anos.map((a) => {
                  const at = rows.filter((r) => r.tipo === tipo && r.ano === a).reduce((s, r) => s + (r.atrasado ?? 0), 0);
                  const re = rows.filter((r) => r.tipo === tipo && r.ano === a).reduce((s, r) => s + (r.recebido ?? 0), 0);
                  return (
                    <React.Fragment key={a}>
                      <td className="border-l px-2 py-1 text-right tabular-nums">{formatarMoeda(at)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatarMoeda(re)}</td>
                      <td className="px-2 py-1 text-right">{taxa(at, re)}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{podeEditar ? "Digite atrasado e recebido de cada mês; " : ""}a taxa aparece sozinha (verde ≤ 5%, amarelo ≤ 10%, vermelho acima).</p>
    </div>
  );
}
