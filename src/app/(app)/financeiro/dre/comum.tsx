// Peças comuns das visões da DRE (resumo, demonstrativo, comparativo e rateio).
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, FileUp } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import type { MapaDre, RateioDre } from "@/lib/data/dre-contabil";

/** Valor do filtro "Empresa" que junta todas as empresas com DRE importada. */
export const TODAS = "todas";

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const mostraPct = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : pct.format(v));
export const tom = (v: number) => (v < 0 ? "text-red-700 dark:text-red-400" : v > 0 ? "text-emerald-700 dark:text-emerald-400" : "");
export const query = (p: Record<string, string | undefined>) => new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();

export type Direcao = "asc" | "desc";
export type Filial = { id: string; codigo: string; nome: string; empresa: string };

export type Props = {
  s: (k: string) => string;
  base: { empresa: string; ano: string };
  /** empresas com DRE (o filtro ainda oferece "Todas as empresas" quando há mais de uma) */
  empresas: string[];
  /** "todas as empresas" escolhido no filtro */
  todas: boolean;
  anos: string[];
  mesesDoAno: string[];
  mapa: MapaDre;
  rateios: RateioDre[];
  filiais: Filial[];
  /** meses que cada empresa escolhida tem importados (para avisar quando o total junta empresas diferentes) */
  mesesPorEmpresa: Map<string, Set<string>>;
};

export const VISOES_DRE = [
  ["resumo", "Resumo por filial"],
  ["demonstrativo", "Demonstrativo"],
  ["comparativo", "Comparativo"],
  ["rateio", "Rateio por faturamento"],
  ["lancar", "Lançar setembro"],
] as const;
export type VisaoDre = (typeof VISOES_DRE)[number][0];

/**
 * Abas da DRE: as visões (mesma tela, ?ver=) e "Importar novo mês" (tela própria, para o contador subir a planilha do
 * mês; só para quem importa).
 */
export function AbasDre({ ativa, base, filial, podeImportar }: { ativa: VisaoDre | "importar"; base?: Props["base"]; filial?: string; podeImportar: boolean }) {
  const classe = (sel: boolean) => `rounded-full border px-3 py-1 ${sel ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`;
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Visões da DRE">
      {VISOES_DRE.filter(([v]) => v !== "lancar" || podeImportar).map(([v, r]) => (
        <Link
          key={v}
          href={`/financeiro/dre${base || v !== "resumo" ? "?" : ""}${query({ ...base, ver: v === "resumo" ? undefined : v, filial: v === "demonstrativo" ? filial : undefined })}`}
          aria-current={ativa === v ? "page" : undefined}
          className={classe(ativa === v)}
        >
          {r}
        </Link>
      ))}
      {podeImportar && (
        <Link href="/financeiro/dre/importar" aria-current={ativa === "importar" ? "page" : undefined} className={`inline-flex items-center gap-1.5 ${classe(ativa === "importar")}`}>
          <FileUp className="size-3.5" aria-hidden />
          Importar novo mês
        </Link>
      )}
    </nav>
  );
}

/** Empresas escolhidas que não têm DRE em algum dos meses dados. */
export function empresasSemDre(mesesPorEmpresa: Map<string, Set<string>>, meses: string[]) {
  return [...mesesPorEmpresa].filter(([, tem]) => meses.some((m) => !tem.has(m))).map(([e]) => e);
}

/**
 * Títulos de coluna que ordenam a tabela pela URL (?ordem=&dir=): 1º clique do maior para o menor (a coluna "filial":
 * A→Z), o 2º inverte; a seta mostra a coluna e o sentido. Voltar à ordem padrão da tela limpa os parâmetros.
 */
export function cabecalhosOrdenaveis(ordem: string, dir: Direcao, ordemPadrao: string, link: (p: { ordem?: string; dir?: Direcao }) => string) {
  return function Cabecalho(coluna: string, rotulo: string, className = "", title?: string) {
    const ativa = ordem === coluna;
    const padrao: Direcao = coluna === "filial" ? "asc" : "desc";
    const proxima: Direcao = ativa ? (dir === "desc" ? "asc" : "desc") : padrao;
    const Icone = !ativa ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
    const href = link({ ordem: coluna === ordemPadrao && proxima === padrao ? undefined : coluna, dir: proxima === padrao ? undefined : proxima });
    return (
      <TableHead key={coluna} className={className} title={title} aria-sort={ativa ? (dir === "desc" ? "descending" : "ascending") : undefined}>
        <Link href={href} scroll={false} className={`inline-flex items-center gap-1 hover:text-foreground ${ativa ? "font-semibold text-foreground" : ""}`}>
          {rotulo}
          <Icone className={`size-3.5 ${ativa ? "" : "opacity-40"}`} aria-hidden />
        </Link>
      </TableHead>
    );
  };
}

export function Filtros({ base, empresas, anos, ver, children }: { base: Props["base"]; empresas: string[]; anos: string[]; ver: string; children?: ReactNode }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      {ver !== "resumo" && <input type="hidden" name="ver" value={ver} />}
      {empresas.length > 1 && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Empresa</span>
          <SelectNativo name="empresa" defaultValue={base.empresa} className="w-48">
            <option value={TODAS}>Todas as empresas</option>
            {empresas.map((e) => (
              <option key={e} value={e}>
                {e.replace("+", " + ")}
              </option>
            ))}
          </SelectNativo>
        </label>
      )}
      {empresas.length === 1 && <input type="hidden" name="empresa" value={base.empresa} />}
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Ano</span>
        <SelectNativo name="ano" defaultValue={base.ano} className="w-28">
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectNativo>
      </label>
      {children}
      <Button type="submit" variant="outline">
        Ver
      </Button>
    </form>
  );
}

/** Lista de filiais para um select: agrupada por empresa quando a visão junta todas. */
export function OpcoesFiliais({ filiais, todas }: { filiais: Filial[]; todas: boolean }) {
  const opcao = (f: Filial) => (
    <option key={f.id} value={f.id}>
      {f.codigo} — {f.nome}
    </option>
  );
  if (!todas) return <>{filiais.map(opcao)}</>;
  const empresas = [...new Set(filiais.map((f) => f.empresa))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return (
    <>
      {empresas.map((e) => (
        <optgroup key={e} label={e}>
          {filiais.filter((f) => f.empresa === e).map(opcao)}
        </optgroup>
      ))}
    </>
  );
}

/** Aviso de que o total do período junta meses em que alguma empresa ainda não tinha DRE. */
export function AvisoCobertura({ empresas, texto }: { empresas: string[]; texto: string }) {
  if (!empresas.length) return null;
  return (
    <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      {empresas.join(" e ")} {empresas.length > 1 ? "não têm" : "não tem"} DRE importada em todos os meses {texto}: o total junta só o que existe.
    </p>
  );
}

export function Cartao({ rotulo, valor, nota, tom: cor }: { rotulo: string; valor: string; nota?: string; tom?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="rotulo">{rotulo}</p>
      <p className={`mt-1.5 numero-sm ${cor ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}
