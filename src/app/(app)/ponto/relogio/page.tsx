import { Clock } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { lerUuid } from "@/lib/data/ponto";
import { identificarNoRelogio, registrarNoRelogio } from "../registrar/actions";
import { Quiosque } from "./quiosque";

export const metadata = { title: "Relógio da filial" };

export default async function RelogioPage({ searchParams }: PageProps<"/ponto/relogio">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/relogio"), searchParams]);
  const unidades = (await listarUnidadesParaSelecao()).filter((u) => u.ativo);
  // gerente: só a filial dele; os demais escolhem
  const opcoes = sessao.papel === "gerente" && sessao.branchId ? unidades.filter((u) => u.id === sessao.branchId) : unidades;
  const escolhida = lerUuid(sp.filial) ?? sessao.branchId ?? undefined;
  const filial = opcoes.find((u) => u.id === escolhida) ?? (opcoes.length === 1 ? opcoes[0] : undefined);

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Relógio da filial"
        descricao="Deixe esta tela aberta no computador ou tablet da loja (dá para usar em tela cheia). Cada funcionário registra com a matrícula e o PIN."
        acoes={
          opcoes.length > 1 && (
            <form method="get" className="flex gap-2">
              <SelectNativo name="filial" defaultValue={filial?.id ?? ""} aria-label="Filial do relógio" className="w-64">
                <option value="" disabled>
                  Escolha a filial…
                </option>
                {opcoes.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} — {u.nome}
                  </option>
                ))}
              </SelectNativo>
              <Button type="submit" variant="outline">
                Abrir
              </Button>
            </form>
          )
        }
      />
      {filial ? (
        <Quiosque key={filial.id} filial={filial} identificar={identificarNoRelogio} registrar={registrarNoRelogio} />
      ) : (
        <Painel>
          <EstadoVazio icone={Clock} titulo="Escolha a filial do relógio" descricao="O relógio só registra o ponto de funcionários da filial escolhida." />
        </Painel>
      )}
    </>
  );
}
