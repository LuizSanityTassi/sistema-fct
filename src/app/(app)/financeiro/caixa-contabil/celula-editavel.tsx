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
  /** no total: ajuste feito numa filial/grupo de baixo que já está somado aqui (ex.: "F001: 71.358,56 → 76.014,91") */
  deBaixo?: string;
  exibicao: string; // texto mostrado quando não está editando
  automatico?: string; // dica do valor automático
  ajustado?: boolean;
  /** pinta de amarelo a célula ajustada (no caixa contábil só o administrador vê; pedido do usuário) */
  destacar?: boolean;
  classe?: string;
  podeEditar: boolean;
  /** dica ao passar o mouse (no lugar da padrão) e texto do campo vazio — ex.: célula que edita um ajuste somado */
  dicaEditar?: string;
  placeholder?: string;
};

/**
 * Célula editável: clique para digitar; Enter/sair salva; vazio volta ao automático. No caixa contábil (com `base`), ao
 * clicar a célula mostra o valor (ou a conta) que já tem: dá para continuar a conta como numa planilha — "+200",
 * "-100" — e a conta fica guardada como memória de cálculo.
 */
export function CelulaEditavel({ action, campos, valorAtual, base, conta, deBaixo, exibicao, automatico, ajustado: ajustadoGravado, destacar = true, classe, podeEditar, dicaEditar, placeholder }: Props) {
  const router = useRouter();
  const ajustado = ajustadoGravado && destacar;
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
          placeholder={placeholder ?? automatico ?? "—"}
          title={comConta ? "Digite o valor ou continue a conta: +200, -100, *2… Apague tudo para voltar ao automático." : undefined}
          className={`${comConta ? "w-40" : "w-28"} rounded border border-input bg-background px-1.5 py-0.5 text-right text-xs text-foreground`}
          inputMode={comConta ? "text" : "decimal"}
        />
      </td>
    );
  }
  const dica = [conta ? `Memória de cálculo: ${conta}` : null, deBaixo ? `Inclui ajuste feito em ${deBaixo} — para desfazer, apague lá (nesta tela não sai).` : null].filter(Boolean).join("\n") || null;
  return (
    <td
      onClick={abrir}
      title={
        erro ??
        (podeEditar && dicaEditar
          ? `${dica ? `${dica}
` : ""}${dicaEditar}`
          : podeEditar
          ? ajustado
            ? `${dica ? `${dica}\n` : ""}Ajuste manual — clique para editar; apague para voltar ao automático (${automatico ?? "—"})`
            : `${dica ? `${dica}\n` : ""}${comConta ? "Clique para ajustar: digite o valor ou continue a conta (ex.: +200 ou -100)" : "Clique para ajustar manualmente"}`
          : (dica ?? undefined))
      }
      className={`px-2 py-1 text-right tabular-nums ${podeEditar ? "cursor-pointer hover:bg-muted/60" : ""} ${ajustado ? "bg-fct-yellow/25 font-semibold shadow-[inset_2px_0_0_var(--color-fct-yellow)]" : ""} ${erro ? "text-red-700" : ""} ${salvando ? "opacity-50" : ""} ${classe ?? ""}`}
    >
      {deBaixo && <span className="mr-1 inline-block size-1.5 rounded-full bg-sky-500 align-middle" aria-label="tem ajuste feito numa filial" />}
      {conta && (
        <span className="mr-1 align-super text-[9px] font-normal opacity-60" aria-label="tem memória de cálculo">
          ƒ
        </span>
      )}
      {exibicao}
    </td>
  );
}
