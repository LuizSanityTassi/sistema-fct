"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";
import { FileSpreadsheet, FileText, Undo2 } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { caminhoEspelho, TAMANHO_MAXIMO_ESPELHO } from "@/lib/compras/rotulos";
import { createClient } from "@/lib/supabase/client";
import { desfazerImportacao, importarPrePedidos, processarEspelho, type EstadoImportacao } from "../actions";

function Avisos({ avisos }: { avisos?: string[] }) {
  if (!avisos?.length) return null;
  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" open={avisos.length <= 5}>
      <summary className="cursor-pointer font-medium">
        {avisos.length} {avisos.length === 1 ? "aviso" : "avisos"} para conferir
      </summary>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
        {avisos.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </details>
  );
}

/** Pré-pedidos do Trier (Excel Con_0018), um ou vários arquivos, com a data do pedido. */
export function ImportarPrePedidos({ hoje }: { hoje: string }) {
  const [estado, enviar, pendente] = useActionState(importarPrePedidos, {});
  const form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} action={enviar} className="space-y-3 border-t px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Arquivos do pré-pedido (Excel do Trier)</span>
          <Input type="file" name="arquivos" multiple accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" required disabled={pendente} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Data do pedido</span>
          <Input type="date" name="data_pedido" defaultValue={hoje} max={hoje} required disabled={pendente} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        O arquivo “PRÉ-PEDIDO” do Trier (Con_0018), com um bloco por filial. Pode mandar vários de uma vez (EMS, Germed, Geolab…). Pré-pedido que já está no portal não entra de novo.
      </p>
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <Avisos avisos={estado.avisos} />
      <Button type="submit" disabled={pendente}>
        <FileSpreadsheet data-icon="inline-start" />
        {pendente ? "Importando…" : "Importar pré-pedidos"}
      </Button>
    </form>
  );
}

/** Espelho das notas (PDF Rel_0005): sobe direto para o Storage e o servidor lê. */
export function ImportarEspelho() {
  const router = useRouter();
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [etapa, setEtapa] = React.useState<"" | "enviando" | "lendo">("");
  const [estado, setEstado] = React.useState<EstadoImportacao>({});
  const input = React.useRef<HTMLInputElement>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado({});
    if (!arquivo) return setEstado({ erro: "Escolha o PDF do espelho das notas." });
    if (arquivo.type && arquivo.type !== "application/pdf") return setEstado({ erro: "O espelho precisa ser o PDF do Trier." });
    if (arquivo.size > TAMANHO_MAXIMO_ESPELHO) return setEstado({ erro: "Arquivo maior que 50 MB: gere o espelho de menos dias." });
    setEtapa("enviando");
    const caminho = caminhoEspelho(arquivo.name);
    const { error } = await createClient().storage.from("compras").upload(caminho, arquivo, { contentType: "application/pdf", upsert: false });
    if (error) {
      setEtapa("");
      return setEstado({ erro: `Não consegui enviar o arquivo: ${/row-level|not allowed|unauthorized/i.test(error.message) ? "sem permissão (entre de novo)" : error.message}` });
    }
    setEtapa("lendo");
    try {
      const r = await processarEspelho(caminho, arquivo.name);
      setEstado(r);
      if (!r.erro) {
        setArquivo(null);
        if (input.current) input.current.value = "";
        router.refresh();
      }
    } catch {
      setEstado({ erro: "A leitura demorou demais ou a conexão caiu. Envie de novo: as notas que já entraram não duplicam." });
    } finally {
      setEtapa("");
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-3 border-t px-5 py-4">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Espelho das notas de entrada (PDF do Trier)</span>
        <Input ref={input} type="file" accept=".pdf,application/pdf" required disabled={!!etapa} onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </label>
      <p className="text-xs text-muted-foreground">
        Relatório “Espelho Nota Fiscal Entrada” (Rel_0005), todas as filiais e todos os fornecedores, do período que quiser. Nota que já está no portal é atualizada (nada duplica). Transferências entre lojas entram, mas ficam fora do
        cruzamento.
      </p>
      {etapa && (
        <p className="text-sm text-muted-foreground" role="status">
          {etapa === "enviando" ? "Enviando o arquivo…" : "Lendo as notas… (um espelho de 3 dias leva perto de 1 minuto)"}
        </p>
      )}
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <Avisos avisos={estado.avisos} />
      <Button type="submit" disabled={!!etapa}>
        <FileText data-icon="inline-start" />
        {etapa ? "Importando…" : "Importar espelho das notas"}
      </Button>
    </form>
  );
}

export function DesfazerImportacao({ id }: { id: string }) {
  const router = useRouter();
  const [pendente, setPendente] = React.useState(false);
  const [msg, setMsg] = React.useState<EstadoImportacao>({});
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pendente}
        onClick={async () => {
          if (!window.confirm("Desfazer esta importação? Os pré-pedidos dela serão apagados do portal.")) return;
          setPendente(true);
          const r = await desfazerImportacao(id);
          setPendente(false);
          setMsg(r);
          if (!r.erro) router.refresh();
        }}
      >
        <Undo2 data-icon="inline-start" />
        {pendente ? "Desfazendo…" : "Desfazer"}
      </Button>
      {msg.erro && <span className="text-xs text-destructive">{msg.erro}</span>}
    </span>
  );
}
