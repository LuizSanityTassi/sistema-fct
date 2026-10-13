import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { obterRegistroFolha } from "@/lib/data/folha";
import { formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { enviarHolerite, salvarRegistroFolha } from "../actions";
import { BadgeFolha } from "../badge-folha";
import { HoleriteForm } from "../holerite-form";
import { RegistroFolhaForm } from "../registro-folha-form";

export async function generateMetadata({ params }: PageProps<"/rh/folha/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await obterRegistroFolha(id);
  return { title: r ? `Folha ${r.competencia} · ${r.employees.nome}` : "Folha" };
}

export default async function RegistroFolhaPage({ params }: PageProps<"/rh/folha/[id]">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/rh/folha"), params]);
  if (sessao.papel !== "admin" && sessao.papel !== "rh") redirect("/rh/folha");
  const r = await obterRegistroFolha(id);
  if (!r) notFound();
  const voltar = `/rh/folha?competencia=${r.competencia}`;
  const unidade = r.employees.branches;

  const resumo: Array<[string, number]> = [
    ["Salário base", Number(r.salario_base)],
    ["Horas extras", Number(r.horas_extras)],
    ["Adicionais", Number(r.adicionais)],
    ["INSS", -Number(r.inss)],
    ["IRRF", -Number(r.irrf)],
    ["Outros descontos", -Number(r.outros_descontos)],
    ["Líquido", Number(r.valor_liquido)],
  ];

  return (
    <>
      <PageHeader
        eyebrow={[rotuloCompetencia(r.competencia), unidade ? `${unidade.codigo} · ${unidade.nome}` : null].filter(Boolean).join(" · ")}
        titulo={r.employees.nome}
        descricao={[r.employees.cargo, r.employees.matricula ? `matrícula ${r.employees.matricula}` : null].filter(Boolean).join(" · ") || undefined}
        acoes={
          <>
            <BadgeFolha status={r.status} />
            <Button variant="outline" nativeButton={false} render={<Link href={voltar} />}>
              Voltar à folha
            </Button>
          </>
        }
      />

      {r.status === "rascunho" ? (
        <RegistroFolhaForm
          action={salvarRegistroFolha.bind(null, r.id)}
          salarioBase={Number(r.salario_base)}
          horasMes={r.employees.horas_mes}
          dependentes={r.employees.num_dependentes ?? 0}
          aprendiz={r.employees.tipo_contrato === "aprendiz"}
          valores={{
            qtd_horas_extras_50: Number(r.qtd_horas_extras_50),
            qtd_horas_extras_100: Number(r.qtd_horas_extras_100),
            adicionais: Number(r.adicionais),
            beneficios: Number(r.beneficios),
            outros_descontos: Number(r.outros_descontos),
            observacoes: r.observacoes,
          }}
          voltarPara={voltar}
        />
      ) : (
        <section className="rounded-xl border bg-card p-5 lg:max-w-md">
          <h2 className="mb-1 text-sm font-semibold">Valores da competência</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Competência {r.status === "paga" ? "paga" : "fechada"}
            {r.fechada_em ? ` em ${formatarDataHora(r.fechada_em)}` : ""}
            {r.paga_em ? ` · paga em ${formatarDataHora(r.paga_em)}` : ""}. Só o administrador pode reabrir.
          </p>
          <dl className="space-y-1.5 text-sm">
            {resumo.map(([rotulo, valor]) => (
              <div key={rotulo} className={`flex items-baseline justify-between gap-3 ${rotulo === "Líquido" ? "text-base font-semibold" : ""}`}>
                <dt className="text-muted-foreground">{rotulo}</dt>
                <dd className={`tabular-nums ${valor < 0 ? "text-red-700" : ""}`}>{formatarMoeda(valor)}</dd>
              </div>
            ))}
          </dl>
          {r.observacoes && <p className="mt-3 text-sm whitespace-pre-line">{r.observacoes}</p>}
        </section>
      )}

      <section className="mt-6 rounded-xl border bg-card p-5 lg:max-w-md">
        <h2 className="mb-3 text-sm font-semibold">Holerite</h2>
        {r.storage_path ? (
          <a href={`/api/arquivos/holerite/${r.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-fct-navy underline">
            <Download className="size-3.5" aria-hidden /> Baixar holerite de {rotuloCompetencia(r.competencia)}
          </a>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">Nenhum holerite anexado.</p>
        )}
        <HoleriteForm action={enviarHolerite.bind(null, r.id)} temHolerite={!!r.storage_path} />
      </section>
    </>
  );
}
