import Link from "next/link";
import { FileUp } from "lucide-react";

/** Abas do Caixa contábil: o demonstrativo e "Importar novo mês" (para o contador subir o mês; só quem lança). */
export function AbasCaixaContabil({ ativa, podeImportar }: { ativa: "demonstrativo" | "importar"; podeImportar: boolean }) {
  if (!podeImportar) return null;
  const classe = (sel: boolean) => `rounded-full border px-3 py-1 ${sel ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`;
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Caixa contábil">
      <Link href="/financeiro/caixa-contabil" aria-current={ativa === "demonstrativo" ? "page" : undefined} className={classe(ativa === "demonstrativo")}>
        Demonstrativo
      </Link>
      <Link href="/financeiro/caixa-contabil/importar" aria-current={ativa === "importar" ? "page" : undefined} className={`inline-flex items-center gap-1.5 ${classe(ativa === "importar")}`}>
        <FileUp className="size-3.5" aria-hidden />
        Importar novo mês
      </Link>
    </nav>
  );
}
