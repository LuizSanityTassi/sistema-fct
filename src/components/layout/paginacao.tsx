import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginacaoProps = {
  pagina: number;
  paginas: number;
  total: number;
  tamanho: number;
  /** Parâmetros atuais da URL, preservados ao trocar de página. */
  params: Record<string, string | undefined>;
};

export function Paginacao({ pagina, paginas, total, tamanho, params }: PaginacaoProps) {
  const link = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("pagina", String(p));
    return `?${sp.toString()}`;
  };
  const de = total === 0 ? 0 : (pagina - 1) * tamanho + 1;
  const ate = Math.min(total, pagina * tamanho);
  const classe = buttonVariants({ variant: "outline", size: "sm" });
  const desabilitado = cn(classe, "pointer-events-none opacity-50");

  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span aria-live="polite">
        Mostrando {de}–{ate} de {total}
      </span>
      <nav aria-label="Paginação" className="flex items-center gap-2">
        {pagina > 1 ? (
          <Link href={link(pagina - 1)} className={classe} rel="prev" aria-label={`Página anterior (${pagina - 1} de ${paginas})`}>
            Anterior
          </Link>
        ) : (
          <span className={desabilitado} aria-disabled="true">
            Anterior
          </span>
        )}
        <span className="px-1" aria-current="page">
          Página {pagina} de {paginas}
        </span>
        {pagina < paginas ? (
          <Link href={link(pagina + 1)} className={classe} rel="next" aria-label={`Próxima página (${pagina + 1} de ${paginas})`}>
            Próxima
          </Link>
        ) : (
          <span className={desabilitado} aria-disabled="true">
            Próxima
          </span>
        )}
      </nav>
    </div>
  );
}
