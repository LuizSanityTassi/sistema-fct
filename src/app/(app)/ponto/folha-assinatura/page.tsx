import { Building2, Printer, Users } from "lucide-react";
import { Campo, SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { colaboradoresDaFolha, filiaisDaFolha, lerParamsFolha, MAX_DIAS_FOLHA, ROTA_FOLHA_ASSINATURA, ROTA_IMPRIMIR_FOLHA } from "@/lib/data/ponto-folha";
import { formatarData } from "@/lib/formatos";
import { diasEntre } from "@/lib/ponto/calculo";
import { SelectFilial } from "./select-filial";

export const metadata = { title: "Folha para assinatura" };

export default async function FolhaAssinaturaPage({ searchParams }: PageProps<"/ponto/folha-assinatura">) {
  const [sessao, sp] = await Promise.all([exigirAcesso(ROTA_FOLHA_ASSINATURA), searchParams]);
  const filiais = await filiaisDaFolha(sessao);
  const p = lerParamsFolha(sp, sessao);
  const filial = filiais.find((f) => f.id === p.filial) ?? (filiais.length === 1 ? filiais[0] : undefined);
  const colaboradores = filial ? await colaboradoresDaFolha(filial.id, p.de) : [];
  const escolhido = p.funcionario && colaboradores.some((f) => f.id === p.funcionario) ? p.funcionario : "";
  const dias = diasEntre(p.de, p.ate) + 1;

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Folha para assinatura"
        descricao="Cartão de ponto do período para o colaborador conferir e assinar: uma folha por pessoa, com as marcações dia a dia, extras 50% e 100%, faltas e atrasos, noturno e carga. Abre em nova aba; para PDF, escolha “Salvar como PDF” na impressão."
      />

      {!filiais.length ? (
        <Painel>
          <EstadoVazio icone={Building2} titulo="Nenhuma filial disponível" descricao="Seu usuário não está ligado a uma filial. Peça ao administrador." />
        </Painel>
      ) : (
        <Painel titulo="Filtro" descricao={`Até ${MAX_DIAS_FOLHA} dias por folha. Domingos, feriados, folgas e dias sem marcação aparecem na folha para o colaborador assinar o período inteiro.`}>
          <form method="get" action={ROTA_IMPRIMIR_FOLHA} target="_blank" rel="noopener" className="grid max-w-2xl gap-4 p-4 sm:grid-cols-2">
            <Campo id="filial" label="Filial" className="sm:col-span-2">
              <SelectFilial id="filial" name="filial" rota={ROTA_FOLHA_ASSINATURA} defaultValue={filial?.id ?? ""} disabled={filiais.length === 1}>
                {!filial && (
                  <option value="" disabled>
                    Escolha a filial…
                  </option>
                )}
                {filiais.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} - {u.nome}
                  </option>
                ))}
              </SelectFilial>
            </Campo>
            {filiais.length === 1 && filial && <input type="hidden" name="filial" value={filial.id} />}
            <Campo id="funcionario" label="Colaborador" className="sm:col-span-2" dica={filial ? `${colaboradores.length} colaborador(es) da filial no período (ativos e desligados dentro do período).` : undefined}>
              <SelectNativo id="funcionario" name="funcionario" defaultValue={escolhido} disabled={!filial}>
                <option value="">Todos</option>
                {colaboradores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.matricula ? ` · ${f.matricula}` : ""}
                    {f.status === "desligado" ? ` (desligado em ${formatarData(f.data_desligamento)})` : ""}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo id="de" label="De">
              <Input id="de" type="date" name="de" defaultValue={p.de} required />
            </Campo>
            <Campo id="ate" label="Até" dica={`${dias} dia(s) no período`}>
              <Input id="ate" type="date" name="ate" defaultValue={p.ate} required />
            </Campo>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" size="lg" disabled={!filial}>
                <Printer data-icon="inline-start" /> Imprimir
              </Button>
            </div>
          </form>
        </Painel>
      )}

      {filial && (
        <Painel className="mt-4" titulo={`Quem sai na folha · ${filial.codigo} ${filial.nome}`} descricao={`${formatarData(p.de)} a ${formatarData(p.ate)} · ${escolhido ? "só o colaborador escolhido" : `${colaboradores.length} folha(s), uma por colaborador`}`}>
          {colaboradores.length === 0 ? (
            <EstadoVazio icone={Users} titulo="Nenhum colaborador nesta filial" descricao="Confira o cadastro no RH ou o seu acesso à filial." />
          ) : (
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Colaborador</th>
                    <th className="px-2 py-2 font-medium">Matrícula</th>
                    <th className="px-2 py-2 font-medium">Cargo</th>
                    <th className="px-2 py-2 font-medium">Admissão</th>
                    <th className="px-4 py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradores
                    .filter((f) => !escolhido || f.id === escolhido)
                    .map((f) => (
                      <tr key={f.id} className="border-b last:border-0">
                        <td className="px-4 py-1.5 font-medium">{f.nome}</td>
                        <td className="px-2 py-1.5 tabular-nums">{f.matricula ?? "—"}</td>
                        <td className="px-2 py-1.5">{f.cargo ?? "—"}</td>
                        <td className="px-2 py-1.5 tabular-nums">{formatarData(f.data_admissao)}</td>
                        <td className="px-4 py-1.5 text-xs text-muted-foreground">{f.status === "desligado" ? `Desligado em ${formatarData(f.data_desligamento)}` : "Ativo"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Painel>
      )}
    </>
  );
}
