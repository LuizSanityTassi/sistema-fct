import { FileText, ImageIcon } from "lucide-react";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { tamanhoLegivel } from "@/lib/caixa/anexos";
import type { AnexoCaixa } from "@/lib/data/diferenca-caixa";
import { formatarDataHora } from "@/lib/formatos";
import { removerAnexoCaixa } from "./actions";

/** Anexos da justificativa de uma quebra: baixar (link assinado) e, enquanto está em aberto, remover o próprio. */
export function AnexosQuebra({ anexos, usuarioId, podeRemoverTodos = false, aberta }: { anexos: AnexoCaixa[]; usuarioId: string; podeRemoverTodos?: boolean; aberta: boolean }) {
  if (!anexos.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Anexos ({anexos.length})</p>
      <ul className="space-y-1.5">
        {anexos.map((a) => {
          const Icone = a.mime?.startsWith("image/") ? ImageIcon : FileText;
          const podeRemover = aberta && (podeRemoverTodos || a.enviado_por === usuarioId);
          return (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
              <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {/* nome em cima e detalhes embaixo: no celular o nome não some espremido pelos detalhes */}
              <div className="min-w-0 flex-1">
                <a href={`/api/arquivos/caixa/${a.id}`} className="block truncate font-medium text-fct-tinta underline-offset-2 hover:underline" target="_blank" rel="noopener">
                  {a.nome}
                </a>
                <span className="block text-xs text-muted-foreground">
                  {tamanhoLegivel(a.tamanho)} · {a.enviado_por_nome ?? "—"} · {formatarDataHora(a.criado_em)}
                </span>
              </div>
              {podeRemover && (
                <ConfirmarAcao
                  titulo={`Remover “${a.nome}”?`}
                  descricao="O arquivo sai da justificativa. A auditoria guarda que ele foi removido."
                  rotuloBotao="Remover"
                  variant="destructive"
                  action={removerAnexoCaixa}
                  campos={{ id: a.id }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
