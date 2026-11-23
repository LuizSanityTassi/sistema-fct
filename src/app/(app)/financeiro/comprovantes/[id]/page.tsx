import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, FileText, ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { BUCKET_ANEXOS_CAIXA, tamanhoLegivel } from "@/lib/caixa/anexos";
import { CONFERENCIAS, TIPOS_VENDA, TOM_CONFERENCIA, type Conferencia, type TipoVenda } from "@/lib/comprovantes/rotulos";
import { obterComprovante, proximoAConferir } from "@/lib/data/comprovantes";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { formatarCnpj } from "@/lib/validacao/cnpj";
import { cancelarComprovante, conferirComprovante } from "../../../comprovantes/actions";
import { CancelarComprovante } from "../../../comprovantes/[id]/acoes";
import { AcoesConferencia } from "./acoes-conferencia";

export const metadata = { title: "Conferir comprovante" };

type FilialDoComprovante = { codigo: string; nome: string; cnpj: string | null; rede: { nome_fantasia: string | null } | null } | null;

/** Conferência de um comprovante: a foto aparece grande, ao lado do que a loja informou. */
export default async function ConferirComprovantePage({ params }: PageProps<"/financeiro/comprovantes/[id]">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/financeiro/comprovantes"), params]);
  const c = await obterComprovante(id);
  if (!c) notFound();
  const financeiro = sessao.papel === "admin" || sessao.papel === "financeiro";
  const filial = c.filial as FilialDoComprovante;
  const conferencia = c.conferencia as Conferencia;
  const ativo = c.situacao === "ativo";

  const supabase = await createClient();
  const previas = new Map<string, string>();
  // foto na própria tela (link assinado de 10 min) e o próximo da fila, ao mesmo tempo
  const [proximo] = await Promise.all([
    financeiro ? proximoAConferir(c.id) : Promise.resolve(null),
    Promise.all(
      c.anexos
        .filter((a) => a.mime?.startsWith("image/"))
        .map(async (a) => {
          const { data } = await supabase.storage.from(BUCKET_ANEXOS_CAIXA).createSignedUrl(a.storage_path, 600);
          if (data?.signedUrl) previas.set(a.id, data.signedUrl);
        }),
    ),
  ]);

  const campos: [string, React.ReactNode][] = [
    ["Filial", `${filial?.codigo ?? "—"} · ${filial?.nome ?? ""}`],
    ["Rede · CNPJ", `${filial?.rede?.nome_fantasia ?? "—"}${filial?.cnpj ? ` · ${formatarCnpj(filial.cnpj)}` : ""}`],
    ["Tipo de venda", TIPOS_VENDA[c.tipo as TipoVenda] ?? c.tipo],
    ["Nome da empresa", c.empresa ?? "—"],
    ["Nome do cliente", c.cliente],
    ["Total da venda", <span key="v" className="numero-sm">{formatarMoeda(Number(c.valor))}</span>],
    ["Nº de parcelas", String(c.parcelas)],
    ["Data da compra", formatarData(c.data_compra)],
    ["Nº da venda / cupom", c.numero_venda ? <span key="n" className="font-mono">{c.numero_venda}</span> : "—"],
    ["Cadastrado por", `${c.criada_por_nome ?? "—"} · ${formatarDataHora(c.criada_em)}`],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Conferência de comprovantes"
        titulo={`Conferir ${filial?.codigo ?? ""} · ${c.cliente}`}
        acoes={
          <>
            {proximo && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/financeiro/comprovantes/${proximo}`} />}>
                Próximo
                <ChevronRight data-icon="inline-end" />
              </Button>
            )}
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/comprovantes" />}>
              <ChevronLeft data-icon="inline-start" />
              Conferência
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <Painel
            id="dados"
            titulo="O que a loja informou"
            acao={ativo ? <Status tom={TOM_CONFERENCIA[conferencia] ?? "neutro"}>{CONFERENCIAS[conferencia] ?? conferencia}</Status> : <Status tom="neutro">Cancelado</Status>}
          >
            <dl className="grid gap-x-6 gap-y-3 border-t px-5 py-4 text-sm sm:grid-cols-2">
              {campos.map(([r, v]) => (
                <div key={r}>
                  <dt className="text-xs text-muted-foreground">{r}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
              {c.observacao && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Observação da loja</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{c.observacao}</dd>
                </div>
              )}
            </dl>
            {conferencia === "conferido" && (
              <p className="border-t px-5 py-3 text-sm text-emerald-800">
                Conferido por {c.conferido_por_nome ?? "—"} em {formatarDataHora(c.conferido_em)}
                {c.conferencia_obs ? ` · “${c.conferencia_obs}”` : ""}
              </p>
            )}
            {conferencia === "divergente" && (
              <p className="border-t px-5 py-3 text-sm text-red-800">
                Problema apontado por {c.conferido_por_nome ?? "—"} em {formatarDataHora(c.conferido_em)}: “{c.conferencia_obs}”. Esperando a loja anexar a correção.
              </p>
            )}
            {conferencia === "pendente" && c.conferencia_obs && (
              <p className="border-t px-5 py-3 text-sm text-amber-900">A loja anexou a correção. Problema apontado antes: “{c.conferencia_obs}”.</p>
            )}
            {!ativo && (
              <p className="border-t px-5 py-3 text-sm text-red-800">
                Cancelado por {c.cancelada_por_nome ?? "—"} em {formatarDataHora(c.cancelada_em)}
                {c.motivo_cancelamento ? ` · “${c.motivo_cancelamento}”` : ""}
              </p>
            )}
            {financeiro && ativo && (
              <div className="border-t px-5 py-4">
                <AcoesConferencia action={conferirComprovante.bind(null, c.id)} conferencia={conferencia} temAnexo={c.anexos.length > 0} proximo={proximo} />
              </div>
            )}
            {financeiro && ativo && conferencia !== "conferido" && (
              <div className="border-t px-5 py-3">
                <CancelarComprovante action={cancelarComprovante.bind(null, c.id)} />
              </div>
            )}
          </Painel>
        </div>

        <Painel id="anexos" titulo="Comprovante assinado" descricao={c.anexos.length ? "Confira cliente, valor, parcelas e a assinatura" : "A loja ainda não anexou o comprovante"}>
          {c.anexos.length > 0 && (
            <ul className="divide-y border-t">
              {c.anexos.map((a) => {
                const Icone = a.mime?.startsWith("image/") ? ImageIcon : FileText;
                const previa = previas.get(a.id);
                return (
                  <li key={a.id}>
                    {previa && (
                      <a href={`/api/arquivos/comprovante/${a.id}`} target="_blank" rel="noopener" className="block bg-muted/40 p-3" aria-label={`Abrir ${a.nome}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- link assinado do Storage, de curta duração */}
                        <img src={previa} alt={`Comprovante: ${a.nome}`} className="mx-auto max-h-[42rem] w-auto rounded-md object-contain shadow-sm" />
                      </a>
                    )}
                    <a href={`/api/arquivos/comprovante/${a.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/50">
                      <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{a.nome}</span>
                        <span className="block text-xs text-muted-foreground">
                          {tamanhoLegivel(a.tamanho)} · {a.enviado_por_nome ?? "—"} · {formatarDataHora(a.criado_em)}
                        </span>
                      </span>
                      <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>
      </div>
    </>
  );
}
