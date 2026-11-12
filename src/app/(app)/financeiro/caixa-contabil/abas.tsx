import Link from "next/link";
import { FileUp } from "lucide-react";

/** Visões de análise que moram junto com o demonstrativo (mesmo recorte de grupo, unidade e ano). */
export const ABAS_ANALISE = [
  { chave: "ranking", rotulo: "Ranking de lojas" },
  { chave: "resumo", rotulo: "Resumo por loja" },
  { chave: "comparativo", rotulo: "Comparativo mês a mês" },
] as const;
export type AbaAnalise = (typeof ABAS_ANALISE)[number]["chave"];
export type AbaCaixa = "demonstrativo" | AbaAnalise;
export const lerAbaCaixa = (v: unknown): AbaCaixa => (ABAS_ANALISE.some((a) => a.chave === v) ? (v as AbaAnalise) : "demonstrativo");

/**
 * Abas do Caixa contábil: o demonstrativo, o ranking de lojas, o resumo por loja, o comparativo mês a mês (todos na
 * mesma tela, ?aba=, mantendo o recorte) e "Importar novo mês" (tela própria, para o contador subir o mês; só quem lança).
 */
export function AbasCaixaContabil({ ativa, recorte = "", podeImportar }: { ativa: AbaCaixa | "importar"; recorte?: string; podeImportar: boolean }) {
  const classe = (sel: boolean) => `rounded-full border px-3 py-1 ${sel ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`;
  const href = (aba: AbaCaixa) => {
    const u = new URLSearchParams(recorte);
    if (aba === "demonstrativo") u.delete("aba");
    else u.set("aba", aba);
    const q = u.toString();
    return `/financeiro/caixa-contabil${q ? `?${q}` : ""}`;
  };
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Caixa contábil">
      <Link href={href("demonstrativo")} aria-current={ativa === "demonstrativo" ? "page" : undefined} className={classe(ativa === "demonstrativo")}>
        Demonstrativo
      </Link>
      {ABAS_ANALISE.map((a) => (
        <Link key={a.chave} href={href(a.chave)} aria-current={ativa === a.chave ? "page" : undefined} className={classe(ativa === a.chave)}>
          {a.rotulo}
        </Link>
      ))}
      {podeImportar && (
        <Link href="/financeiro/caixa-contabil/importar" aria-current={ativa === "importar" ? "page" : undefined} className={`inline-flex items-center gap-1.5 ${classe(ativa === "importar")}`}>
          <FileUp className="size-3.5" aria-hidden />
          Importar novo mês
        </Link>
      )}
    </nav>
  );
}
