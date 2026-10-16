import React from "react";
import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { fluxoDiario, fluxoMensal, fluxoSemanal } from "@/lib/data/caixa";
import { listarCompetenciasFinanceiro } from "@/lib/data/financeiro";
import { podeFecharMes } from "@/lib/financeiro/permissoes";
import { EMPRESAS_CAIXA } from "@/lib/financeiro/rotulos";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { competenciaAtual, rotuloCompetencia } from "@/lib/rh/competencia";
import { CelulaEditavel } from "../dre/celula-editavel";
import { salvarFluxoDiario, salvarFluxoMensal } from "./actions";
import { CampoTexto } from "./campo-texto";

export const metadata = { title: "Caixa" };

const RECEBER = [
  ["receber_dinheiro", "Dinheiro (depósito)"],
  ["receber_pix", "PIX (provisão)"],
  ["receber_boletos", "Boletos"],
] as const;
const SALDOS = [
  ["saldo_omiecash", "OmieCash"],
  ["saldo_sicredi", "Sicredi"],
  ["saldo_itau", "Itaú"],
  ["saldo_santander", "Santander"],
] as const;
const ABAS = [
  { chave: "diario", rotulo: "Diário (foto do dia)" },
  { chave: "mensal", rotulo: "Mensal (provisão × realizado)" },
  { chave: "semanal", rotulo: "Dia a dia do mês" },
] as const;
const tom = (v: number) => (v < 0 ? "text-red-700" : "text-emerald-700");
const acertividade = (prov: number | null, real: number | null) => {
  if (prov == null || prov === 0 || real == null) return <span className="text-muted-foreground">—</span>;
  const p = ((real - prov) / Math.abs(prov)) * 100;
  const cor = Math.abs(p) <= 5 ? "text-emerald-700" : Math.abs(p) <= 15 ? "text-amber-700" : "text-red-700";
  return <span className={`font-semibold ${cor}`}>{p > 0 ? "+" : ""}{p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>;
};

export default async function CaixaPage({ searchParams }: PageProps<"/financeiro/caixa">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/caixa"), searchParams]);
  const aba = sp.aba === "mensal" || sp.aba === "semanal" ? sp.aba : "diario";
  const hoje = new Date().toISOString().slice(0, 10);
  const data = typeof sp.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje;
  const competencias = await listarCompetenciasFinanceiro();
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : (competencias[0] ?? competenciaAtual());
  const podeEditar = podeFecharMes(sessao.papel);
  const opcoesMes = [...new Set([competenciaAtual(), ...competencias, mes])].sort().reverse();

  return (
    <>
      <PageHeader eyebrow="Financeiro" titulo="Caixa" descricao="Acompanhamento da diretoria por empresa (VARELA inclui Itajaí; NAZÁRIO inclui Blumenau): foto do dia, provisão × realizado do mês e o dia a dia." />

      <nav aria-label="Abas" className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <Link key={a.chave} href={`/financeiro/caixa?aba=${a.chave}&data=${data}&mes=${mes}`} aria-current={aba === a.chave ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${aba === a.chave ? "border-fct-navy bg-fct-navy text-white" : "bg-card hover:border-fct-navy/40"}`}>
            {a.rotulo}
          </Link>
        ))}
      </nav>

      {aba === "diario" && (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <input type="hidden" name="aba" value="diario" />
            <Input name="data" type="date" defaultValue={data} className="w-44" aria-label="Data" />
            <Button type="submit" variant="outline" size="sm">
              Ver dia
            </Button>
            <span className="text-xs text-muted-foreground">O pago do dia vem dos lançamentos realizados na data; o a receber é a soma de dinheiro/PIX/boletos. Totais podem ser digitados (apague para voltar ao automático).</span>
          </form>
          <DiarioView data={data} podeEditar={podeEditar} />
        </>
      )}
      {aba === "mensal" && (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <input type="hidden" name="aba" value="mensal" />
            <SelectNativo name="mes" defaultValue={mes} className="w-48" aria-label="Mês">
              {opcoesMes.map((m) => (
                <option key={m} value={m}>
                  {rotuloCompetencia(m)}
                </option>
              ))}
            </SelectNativo>
            <Button type="submit" variant="outline" size="sm">
              Ver mês
            </Button>
            <span className="text-xs text-muted-foreground">Realizado das despesas vem dos lançamentos por família financeira; preencha a provisão e o faturamento/recebimento para ver a acertividade.</span>
          </form>
          <MensalView mes={mes} podeEditar={podeEditar} />
        </>
      )}
      {aba === "semanal" && (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <input type="hidden" name="aba" value="semanal" />
            <SelectNativo name="mes" defaultValue={mes} className="w-48" aria-label="Mês">
              {opcoesMes.map((m) => (
                <option key={m} value={m}>
                  {rotuloCompetencia(m)}
                </option>
              ))}
            </SelectNativo>
            <Button type="submit" variant="outline" size="sm">
              Ver mês
            </Button>
            <span className="text-xs text-muted-foreground">Clique num dia para abrir famílias e categorias. Fins de semana em cinza.</span>
          </form>
          <SemanalView mes={mes} />
        </>
      )}
    </>
  );
}

async function DiarioView({ data, podeEditar }: { data: string; podeEditar: boolean }) {
  const empresas = await fluxoDiario(data);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {empresas.map((e) => {
        const cfg = EMPRESAS_CAIXA.find((x) => x.nome === e.empresa)!;
        const g = (c: string) => e.campos[c] ?? null;
        const recebAuto = RECEBER.reduce((s, [c]) => s + (g(c) ?? 0), 0);
        const receber = g("receber_override") ?? recebAuto;
        const pagar = g("pagar_override") ?? e.pagoAuto;
        const balanco = receber - pagar;
        const saldos = SALDOS.reduce((s, [c]) => s + (g(c) ?? 0), 0);
        const conf = g("conf_valor");
        const dif = conf == null ? null : conf - receber;
        const base = { grupo: e.empresa, data };
        return (
          <section key={e.empresa} className={`rounded-xl border border-t-4 bg-card p-5 ${cfg.borda}`}>
            <h2 className={`mb-3 text-base font-semibold ${cfg.cor}`}>{e.empresa}</h2>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">A receber (dia)</td>
                  <CelulaEditavel action={salvarFluxoDiario} campos={{ ...base, campo: "receber_override" }} valorAtual={g("receber_override")} exibicao={formatarMoeda(receber)} automatico={formatarMoeda(recebAuto)} ajustado={g("receber_override") != null} classe="text-base font-semibold text-emerald-700" podeEditar={podeEditar} />
                </tr>
                <tr className="border-b">
                  <td className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">A pagar (dia)</td>
                  <CelulaEditavel action={salvarFluxoDiario} campos={{ ...base, campo: "pagar_override" }} valorAtual={g("pagar_override")} exibicao={formatarMoeda(pagar)} automatico={formatarMoeda(e.pagoAuto)} ajustado={g("pagar_override") != null} classe="text-base font-semibold text-red-700" podeEditar={podeEditar} />
                </tr>
                <tr className="border-b">
                  <td className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Balanço</td>
                  <td className={`py-1.5 text-right text-base font-semibold tabular-nums ${tom(balanco)}`}>{formatarMoeda(balanco)}</td>
                </tr>
                <tr>
                  <td colSpan={2} className="pt-3 pb-1 font-semibold">
                    Conferência de caixa
                  </td>
                </tr>
                <tr>
                  <td className="py-1">Valor esperado (a receber)</td>
                  <td className="py-1 text-right tabular-nums">{formatarMoeda(receber)}</td>
                </tr>
                <tr>
                  <td className="py-1">Valor conferido (contado)</td>
                  <CelulaEditavel action={salvarFluxoDiario} campos={{ ...base, campo: "conf_valor" }} valorAtual={conf} exibicao={conf == null ? "—" : formatarMoeda(conf)} podeEditar={podeEditar} />
                </tr>
                <tr className="border-b">
                  <td className="py-1 font-semibold">Diferença</td>
                  <td className={`py-1 text-right font-semibold tabular-nums ${dif === null ? "text-muted-foreground" : Math.abs(dif) < 1 ? "text-emerald-700" : "text-red-700"}`}>{dif === null ? "—" : Math.abs(dif) < 1 ? "✓ bate" : `${dif > 0 ? "+" : ""}${formatarMoeda(dif)}`}</td>
                </tr>
                <tr>
                  <td colSpan={2} className="py-1">
                    <CampoTexto action={salvarFluxoDiario} campos={{ ...base, campo: "conf_motivo", tipo: "texto" }} valorAtual={e.textos.conf_motivo ?? ""} placeholder="Motivo da diferença (opcional)" podeEditar={podeEditar} />
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="pt-3 pb-1 font-semibold">
                    A receber do dia
                  </td>
                </tr>
                {RECEBER.map(([c, r]) => (
                  <tr key={c}>
                    <td className="py-1">{r}</td>
                    <CelulaEditavel action={salvarFluxoDiario} campos={{ ...base, campo: c }} valorAtual={g(c)} exibicao={g(c) == null ? "—" : formatarMoeda(g(c)!)} podeEditar={podeEditar} />
                  </tr>
                ))}
                <tr className="border-b font-semibold">
                  <td className="py-1">Total a receber</td>
                  <td className="py-1 text-right tabular-nums text-emerald-700">{formatarMoeda(receber)}</td>
                </tr>
                <tr>
                  <td colSpan={2} className="pt-3 pb-1 font-semibold">
                    Saldo por conta
                  </td>
                </tr>
                {SALDOS.map(([c, r]) => (
                  <tr key={c}>
                    <td className="py-1">{r}</td>
                    <CelulaEditavel action={salvarFluxoDiario} campos={{ ...base, campo: c }} valorAtual={g(c)} exibicao={g(c) == null ? "—" : formatarMoeda(g(c)!)} podeEditar={podeEditar} />
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1">Total em conta</td>
                  <td className="py-1 text-right tabular-nums">{formatarMoeda(saldos)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Lançado no sistema em {formatarData(data)}: pago {formatarMoeda(e.pagoAuto)} · recebido {formatarMoeda(e.recebidoLancado)}.</p>
          </section>
        );
      })}
    </div>
  );
}

async function MensalView({ mes, podeEditar }: { mes: string; podeEditar: boolean }) {
  const empresas = await fluxoMensal(mes);
  return (
    <div className="space-y-6">
      {empresas.map((e) => {
        const cfg = EMPRESAS_CAIXA.find((x) => x.nome === e.empresa)!;
        const inp = (linha: string) => e.inputs[linha] ?? { provisao: null, realizado: null };
        const base = { grupo: e.empresa, competencia: mes };
        const recReal = inp("Recebimento").realizado ?? e.recebidoAuto;
        let totDReal = 0;
        let totDProv = 0;
        for (const d of e.despesas) {
          totDReal += inp(d.familia).realizado ?? d.realizadoAuto;
          totDProv += inp(d.familia).provisao ?? 0;
        }
        const saldoReal = recReal - totDReal;
        const saldoProv = (inp("Recebimento").provisao ?? 0) - totDProv;
        const linha = (nome: string, provisao: number | null, real: number | null, auto: number | null, negrito = false) => (
          <tr key={nome} className={negrito ? "font-semibold" : ""}>
            <td className="px-2 py-1">{nome}</td>
            <CelulaEditavel action={salvarFluxoMensal} campos={{ ...base, linha: nome, campo: "provisao" }} valorAtual={provisao} exibicao={provisao == null ? "—" : formatarMoeda(provisao)} podeEditar={podeEditar} />
            <CelulaEditavel action={salvarFluxoMensal} campos={{ ...base, linha: nome, campo: "realizado" }} valorAtual={inp(nome).realizado} exibicao={real == null ? "—" : formatarMoeda(real)} automatico={auto == null ? undefined : formatarMoeda(auto)} ajustado={inp(nome).realizado != null} classe={auto != null && inp(nome).realizado == null ? "text-muted-foreground" : ""} podeEditar={podeEditar} />
            <td className="px-2 py-1 text-right">{acertividade(provisao, real)}</td>
          </tr>
        );
        return (
          <section key={e.empresa} className="rounded-xl border bg-card">
            <h2 className={`border-l-4 px-4 py-3 text-base font-semibold ${cfg.cor} ${cfg.borda.replace("border-t-", "border-l-")}`}>{e.empresa}</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-y">
                  <th className="px-2 py-2 text-left">Linha</th>
                  <th className="px-2 py-2 text-right">Provisão</th>
                  <th className="px-2 py-2 text-right">Realizado</th>
                  <th className="px-2 py-2 text-right">Acertividade</th>
                </tr>
              </thead>
              <tbody>
                {linha("Faturamento", inp("Faturamento").provisao, inp("Faturamento").realizado, null, true)}
                {linha("Recebimento", inp("Recebimento").provisao, recReal, e.recebidoAuto, true)}
                {e.despesas.map((d) => linha(d.familia, inp(d.familia).provisao, inp(d.familia).realizado ?? d.realizadoAuto, d.realizadoAuto))}
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="px-2 py-1.5">
                    SALDO DO MÊS <span className="text-xs font-normal text-muted-foreground">(recebimento − despesas)</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{saldoProv ? formatarMoeda(saldoProv) : "—"}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${tom(saldoReal)}`}>{formatarMoeda(saldoReal)}</td>
                  <td className="px-2 py-1.5 text-right">{acertividade(saldoProv || null, saldoReal)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

async function SemanalView({ mes }: { mes: string }) {
  const dias = await fluxoSemanal(mes);
  const [ano, mm] = mes.split("-").map(Number);
  const qtdDias = new Date(Date.UTC(ano, mm, 0)).getUTCDate();
  const DS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const porDia = new Map(dias.map((d) => [d.dia, d]));
  const totais: Record<string, { receber: number; pagar: number }> = {};
  for (const e of EMPRESAS_CAIXA) totais[e.nome] = { receber: 0, pagar: 0 };
  const cel = (v: { receber: number; pagar: number } | undefined) => {
    const r = v?.receber ?? 0;
    const p = v?.pagar ?? 0;
    const b = r - p;
    return (
      <>
        <td className="border-l px-2 py-1 text-right tabular-nums text-emerald-700">{r ? formatarMoeda(r) : "—"}</td>
        <td className="px-2 py-1 text-right tabular-nums text-red-700">{p ? formatarMoeda(p) : "—"}</td>
        <td className={`px-2 py-1 text-right tabular-nums ${b > 0 ? "text-emerald-700" : b < 0 ? "text-red-700" : ""}`}>{r || p ? formatarMoeda(b) : "—"}</td>
      </>
    );
  };
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th rowSpan={2} className="px-2 py-2 text-left">
              Dia
            </th>
            {EMPRESAS_CAIXA.map((e) => (
              <th key={e.nome} colSpan={3} className={`border-l px-2 py-1 text-center ${e.cor}`}>
                {e.nome}
              </th>
            ))}
          </tr>
          <tr className="border-b">
            {EMPRESAS_CAIXA.map((e) => (
              <React.Fragment key={e.nome}>
                <th className="border-l px-2 py-1 text-right">A receber</th>
                <th className="px-2 py-1 text-right">A pagar</th>
                <th className="px-2 py-1 text-right">Balanço</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: qtdDias }, (_, i) => i + 1).map((d) => {
            const dia = `${mes}-${String(d).padStart(2, "0")}`;
            const wd = new Date(Date.UTC(ano, mm - 1, d)).getUTCDay();
            const fds = wd === 0 || wd === 6;
            const dados = porDia.get(dia);
            for (const e of EMPRESAS_CAIXA) {
              totais[e.nome].receber += dados?.porEmpresa[e.nome]?.receber ?? 0;
              totais[e.nome].pagar += dados?.porEmpresa[e.nome]?.pagar ?? 0;
            }
            const familias = dados ? [...new Set(dados.detalhe.map((x) => x.familia))] : [];
            return (
              <React.Fragment key={dia}>
                <tr className={fds ? "bg-muted/40" : ""}>
                  <td className="px-2 py-1">
                    {dados ? (
                      <details className="group">
                        <summary className="cursor-pointer list-none">
                          <span className="inline-block w-3 text-fct-green group-open:rotate-90">▸</span> {String(d).padStart(2, "0")} <span className="text-xs text-muted-foreground">{DS[wd]}</span>
                        </summary>
                        <div className="mt-1 space-y-0.5 pl-4 text-xs">
                          {familias.map((f) => (
                            <div key={f}>
                              <p className="font-semibold">{f}</p>
                              {dados.detalhe
                                .filter((x) => x.familia === f)
                                .map((x) => (
                                  <p key={x.categoria} className="text-muted-foreground">
                                    {x.categoria}: {EMPRESAS_CAIXA.map((e) => `${e.nome} ${formatarMoeda((x.porEmpresa[e.nome]?.receber ?? 0) - (x.porEmpresa[e.nome]?.pagar ?? 0))}`).join(" · ")}
                                  </p>
                                ))}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : (
                      <span>
                        <span className="inline-block w-3" /> {String(d).padStart(2, "0")} <span className="text-xs text-muted-foreground">{DS[wd]}</span>
                      </span>
                    )}
                  </td>
                  {EMPRESAS_CAIXA.map((e) => (
                    <React.Fragment key={e.nome}>{cel(dados?.porEmpresa[e.nome])}</React.Fragment>
                  ))}
                </tr>
              </React.Fragment>
            );
          })}
          <tr className="border-t-2 font-semibold">
            <td className="px-2 py-1.5">TOTAL DO MÊS</td>
            {EMPRESAS_CAIXA.map((e) => (
              <React.Fragment key={e.nome}>{cel(totais[e.nome])}</React.Fragment>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
