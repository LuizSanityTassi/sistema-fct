"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { EstadoVazio } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";

/** Quando o painel não carrega: diz o que houve e deixa tentar de novo sem sair da tela. */
export default function ErroPainel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);
  return (
    <div role="alert" className="rounded-xl border bg-card">
      <EstadoVazio icone={TriangleAlert} titulo="Não consegui carregar o painel" descricao="Pode ser uma falha momentânea na conexão com o banco. Seus dados não foram alterados." acao={<Button onClick={() => retry()}>Tentar de novo</Button>} />
    </div>
  );
}
