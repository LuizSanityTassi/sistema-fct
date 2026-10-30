import Link from "next/link";
import type { VariacaoIndicador } from "@/components/layout/painel";
import { formatarMoeda } from "@/lib/formatos";
import { podeAcessar } from "@/lib/nav";
import type { AppRole } from "@/lib/roles";

export const moeda = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatarMoeda(v));
export const inteiro = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("pt-BR"));
export const decimal = (v: number | null | undefined, casas = 2) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
export const pct = (v: number | null | undefined, casas = 2) => (v === null || v === undefined ? "—" : `${decimal(v, casas)}%`);
/** R$ 3,43 mi · R$ 512,3 mil · R$ 812,40 */
export const moedaCurta = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${decimal(v / 1e6, 2)} mi`;
  if (a >= 1e4) return `R$ ${decimal(v / 1e3, 1)} mil`;
  return moeda(v);
};

/** Chip de variação em % (verde subiu, vermelho caiu); `inverso` para o que é melhor quando cai (CMV). */
export function variacao(atual: number | null, anterior: number | null, comparadoCom: string, inverso = false): VariacaoIndicador | null {
  if (atual === null || anterior === null || anterior <= 0) return null;
  const v = ((atual - anterior) / anterior) * 100;
  if (Math.abs(v) < 0.05) return { texto: "igual", direcao: "igual", tom: "neutro" };
  const subiu = v > 0;
  return {
    texto: `${subiu ? "+" : "−"}${decimal(Math.abs(v), 1)}%`,
    direcao: subiu ? "sobe" : "desce",
    tom: subiu !== inverso ? "sucesso" : "perigo",
    dica: `${subiu ? "Subiu" : "Caiu"} ${decimal(Math.abs(v), 1)}% em relação a ${comparadoCom}`,
  };
}

/** Variação em pontos percentuais (para % premium, CMV…). */
export function variacaoPp(atual: number | null, anterior: number | null, comparadoCom: string, inverso = false): VariacaoIndicador | null {
  if (atual === null || anterior === null) return null;
  const d = atual - anterior;
  if (Math.abs(d) < 0.05) return { texto: "igual", direcao: "igual", tom: "neutro" };
  const subiu = d > 0;
  return { texto: `${subiu ? "+" : "−"}${decimal(Math.abs(d), 1)} p.p.`, direcao: subiu ? "sobe" : "desce", tom: subiu !== inverso ? "sucesso" : "perigo", dica: `${pct(anterior, 1)} em ${comparadoCom}` };
}

/** Aviso de período incompleto: dias que o robô ainda não trouxe do Trier (os totais ficam menores). */
export function AvisoDiasFaltando({ faltam, texto, admin }: { faltam: number; texto: string; admin: boolean }) {
  if (!faltam) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-start gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong className="font-semibold">Período incompleto:</strong>
      <span>
        {faltam === 1 ? "falta o dia" : `faltam ${faltam} dias`} {texto} — os números ficam menores até o robô buscar.
        {admin ? (
          <>
            {" "}
            Busque em{" "}
            <Link href="/vendas/robo" className="font-medium underline">
              Automações → Robô de vendas
            </Link>{" "}
            ou espere a rodada da madrugada.
          </>
        ) : (
          " O robô completa de madrugada."
        )}
      </span>
    </div>
  );
}

const ABAS = [
  { href: "/vendas", rotulo: "Painel" },
  { href: "/vendas/filiais", rotulo: "Venda por filial" },
  { href: "/vendas/televendas", rotulo: "Televendas" },
] as const;

/** Abas das vendas (só as que o papel abre). */
export function AbasVendas({ ativa, papel }: { ativa: (typeof ABAS)[number]["href"]; papel: AppRole }) {
  const abas = ABAS.filter((a) => podeAcessar(papel, a.href));
  if (abas.length < 2) return null;
  return (
    <nav aria-label="Abas" className="mb-4 flex flex-wrap gap-2 print:hidden">
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          aria-current={a.href === ativa ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${a.href === ativa ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
