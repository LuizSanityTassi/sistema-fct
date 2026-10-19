import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, FileText, ImageIcon, TriangleAlert } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { tamanhoLegivel } from "@/lib/caixa/anexos";
import { obterSangria } from "@/lib/data/sangrias";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { SITUACOES_SANGRIA, TOM_SANGRIA, type SituacaoSangria } from "@/lib/sangrias/rotulos";
import { mudarSituacao } from "../actions";
import { AcoesSangria, AnexarComprovante } from "./acoes-sangria";

export const metadata = { title: "Sangria" };

export default async function SangriaPage({ params, searchParams }: PageProps<"/sangrias/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/sangrias"), params, searchParams]);
  const s = await obterSangria(id);
  if (!s) notFound();
  const filial = s.filial as { codigo: string; nome: string } | null;
  const situacao = s.situacao as SituacaoSangria;
  const financeiro = sessao.papel === "admin" || sessao.papel === "financeiro";
  const minha = s.criada_por === sessao.id;
  const podeCancelar = financeiro || (minha && situacao === "pendente");
  const podeAnexar = situacao === "pendente" && (financeiro || minha || sessao.papel === "gerente" || sessao.papel === "usuario");

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
      <PageHeader
        eyebrow="Operação · Sangrias"
        titulo={`Sangria ${filial?.codigo ?? ""} · ${formatarData(s.data_deposito)}`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/sangrias" />}>
            <ChevronLeft data-icon="inline-start" />
            Sangrias
          </Button>
        }
      />
      {sp.nova === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Sangria cadastrada com o comprovante. O financeiro confere com o extrato." />
        </div>
      )}
      {sp.sem_comprovante === "1" && s.anexos.length === 0 && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />A sangria foi cadastrada, mas o comprovante não subiu. Anexe de novo logo abaixo.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Painel id="dados" titulo="Informações da sangria" acao={<Status tom={TOM_SANGRIA[situacao] ?? "neutro"}>{SITUACOES_SANGRIA[situacao] ?? situacao}</Status>}>
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
          {situacao === "conferida" && (
            <p className="border-t px-5 py-3 text-sm text-emerald-800">
              Conferida por {s.conferida_por_nome ?? "—"} em {formatarDataHora(s.conferida_em)}
              {s.conferencia_obs ? ` · “${s.conferencia_obs}”` : ""}
            </p>
          )}
          {situacao === "cancelada" && (
            <p className="border-t px-5 py-3 text-sm text-red-800">
              Cancelada por {s.cancelada_por_nome ?? "—"} em {formatarDataHora(s.cancelada_em)}
              {s.motivo_cancelamento ? ` · “${s.motivo_cancelamento}”` : ""}
            </p>
          )}
          {(financeiro || podeCancelar) && situacao !== "cancelada" && (
            <div className="border-t px-5 py-4">
              <AcoesSangria action={mudarSituacao.bind(null, s.id)} situacao={situacao} podeConferir={financeiro} podeCancelar={podeCancelar} />
            </div>
          )}
        </Painel>

        <Painel id="comprovantes" titulo="Comprovante" descricao={s.anexos.length ? `${s.anexos.length} ${s.anexos.length === 1 ? "arquivo" : "arquivos"}` : "Nenhum arquivo ainda"}>
          {s.anexos.length > 0 && (
            <ul className="divide-y border-t">
              {s.anexos.map((a) => {
                const Icone = a.mime?.startsWith("image/") ? ImageIcon : FileText;
                return (
                  <li key={a.id}>
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
          )}
          {podeAnexar && (
            <div className="border-t px-5 py-4">
              <AnexarComprovante id={s.id} />
            </div>
          )}
        </Painel>
      </div>
    </>
  );
}
