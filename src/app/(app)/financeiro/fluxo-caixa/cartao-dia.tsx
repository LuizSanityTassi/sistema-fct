import type { DiarioEmpresa } from "@/lib/data/caixa";
import { EMPRESAS_CAIXA } from "@/lib/financeiro/rotulos";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { salvarFluxoDiario } from "../caixa/actions";
import { CampoTexto } from "../caixa/campo-texto";
import { CelulaEditavel } from "../caixa-contabil/celula-editavel";
import { salvarMotivoCelula, salvarPrevisaoCelula } from "./actions";

const RECEBIDO = [
  ["receber_dinheiro", "Dinheiro (depósito)"],
  ["receber_pix", "PIX"],
  ["receber_boletos", "Boletos"],
] as const;
const SALDOS = [
  ["saldo_omiecash", "OmieCash"],
  ["saldo_sicredi", "Sicredi"],
  ["saldo_itau", "Itaú"],
  ["saldo_santander", "Santander"],
] as const;
const tom = (v: number) => (v < 0 ? "text-red-700" : "text-emerald-700");

type Props = {
  data: string;
  empresa: string;
  /** do fluxo: previsão do financeiro, a pagar do Omie (e onde ele se divide) e motivo do dia */
  fluxo: { receber: number | null; cartao: number | null; pagar: number; motivo: string | null; lugares: [string, number][] };
  /** da tela Caixa (os mesmos números): conferência, o que entrou e saldos das contas */
  caixa: DiarioEmpresa | undefined;
  podeEditar: boolean;
  /** conferência, recebido e saldos: só Administrador e Financeiro (como na tela Caixa) */
  podeCaixa: boolean;
};

/** Foto do dia de uma empresa: previsto × a pagar, conferência de caixa, o que entrou e o saldo das contas. */
export function CartaoDia({ data, empresa, fluxo, caixa, podeEditar, podeCaixa }: Props) {
  const cfg = EMPRESAS_CAIXA.find((x) => x.nome === empresa)!;
  const g = (c: string) => caixa?.campos[c] ?? null;
  const receber = fluxo.receber ?? 0;
  const balanco = receber - fluxo.pagar;
  const conf = g("conf_valor");
  const dif = conf == null ? null : conf - receber;
  const recebido = RECEBIDO.reduce((t, [c]) => t + (g(c) ?? 0), 0);
  const saldos = SALDOS.reduce((t, [c]) => t + (g(c) ?? 0), 0);
  const prev = { empresa, data };
  const cx = { grupo: empresa, data };

  return (
    <section className={`rounded-xl border border-t-4 bg-card p-5 ${cfg.borda}`}>
      <h2 className={`mb-3 text-base font-semibold ${cfg.cor}`}>{empresa}</h2>
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b">
            <td className="py-1.5 sobrescrito">A receber (dia)</td>
            <CelulaEditavel action={salvarPrevisaoCelula} campos={{ ...prev, campo: "receber" }} valorAtual={fluxo.receber} exibicao={formatarMoeda(receber)} classe="text-base font-semibold text-emerald-700" podeEditar={podeEditar} />
          </tr>
          <tr className="border-b align-top">
            <td className="py-1.5">
              <span className="sobrescrito">A pagar (dia)</span>
              {fluxo.lugares.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {fluxo.lugares.map(([l, v]) => (
                    <li key={l}>
                      {l}: {formatarMoeda(v)}
                    </li>
                  ))}
                </ul>
              )}
            </td>
            <td className="py-1.5 text-right text-base font-semibold tabular-nums text-red-700">{formatarMoeda(fluxo.pagar)}</td>
          </tr>
          <tr className="border-b">
            <td className="py-1.5 sobrescrito">Balanço</td>
            <td className={`py-1.5 text-right text-base font-semibold tabular-nums ${tom(balanco)}`}>{formatarMoeda(balanco)}</td>
          </tr>
          <tr className="border-b">
            <td className="py-1.5 sobrescrito">Previsão de cartão (dia)</td>
            <CelulaEditavel action={salvarPrevisaoCelula} campos={{ ...prev, campo: "cartao" }} valorAtual={fluxo.cartao} exibicao={fluxo.cartao == null ? "—" : formatarMoeda(fluxo.cartao)} classe="font-semibold text-amber-700" podeEditar={podeEditar} />
          </tr>
          <tr>
            <td colSpan={2} className="pt-2 pb-1">
              <CampoTexto action={salvarMotivoCelula} campos={prev} valorAtual={fluxo.motivo ?? ""} placeholder="Fatores causais do dia (ex.: aluguel + boletos)" podeEditar={podeEditar} />
            </td>
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
            <CelulaEditavel action={salvarFluxoDiario} campos={{ ...cx, campo: "conf_valor" }} valorAtual={conf} exibicao={conf == null ? "—" : formatarMoeda(conf)} podeEditar={podeCaixa} />
          </tr>
          <tr className="border-b">
            <td className="py-1 font-semibold">Diferença</td>
            <td className={`py-1 text-right font-semibold tabular-nums ${dif === null ? "text-muted-foreground" : Math.abs(dif) < 1 ? "text-emerald-700" : "text-red-700"}`}>
              {dif === null ? "—" : Math.abs(dif) < 1 ? "✓ bate" : `${dif > 0 ? "+" : ""}${formatarMoeda(dif)}`}
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="py-1">
              <CampoTexto action={salvarFluxoDiario} campos={{ ...cx, campo: "conf_motivo", tipo: "texto" }} valorAtual={caixa?.textos.conf_motivo ?? ""} placeholder="Motivo da diferença (opcional)" podeEditar={podeCaixa} />
            </td>
          </tr>

          <tr>
            <td colSpan={2} className="pt-3 pb-1 font-semibold">
              A receber do dia (o que entrou)
            </td>
          </tr>
          {RECEBIDO.map(([c, r]) => (
            <tr key={c}>
              <td className="py-1">{r}</td>
              <CelulaEditavel action={salvarFluxoDiario} campos={{ ...cx, campo: c }} valorAtual={g(c)} exibicao={g(c) == null ? "—" : formatarMoeda(g(c)!)} podeEditar={podeCaixa} />
            </tr>
          ))}
          <tr className="border-b font-semibold">
            <td className="py-1">Total recebido</td>
            <td className="py-1 text-right tabular-nums text-emerald-700">{formatarMoeda(recebido)}</td>
          </tr>

          <tr>
            <td colSpan={2} className="pt-3 pb-1 font-semibold">
              Saldo por conta
            </td>
          </tr>
          {SALDOS.map(([c, r]) => (
            <tr key={c}>
              <td className="py-1">{r}</td>
              <CelulaEditavel action={salvarFluxoDiario} campos={{ ...cx, campo: c }} valorAtual={g(c)} exibicao={g(c) == null ? "—" : formatarMoeda(g(c)!)} podeEditar={podeCaixa} />
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1">Total em conta</td>
            <td className="py-1 text-right tabular-nums">{formatarMoeda(saldos)}</td>
          </tr>
        </tbody>
      </table>
      {caixa && (
        <p className="mt-2 text-xs text-muted-foreground">
          Lançado no sistema em {formatarData(data)}: pago {formatarMoeda(caixa.pagoAuto)} · recebido {formatarMoeda(caixa.recebidoLancado)}.
        </p>
      )}
    </section>
  );
}
