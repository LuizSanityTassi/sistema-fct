import { PageHeader } from "@/components/layout/page-header";
import { dataHoraBrasil } from "@/lib/auditoria/checklist";
import { exigirAcesso } from "@/lib/auth/session";
import { resumoBasePrecos } from "@/lib/data/auditoria-lojas";
import { AbasAuditoria } from "../abas";
import { ConsultarPreco, ImportarPrecos } from "./importar";

// a busca do código consulta o Trier ao vivo (login + tela de produtos)
export const maxDuration = 60;
export const metadata = { title: "Base de preços" };

export default async function BasePrecosPage() {
  const sessao = await exigirAcesso("/auditoria/precos");
  const resumo = await resumoBasePrecos();
  return (
    <>
      <PageHeader
        eyebrow="Auditoria de lojas"
        titulo="Base de preços"
        descricao="De onde vem o “valor no sistema” da auditoria de precificação: o auditor digita o código reduzido e o produto e o preço aparecem sozinhos."
      />
      <AbasAuditoria ativa="/auditoria/precos" papel={sessao.papel} extras={sessao.telasExtras} />
      <section className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="rotulo">Produtos na base</p>
          <p className="text-2xl font-semibold tabular-nums">{resumo.total.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="rotulo">Última atualização</p>
          <p className="text-lg font-semibold">{resumo.atualizadoEm ? dataHoraBrasil(resumo.atualizadoEm) : "Nunca: importe a planilha do Trier"}</p>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <ImportarPrecos />
        <ConsultarPreco />
      </div>
    </>
  );
}
