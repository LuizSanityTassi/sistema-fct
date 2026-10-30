import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import { hojeNoBrasil, MESES, somarDias, ultimoDia } from "@/lib/data/vendas";
import { formatarData } from "@/lib/formatos";
import { INICIO_HISTORICO } from "@/lib/vendas/coleta";

/** Meses do histórico (mais recente primeiro) para o seletor. */
function mesesDisponiveis(ateMes: string) {
  const out: string[] = [];
  let [a, m] = ateMes.split("-").map(Number);
  const [a0, m0] = INICIO_HISTORICO.split("-").map(Number);
  while (a > a0 || (a === a0 && m >= m0)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (!m) {
      m = 12;
      a -= 1;
    }
  }
  return out;
}

export type PeriodoVendas = { ver: "mes" | "dia"; mes: string; meses: string[]; de: string; ate: string; ultimo: string; texto: string };

/** Período das telas de venda: ?ver=mes&mes=aaaa-mm (até o último dia lido) ou ?ver=dia&de=…&ate=…. `ultimo` = último dia
 * com vendas (ultimoDiaVendas: hoje quando o robô de hoje já leu, senão ontem). */
export function lerPeriodoVendas(sp: Record<string, string | string[] | undefined>, ultimo = somarDias(hojeNoBrasil(), -1)): PeriodoVendas {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const ver = s("ver") === "dia" ? "dia" : "mes";
  const meses = mesesDisponiveis(ultimo.slice(0, 7));
  const mes = meses.includes(s("mes")) ? s("mes") : meses[0];
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let de: string;
  let ate: string;
  if (ver === "mes") {
    const [a, m] = mes.split("-").map(Number);
    de = `${mes}-01`;
    ate = `${mes}-${String(ultimoDia(a, m)).padStart(2, "0")}`;
    if (ate > ultimo) ate = ultimo;
  } else {
    ate = iso.test(s("ate")) && s("ate") <= ultimo ? s("ate") : ultimo;
    de = iso.test(s("de")) && s("de") <= ate ? s("de") : ate;
  }
  const [am, mm] = mes.split("-").map(Number);
  const texto = ver === "mes" ? `${MESES[mm - 1]} de ${am}${ate.slice(0, 7) === ultimo.slice(0, 7) ? ` (até ${formatarData(ate)})` : ""}` : de === ate ? formatarData(de) : `${formatarData(de)} a ${formatarData(ate)}`;
  return { ver, mes, meses, de, ate, ultimo, texto };
}

/** Mensal/Diária + mês ou de/até (vai dentro do <form method="get"> da tela). `extra` = filtros mantidos ao trocar. */
export function CamposPeriodo({ p, rota, extra = "" }: { p: PeriodoVendas; rota: string; extra?: string }) {
  return (
    <>
      <div className="flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Período">
        {(["mes", "dia"] as const).map((v) => (
          <Link key={v} href={`${rota}?ver=${v}${extra}`} aria-current={p.ver === v ? "page" : undefined} className={`rounded-md px-3 py-1 ${p.ver === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            {v === "mes" ? "Mensal" : "Diária"}
          </Link>
        ))}
      </div>
      <input type="hidden" name="ver" value={p.ver} />
      {p.ver === "mes" ? (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Mês</span>
          <SelectNativo name="mes" defaultValue={p.mes} className="w-48">
            {p.meses.map((m) => {
              const [a, mm] = m.split("-").map(Number);
              return (
                <option key={m} value={m}>
                  {MESES[mm - 1]} de {a}
                </option>
              );
            })}
          </SelectNativo>
        </label>
      ) : (
        <>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">De</span>
            <Input name="de" type="date" defaultValue={p.de} min={INICIO_HISTORICO} max={p.ultimo} className="w-40" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Até</span>
            <Input name="ate" type="date" defaultValue={p.ate} min={INICIO_HISTORICO} max={p.ultimo} className="w-40" />
          </label>
        </>
      )}
    </>
  );
}
