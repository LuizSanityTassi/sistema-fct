// Partes do detalhe da sangria usadas nas duas telas: a da loja (Operação → Sangrias) e a da conferência
// (Financeiro → Conferência de sangrias).
import { Download, FileText, ImageIcon } from "lucide-react";
import { tamanhoLegivel } from "@/lib/caixa/anexos";
import type { obterSangria } from "@/lib/data/sangrias";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";

export type SangriaDetalhe = NonNullable<Awaited<ReturnType<typeof obterSangria>>>;

/** Campos cadastrados + linha de conferida/cancelada. */
export function DadosSangria({ s }: { s: SangriaDetalhe }) {
  const filial = s.filial as { codigo: string; nome: string } | null;
  const campos: [string, React.ReactNode][] = [
    ["Filial", `${filial?.codigo ?? "—"} · ${filial?.nome ?? ""}`],
    ["Banco", s.conta_apelido],
    ["Valor", <span key="v" className="numero-sm">{formatarMoeda(Number(s.valor))}</span>],
    ["Nº do depósito (CTR)", s.numero_deposito ? <span key="n" className="font-mono">{s.numero_deposito}</span> : "—"],
    ["Data da retirada", formatarData(s.data_retirada)],
    ["Data do depósito", formatarData(s.data_deposito)],
    ["Cadastrada por", `${s.criada_por_nome ?? "—"} · ${formatarDataHora(s.criada_em)}`],
  ];
  return (
    <>
      <dl className="grid gap-x-6 gap-y-3 border-t px-5 py-4 text-sm sm:grid-cols-2">
        {campos.map(([r, v]) => (
          <div key={r}>
            <dt className="text-xs text-muted-foreground">{r}</dt>
            <dd className="mt-0.5 font-medium">{v}</dd>
          </div>
        ))}
        {s.observacao && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Observação</dt>
            <dd className="mt-0.5 whitespace-pre-wrap">{s.observacao}</dd>
          </div>
        )}
      </dl>
      {s.situacao === "conferida" && (
        <p className="border-t px-5 py-3 text-sm text-emerald-800">
          Conferida por {s.conferida_por_nome ?? "—"} em {formatarDataHora(s.conferida_em)}
          {s.conferencia_obs ? ` · “${s.conferencia_obs}”` : ""}
        </p>
      )}
      {s.situacao === "cancelada" && (
        <p className="border-t px-5 py-3 text-sm text-red-800">
          Cancelada por {s.cancelada_por_nome ?? "—"} em {formatarDataHora(s.cancelada_em)}
          {s.motivo_cancelamento ? ` · “${s.motivo_cancelamento}”` : ""}
        </p>
      )}
    </>
  );
}

/** Lista dos comprovantes (baixar). Com `previas`, mostra a foto na própria tela (para conferir sem baixar). */
export function ListaComprovantes({ s, previas }: { s: SangriaDetalhe; previas?: Map<string, string> }) {
  if (!s.anexos.length) return null;
  return (
    <ul className="divide-y border-t">
      {s.anexos.map((a) => {
        const Icone = a.mime?.startsWith("image/") ? ImageIcon : FileText;
        const previa = previas?.get(a.id);
        return (
          <li key={a.id}>
            {previa && (
              <a href={`/api/arquivos/sangria/${a.id}`} target="_blank" rel="noopener" className="block bg-muted/40 p-3" aria-label={`Abrir ${a.nome}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- link assinado do Storage, de curta duração */}
                <img src={previa} alt={`Comprovante: ${a.nome}`} className="mx-auto max-h-[28rem] w-auto rounded-md object-contain shadow-sm" />
              </a>
            )}
            <a href={`/api/arquivos/sangria/${a.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/50">
              <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {tamanhoLegivel(a.tamanho)} · {a.enviado_por_nome ?? "—"}
                </span>
              </span>
              <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
