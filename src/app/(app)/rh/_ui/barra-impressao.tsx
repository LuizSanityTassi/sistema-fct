"use client";

import Link from "next/link";
import { ChevronLeft, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { voltar: string; editar: string; faltam: string[] };

/** Fora do papel: voltar, imprimir ou salvar em PDF e o aviso do que falta no cadastro. */
export function BarraImpressao({ voltar, editar, faltam }: Props) {
  return (
    <div className="mx-auto mb-4 max-w-[794px] space-y-3 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={voltar} />}>
          <ChevronLeft data-icon="inline-start" /> Voltar
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer data-icon="inline-start" /> Imprimir ou salvar em PDF
        </Button>
      </div>
      {faltam.length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Falta no cadastro: {faltam.join(", ")}.{" "}
            <Link href={editar} className="font-medium underline">
              Preencher
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}
