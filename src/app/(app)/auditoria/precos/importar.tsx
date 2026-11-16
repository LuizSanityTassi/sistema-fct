"use client";

import * as React from "react";
import { useActionState } from "react";
import { Search, Upload } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarMoeda } from "@/lib/formatos";
import { buscarPreco, importarPrecos } from "../actions";

/** Envia a planilha de produtos do Trier (código reduzido, descrição, preço de venda). */
export function ImportarPrecos() {
  const [estado, enviar, pendente] = useActionState(importarPrecos, {});
  return (
    <form action={enviar} className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Atualizar a base com a planilha do Trier</h2>
      <p className="text-xs text-muted-foreground">
        Exporte do Trier a lista de produtos com <strong>código reduzido</strong>, <strong>descrição</strong> e <strong>preço de venda</strong> (o código de barras é opcional) em Excel ou CSV. O
        sistema acha as colunas sozinho, atualiza os produtos que já existem e inclui os novos. Nada é apagado.
      </p>
      <ErroFormulario mensagem={estado.erro} />
      {estado.ok && <AvisoSucesso mensagem={estado.ok} />}
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" name="arquivo" accept=".xlsx,.xls,.csv,.txt" required className="max-w-sm" />
        <Button type="submit" disabled={pendente}>
          <Upload data-icon="inline-start" />
          {pendente ? "Importando…" : "Importar"}
        </Button>
      </div>
    </form>
  );
}

/** Confere um código na base (o mesmo que o auditor digita). */
export function ConsultarPreco() {
  const [codigo, setCodigo] = React.useState("");
  const [resultado, setResultado] = React.useState<string | null>(null);
  const [pendente, start] = React.useTransition();
  const consultar = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const p = await buscarPreco(codigo);
      setResultado(p ? `${p.codigo} — ${p.descricao}: ${formatarMoeda(p.preco)}` : "Código não encontrado na base.");
    });
  };
  return (
    <form onSubmit={consultar} className="space-y-2 rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Consultar um código</h2>
      <div className="flex gap-2">
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código reduzido ou de barras" maxLength={30} className="max-w-60" aria-label="Código" />
        <Button type="submit" variant="outline" disabled={pendente || !codigo.trim()}>
          <Search data-icon="inline-start" />
          Consultar
        </Button>
      </div>
      {resultado && <p className="text-sm">{resultado}</p>}
    </form>
  );
}
