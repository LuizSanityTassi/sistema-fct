import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ClipboardCheck, TriangleAlert } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { obterSangria } from "@/lib/data/sangrias";
import { formatarData } from "@/lib/formatos";
import { podeAcessar } from "@/lib/nav";
import { SITUACOES_SANGRIA, TOM_SANGRIA, type SituacaoSangria } from "@/lib/sangrias/rotulos";
import { mudarSituacao } from "../actions";
import { DadosSangria, ListaComprovantes } from "../dados-sangria";
import { AcoesSangria, AnexarComprovante } from "./acoes-sangria";

export const metadata = { title: "Sangria" };

/** Detalhe da sangria para quem LANÇA (loja): acompanhar, anexar comprovante e cancelar. A conferência fica no Financeiro. */
export default async function SangriaPage({ params, searchParams }: PageProps<"/sangrias/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/sangrias"), params, searchParams]);
  const s = await obterSangria(id);
  if (!s) notFound();
  const filial = s.filial as { codigo: string; nome: string } | null;
  const situacao = s.situacao as SituacaoSangria;
  const veConferencia = podeAcessar(sessao.papel, "/financeiro/sangrias", sessao.telasExtras, sessao.bloqueios);
  // poderes do financeiro só para quem abre o Financeiro (administrador com o Financeiro bloqueado age como a loja)
  const financeiro = (sessao.papel === "admin" || sessao.papel === "financeiro") && veConferencia;
  const minha = s.criada_por === sessao.id;
  const podeCancelar = situacao === "pendente" && s.omie_codigo == null && (minha || financeiro);
  const podeAnexar = situacao === "pendente" && (financeiro || minha || sessao.papel === "gerente" || sessao.papel === "usuario");

  return (
    <>
      <PageHeader
        eyebrow="Operação · Sangrias"
        titulo={`Sangria ${filial?.codigo ?? ""} · ${formatarData(s.data_deposito)}`}
        acoes={
          <>
            {veConferencia && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/financeiro/sangrias/${s.id}`} />}>
                <ClipboardCheck data-icon="inline-start" />
                Abrir na conferência
              </Button>
            )}
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/sangrias" />}>
              <ChevronLeft data-icon="inline-start" />
              Sangrias
            </Button>
          </>
        }
      />
      {sp.nova === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Sangria cadastrada com o comprovante. Agora o financeiro confere com o extrato." />
        </div>
      )}
      {sp.sem_comprovante === "1" && s.anexos.length === 0 && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />A sangria foi cadastrada, mas o comprovante não subiu. Anexe de novo logo abaixo.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Painel id="dados" titulo="Informações da sangria" acao={<Status tom={TOM_SANGRIA[situacao] ?? "neutro"}>{SITUACOES_SANGRIA[situacao] ?? situacao}</Status>}>
          <DadosSangria s={s} />
          {situacao === "pendente" && <p className="border-t px-5 py-3 text-sm text-muted-foreground">Aguardando a conferência do financeiro.</p>}
          {podeCancelar && (
            <div className="border-t px-5 py-4">
              <AcoesSangria action={mudarSituacao.bind(null, s.id)} situacao={situacao} podeConferir={false} podeCancelar />
            </div>
          )}
        </Painel>

        <Painel id="comprovantes" titulo="Comprovante" descricao={s.anexos.length ? `${s.anexos.length} ${s.anexos.length === 1 ? "arquivo" : "arquivos"}` : "Nenhum arquivo ainda"}>
          <ListaComprovantes s={s} />
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
