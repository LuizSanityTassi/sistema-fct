import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botões Excel / CSV / Imprimir (PDF) de um relatório do ponto. */
export function BotoesExportar({ params }: { params: Record<string, string | undefined> }) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const com = (extra: Record<string, string>) => `${new URLSearchParams([...qs, ...Object.entries(extra)])}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" nativeButton={false} render={<a href={`/api/ponto/exportar?${com({ formato: "xlsx" })}`} />}>
        <FileSpreadsheet aria-hidden /> Excel
      </Button>
      <Button variant="outline" nativeButton={false} render={<a href={`/api/ponto/exportar?${com({ formato: "csv" })}`} />}>
        <FileText aria-hidden /> CSV
      </Button>
      <Button variant="outline" nativeButton={false} render={<a href={`/imprimir/ponto?${qs}`} target="_blank" rel="noopener" />}>
        <Printer aria-hidden /> Imprimir / PDF
      </Button>
    </div>
  );
}
