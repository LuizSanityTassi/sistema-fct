"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { numeroParaConta } from "@/lib/financeiro/conta";
import type { RespostaCelula } from "./actions";

type Props = {
  action: (fd: FormData) => Promise<RespostaCelula>;
  campos: Record<string, string>;
  valorAtual?: number | null; // valor manual gravado (null = automático) — telas sem conta (caixa, orçamento)
  /** caixa contábil: valor que aparece na célula; ao clicar vem escrito para continuar a conta (ex.: +200) */
  base?: number | null;
  conta?: string | null; // memória de cálculo gravada (ex.: 348300+200-100)
  exibicao: string; // texto mostrado quando não está editando
  automatico?: string; // dica do valor automático
  ajustado?: boolean;
  classe?: string;
  podeEditar: boolean;
};

/**
 * Célula editável: clique para digitar; Enter/sair salva; vazio volta ao automático. No caixa contábil (com `base`), ao
 * clicar a célula mostra o valor (ou a conta) que já tem: dá para continuar a conta como numa planilha — "+200",
 * "-100" — e a conta fica guardada como memória de cálculo.
 */
export function CelulaEditavel({ action, campos, valorAtual, base, conta, exibicao, automatico, ajustado, classe, podeEditar }: Props) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const comConta = base !== undefined;
  const inicial = conta ?? (valorAtual != null ? numeroParaConta(valorAtual) : comConta && base ? numeroParaConta(base) : "");

  const abrir = () => {
    if (!podeEditar) return;
    setTexto(inicial);
    setErro(null);
    setEditando(true);
  };
  const salvar = async () => {
    if (!editando) return;
    setEditando(false);
    let t = texto.trim();
    if (t === inicial.trim()) return;
    // apagou o número e começou com + × ÷: continua a conta a partir do valor que estava na célula
    if (comConta && /^[+*/×÷]/.test(t) && base != null) t = `${numeroParaConta(base)}${t}`;
    setSalvando(true);
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    fd.set("valor", t);
    const r = await action(fd);
    setSalvando(false);
    if (r.erro) setErro(r.erro);
    else router.refresh();
  };

  if (editando) {
    return (
      <td className={`p-1 text-right ${classe ?? ""}`}>
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setEditando(false);
          }}
          placeholder={automatico ?? "—"}
          title={comConta ? "Digite o valor ou continue a conta: +200, -100, *2… Apague tudo para voltar ao automático." : undefined}
          className={`${comConta ? "w-40" : "w-28"} rounded border border-input bg-background px-1.5 py-0.5 text-right text-xs text-foreground`}
          inputMode={comConta ? "text" : "decimal"}
        />
      </td>
    );
  }
  const dica = conta ? `Memória de cálculo: ${conta}` : null;
  return (
    <td
      onClick={abrir}
      title={
        erro ??
        (podeEditar
          ? ajustado
            ? `${dica ? `${dica}\n` : ""}Ajuste manual — clique para editar; apague para voltar ao automático (${automatico ?? "—"})`
            : comConta
              ? "Clique para ajustar: digite o valor ou continue a conta (ex.: +200 ou -100)"
              : "Clique para ajustar manualmente"
          : (dica ?? undefined))
      }
      className={`px-2 py-1 text-right tabular-nums ${podeEditar ? "cursor-pointer hover:bg-muted/60" : ""} ${ajustado ? "bg-fct-yellow/25 font-semibold shadow-[inset_2px_0_0_var(--color-fct-yellow)]" : ""} ${erro ? "text-red-700" : ""} ${salvando ? "opacity-50" : ""} ${classe ?? ""}`}
    >
      {conta && (
        <span className="mr-1 align-super text-[9px] font-normal opacity-60" aria-label="tem memória de cálculo">
          ƒ
        </span>
      )}
      {exibicao}
    </td>
  );
}
