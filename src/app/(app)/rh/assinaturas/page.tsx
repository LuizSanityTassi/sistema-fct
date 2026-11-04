import Link from "next/link";
import { Download, PenLine } from "lucide-react";
import { EstadoVazio } from "@/components/layout/painel";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { listarAssinaturas } from "@/lib/data/documentos";
import { formatarDataHora } from "@/lib/formatos";
import { CATEGORIA_DOC_LABEL } from "@/lib/rh/rotulos";
import { devolverAssinado } from "../documentos/actions";
import { DevolverForm } from "./devolver-form";

export const metadata = { title: "Assinaturas" };

export default async function AssinaturasPage({ searchParams }: PageProps<"/rh/assinaturas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/rh/assinaturas"), searchParams]);
  const situacao = sp.situacao === "assinado" ? "assinado" : "aguardando";
  const documentos = await listarAssinaturas(situacao);
  const doGerente = sessao.papel === "gerente";

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        titulo="Assinaturas"
        descricao={doGerente ? "Baixe o documento, colha a assinatura do funcionário e devolva o arquivo assinado. Ele vai direto para a ficha." : "Documentos enviados ao gerente da filial para colher a assinatura. Para mandar um novo, use a aba Documentos da ficha do funcionário."}
      />
      <nav aria-label="Situação" className="mb-4 flex gap-2">
        <Button size="sm" variant={situacao === "aguardando" ? "default" : "outline"} nativeButton={false} render={<Link href="/rh/assinaturas" />}>
          Aguardando
        </Button>
        <Button size="sm" variant={situacao === "assinado" ? "default" : "outline"} nativeButton={false} render={<Link href="/rh/assinaturas?situacao=assinado" />}>
          Assinados
        </Button>
      </nav>
      <section className="rounded-xl border bg-card">
        {documentos.length === 0 ? (
          <EstadoVazio icone={PenLine} titulo={situacao === "aguardando" ? "Nenhum documento aguardando assinatura" : "Nenhum documento assinado ainda"} descricao={situacao === "aguardando" ? "Quando o RH mandar um documento, ele aparece aqui." : "Os documentos devolvidos aparecem aqui e na ficha do funcionário."} />
        ) : (
          <ul className="divide-y">
            {documentos.map((d) => (
              <li key={d.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="font-medium">{d.nome}</p>
                  <p className="text-sm">
                    <Link href={`/rh/funcionarios/${d.employees.id}?aba=documentos`} className="hover:underline">
                      {d.employees.nome}
                    </Link>
                    {d.employees.branches ? <span className="text-muted-foreground"> · {d.employees.branches.codigo} {d.employees.branches.nome}</span> : null}
                    {d.employees.status === "desligado" ? <span className="text-muted-foreground"> · desligado</span> : null}
                  </p>
                  {d.descricao && <p className="text-xs text-muted-foreground">{d.descricao}</p>}
                  <p className="text-xs text-muted-foreground">
                    {CATEGORIA_DOC_LABEL[d.categoria]} · {situacao === "assinado" ? `devolvido em ${formatarDataHora(d.assinado_em)}` : `enviado em ${formatarDataHora(d.created_at)}${d.enviado_por?.nome ? ` por ${d.enviado_por.nome}` : ""}`}
                  </p>
                </div>
                <div className="flex flex-col gap-2 lg:items-end">
                  <a href={`/api/arquivos/documento/${d.id}`} className="inline-flex items-center gap-1 text-sm text-fct-tinta underline">
                    <Download className="size-3.5" aria-hidden /> {situacao === "assinado" ? "Baixar assinado" : "Baixar para assinar"}
                  </a>
                  {situacao === "aguardando" && <DevolverForm action={devolverAssinado.bind(null, d.id, d.employees.id)} nome={d.nome} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
