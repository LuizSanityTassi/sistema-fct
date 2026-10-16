"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EstadoDecisao } from "../actions";

/** Exclui a quebra lançada à mão por engano (pede confirmação). O desconto sai da folha. */
export function ExcluirQuebraManual({ action }: { action: () => Promise<EstadoDecisao> }) {
  const router = useRouter();
  const [pendente, iniciar] = React.useTransition();
  const [erro, setErro] = React.useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-red-700"
        onClick={() => {
          if (!window.confirm("Excluir esta quebra lançada à mão? O desconto sai da folha.")) return;
          iniciar(async () => {
            const r = await action();
            if (r.erro) setErro(r.erro);
            else router.push("/financeiro/diferenca-caixa?situacao=quebras");
          });
        }}
      >
        <Trash2 data-icon="inline-start" />
        {pendente ? "Excluindo…" : "Excluir (lançada por engano)"}
      </Button>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}
