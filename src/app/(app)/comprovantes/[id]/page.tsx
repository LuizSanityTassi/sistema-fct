import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, FileText, ImageIcon, TriangleAlert } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { BUCKET_ANEXOS_CAIXA, tamanhoLegivel } from "@/lib/caixa/anexos";
import { SITUACOES_COMPROVANTE, TIPOS_VENDA, TOM_COMPROVANTE, type SituacaoComprovante, type TipoVenda } from "@/lib/comprovantes/rotulos";
import { obterComprovante } from "@/lib/data/comprovantes";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { formatarCnpj } from "@/lib/validacao/cnpj";
import { cancelarComprovante } from "../actions";
import { AnexarArquivos, CancelarComprovante } from "./acoes";

export const metadata = { title: "Comprovante de venda" };

type FilialDoComprovante = { codigo: string; nome: string; cnpj: string | null; rede: { nome_fantasia: string | null } | null } | null;

export default async function ComprovantePage({ params, searchParams }: PageProps<"/comprovantes/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/comprovantes"), params, searchParams]);
  const c = await obterComprovante(id);
  if (!c) notFound();
  const filial = c.filial as FilialDoComprovante;
  const situacao = c.situacao as SituacaoComprovante;
  const ativo = situacao === "ativo";
  const financeiro = sessao.papel === "admin" || sessao.papel === "financeiro";
  const minha = c.criada_por === sessao.id;
  const podeCancelar = ativo && (minha || financeiro);
  const supabase = await createClient();
  // anexar: enquanto ativo, quem cadastrou ou quem pode cadastrar nesta loja (a mesma regra do banco)
  let podeAnexar = ativo && minha;
  if (ativo && !minha) {
    const { data: lojas } = await supabase.rpc("lojas_para_comprovante");
    podeAnexar = (lojas ?? []).some((l) => l.id === c.branch_id);
  }

  // foto na própria tela (link assinado de 10 min), para conferir sem baixar
  const previas = new Map<string, string>();
  await Promise.all(
    c.anexos
      .filter((a) => a.mime?.startsWith("image/"))
      .map(async (a) => {
        const { data } = await supabase.storage.from(BUCKET_ANEXOS_CAIXA).createSignedUrl(a.storage_path, 600);
        if (data?.signedUrl) previas.set(a.id, data.signedUrl);
      }),
  );

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
        eyebrow="Operação · Comprovantes de venda"
        titulo={`${TIPOS_VENDA[c.tipo as TipoVenda] ?? "Venda"} · ${c.cliente}`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/comprovantes" />}>
            <ChevronLeft data-icon="inline-start" />
            Comprovantes
          </Button>
        }
      />
      {sp.novo === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Comprovante cadastrado com o anexo." />
        </div>
      )}
      {sp.sem_anexo === "1" && c.anexos.length === 0 && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />O comprovante foi cadastrado, mas o anexo não subiu. Envie de novo logo abaixo.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <Painel id="dados" titulo="Informações da venda" acao={<Status tom={TOM_COMPROVANTE[situacao] ?? "neutro"}>{SITUACOES_COMPROVANTE[situacao] ?? situacao}</Status>}>
          <dl className="grid gap-x-6 gap-y-3 border-t px-5 py-4 text-sm sm:grid-cols-2">
            {campos.map(([r, v]) => (
              <div key={r}>
                <dt className="text-xs text-muted-foreground">{r}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
            {c.observacao && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Observação</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{c.observacao}</dd>
              </div>
            )}
          </dl>
          {situacao === "cancelado" && (
            <p className="border-t px-5 py-3 text-sm text-red-800">
              Cancelado por {c.cancelada_por_nome ?? "—"} em {formatarDataHora(c.cancelada_em)}
              {c.motivo_cancelamento ? ` · “${c.motivo_cancelamento}”` : ""}
            </p>
          )}
          {podeCancelar && (
            <div className="border-t px-5 py-4">
              <p className="mb-2 text-xs text-muted-foreground">O cadastro não se edita: se algo saiu errado, cancele e cadastre de novo.</p>
              <CancelarComprovante action={cancelarComprovante.bind(null, c.id)} />
            </div>
          )}
        </Painel>

        <Painel id="anexos" titulo="Comprovante assinado" descricao={c.anexos.length ? `${c.anexos.length} ${c.anexos.length === 1 ? "arquivo" : "arquivos"}` : "Nenhum arquivo ainda"}>
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
                        <img src={previa} alt={`Comprovante: ${a.nome}`} className="mx-auto max-h-[28rem] w-auto rounded-md object-contain shadow-sm" />
                      </a>
                    )}
                    <a href={`/api/arquivos/comprovante/${a.id}`} target="_blank" rel="noopener" className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/50">
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
          )}
          {podeAnexar && (
            <div className="border-t px-5 py-4">
              <AnexarArquivos id={c.id} />
            </div>
          )}
        </Painel>
      </div>
    </>
  );
}
