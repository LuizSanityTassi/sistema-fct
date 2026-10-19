import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { lerFiltrosSangrias, listarSangrias, opcoesDeCadastro, TAMANHO_PAGINA_SANGRIAS } from "@/lib/data/sangrias";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { ehSituacaoSangria, SITUACOES_SANGRIA, TOM_SANGRIA, type SituacaoSangria } from "@/lib/sangrias/rotulos";
import { createClient } from "@/lib/supabase/server";
import { conferirSangrias } from "../../sangrias/actions";
import { ConferenciaLista } from "./conferencia-lista";

export const metadata = { title: "Conferência de sangrias" };

const diasAtras = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - n * 86_400_000));

/** Conferência das sangrias (financeiro): separada do lançamento, que a loja faz em Operação → Sangrias. */
export default async function ConferenciaSangriasPage({ searchParams }: PageProps<"/financeiro/sangrias">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/sangrias"), searchParams]);
  const podeConferir = sessao.papel === "admin" || sessao.papel === "financeiro";
  // padrão da conferência: as que estão A CONFERIR, dos últimos 90 dias
  const filtros = lerFiltrosSangrias({ ...sp, de: typeof sp.de === "string" ? sp.de : diasAtras(90) });
  const situacaoParam = typeof sp.situacao === "string" ? sp.situacao : "pendente";
  filtros.situacao = ehSituacaoSangria(situacaoParam) ? situacaoParam : undefined;

  const supabase = await createClient();
  const [{ itens, total, somas, qtdAnexos }, { contas }, { data: lojas }] = await Promise.all([
    listarSangrias(filtros),
    opcoesDeCadastro(),
    supabase.from("branches").select("id, codigo, nome").eq("ativo", true).order("codigo"),
  ]);
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_SANGRIAS));
  const params = { filial: filtros.filial, conta: filtros.conta, de: filtros.de, ate: filtros.ate, situacao: filtros.situacao ?? "todas" };
  const linkSituacao = (s: string) => `/financeiro/sangrias?${new URLSearchParams(Object.entries({ ...params, situacao: s }).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const linhas = itens.map((s) => {
    const f = s.filial as { codigo: string; nome: string } | null;
    return {
      id: s.id,
      loja: f?.codigo ?? "—",
      lojaNome: f?.nome ?? "",
      deposito: formatarData(s.data_deposito),
      retirada: formatarData(s.data_retirada),
      banco: s.conta_apelido,
      numero: s.numero_deposito,
      valor: formatarMoeda(Number(s.valor)),
      anexos: qtdAnexos.get(s.id) ?? 0,
      situacao: s.situacao,
      cadastro: s.criada_por_nome ?? "—",
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Conferência de sangrias"
        descricao="Confira cada depósito com o extrato do banco: valor, data, nº do depósito e o comprovante enviado pela loja. O lançamento fica com a loja em Operação → Sangrias."
      />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_auto_auto_1fr_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Filial</span>
          <SelectNativo name="filial" defaultValue={filtros.filial ?? ""}>
            <option value="">Todas</option>
            {(lojas ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo} — {l.nome}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Banco</span>
          <SelectNativo name="conta" defaultValue={filtros.conta ?? ""}>
            <option value="">Todos</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Depósito de</span>
          <Input type="date" name="de" defaultValue={filtros.de} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">até</span>
          <Input type="date" name="ate" defaultValue={filtros.ate} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Situação</span>
          <SelectNativo name="situacao" defaultValue={filtros.situacao ?? "todas"}>
            <option value="todas">Todas</option>
            {Object.entries(SITUACOES_SANGRIA).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </SelectNativo>
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="outline" className="w-full">
            Pesquisar
          </Button>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-3 gap-4">
        {(["pendente", "conferida", "cancelada"] as SituacaoSangria[]).map((s) => (
          <Link key={s} href={linkSituacao(s)} className={`rounded-xl border bg-card p-4 ${filtros.situacao === s ? "ring-2 ring-primary/20" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="rotulo">{SITUACOES_SANGRIA[s]}</p>
              <Status tom={TOM_SANGRIA[s]}>{somas[s].qtd}</Status>
            </div>
            <p className="mt-1.5 numero-sm">{formatarMoeda(somas[s].valor)}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border bg-card">
        {linhas.length === 0 ? (
          <EstadoVazio
            icone={ClipboardCheck}
            titulo={filtros.situacao === "pendente" ? "Nada a conferir" : "Nenhuma sangria com esses filtros"}
            descricao={filtros.situacao === "pendente" ? "Todas as sangrias do período já foram conferidas." : "Mude o período, a filial ou a situação."}
          />
        ) : (
          <>
            <ConferenciaLista linhas={linhas} action={conferirSangrias} podeConferir={podeConferir} />
            {paginas > 1 && (
              <div className="border-t px-5 py-3">
                <Paginacao pagina={filtros.pagina} paginas={paginas} total={total} tamanho={TAMANHO_PAGINA_SANGRIAS} params={params} />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
