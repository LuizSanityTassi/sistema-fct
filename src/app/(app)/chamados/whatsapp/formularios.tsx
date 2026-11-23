"use client";

import { useActionState, useState } from "react";
import { Check, CircleCheck, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoWpp } from "./actions";

type Acao = (prev: EstadoWpp, fd: FormData) => Promise<EstadoWpp>;

function Aviso({ estado }: { estado: EstadoWpp }) {
  if (!estado.erro && !estado.ok) return null;
  return (
    <p role={estado.erro ? "alert" : "status"} className={`flex items-start gap-2 text-sm ${estado.erro ? "text-red-700" : "text-emerald-700"}`}>
      {estado.erro ? <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {estado.erro ?? estado.ok}
    </p>
  );
}

/** Gera a chave do agente (aparece uma vez, com botão de copiar). */
export function FormChaveAgente({ acao, temChave }: { acao: Acao; temChave: boolean }) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-3">
      <form action={enviar}>
        <Button type="submit" variant={temChave ? "outline" : "default"} disabled={pendente} onClick={() => setCopiado(false)}>
          <KeyRound aria-hidden />
          {pendente ? "Gerando…" : temChave ? "Trocar a chave do agente" : "Gerar a chave do agente"}
        </Button>
      </form>
      <Aviso estado={estado} />
      {estado.chave && (
        <div className="flex gap-2">
          <Input readOnly value={estado.chave} aria-label="Chave do agente" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(estado.chave ?? "");
                setCopiado(true);
              } catch {
                setCopiado(false);
              }
            }}
          >
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
      )}
    </div>
  );
}

type Linha = { categoria: string; setor: string; grupo: string | null; ativo: boolean };

/** Setor → grupo do WhatsApp (com liga/desliga). */
export function FormDestinos({ acao, linhas, grupos }: { acao: Acao; linhas: Linha[]; grupos: { jid: string; nome: string }[] }) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  return (
    <form action={enviar} className="space-y-3">
      <div className="divide-y rounded-lg border">
        {linhas.map((l) => (
          <div key={l.categoria} className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
            <span className="text-sm font-medium">{l.setor}</span>
            <SelectNativo name={`grupo_${l.categoria}`} defaultValue={l.grupo ?? ""} aria-label={`Grupo de ${l.setor}`}>
              <option value="">Não mandar para o WhatsApp</option>
              {grupos.map((g) => (
                <option key={g.jid} value={g.jid}>
                  {g.nome}
                </option>
              ))}
            </SelectNativo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`ativo_${l.categoria}`} defaultChecked={l.ativo} className="size-4 accent-primary" />
              Ligado
            </label>
          </div>
        ))}
      </div>
      <Aviso estado={estado} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pendente || !grupos.length}>
          {pendente ? "Salvando…" : "Salvar grupos"}
        </Button>
      </div>
    </form>
  );
}
