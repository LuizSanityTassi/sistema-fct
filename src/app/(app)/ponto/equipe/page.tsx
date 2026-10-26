import Link from "next/link";
import { Users } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { apurar, listarEquipe, listarJornadas } from "@/lib/data/ponto";
import { hojeLocal } from "@/lib/ponto/calculo";
import { situacaoAgora } from "@/lib/ponto/situacao";
import { createClient } from "@/lib/supabase/server";
import { BarraFiltrosPonto, lerFiltrosPonto } from "../_ui/filtros";
import { PinForm } from "../_ui/pin-form";
import { aplicarJornada, definirPin } from "./actions";
import { ID_FORM_LOTE, LoteJornadaForm, MarcarTodos } from "./lote-form";

export const metadata = { title: "Equipe e jornadas" };

const TAMANHO = 50;

export default async function EquipePage({ searchParams }: PageProps<"/ponto/equipe">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/equipe"), searchParams]);
  const filtros = lerFiltrosPonto(sp, sessao.papel === "gerente" ? sessao.branchId : null);
  const situacao = typeof sp.situacao === "string" ? sp.situacao : "";
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const supabase = await createClient();
  const hoje = hojeLocal();
  const [todos, jornadas] = await Promise.all([listarEquipe({ filial: filtros.filial, departamento: filtros.departamento, q: filtros.q }), listarJornadas()]);
  const podeEditar = sessao.papel !== "coordenador";

  // situação de hoje de todos do filtro (para o filtro por situação e os números do topo)
  const agora = new Date();
  const apHoje = await apurar(todos, hoje, hoje, { agora });
  const linhas = apHoje.map((a) => ({ ...a, agora: situacaoAgora(a.dias[0], agora) }));
  const filtradas = situacao === "sem_jornada" ? linhas.filter((l) => !l.jornadaAtual) : situacao ? linhas.filter((l) => l.agora.codigo === situacao) : linhas;
  const paginas = Math.max(1, Math.ceil(filtradas.length / TAMANHO));
  const pag = filtradas.slice((pagina - 1) * TAMANHO, pagina * TAMANHO);
  const { data: comPin } = await supabase.rpc("ponto_tem_pin", { p_employees: pag.map((l) => l.func.id) });
  const temPin = new Set(comPin ?? []);
  const contar = (c: string) => linhas.filter((l) => l.agora.codigo === c).length;
  const semJornada = linhas.filter((l) => !l.jornadaAtual).length;
  const params = { filial: filtros.filial ?? (sp.filial === "todas" ? "todas" : undefined), departamento: filtros.departamento, q: filtros.q, situacao: situacao || undefined };
  const linkSit = (s: string) => `/ponto/equipe?${new URLSearchParams(Object.entries({ ...params, situacao: s, pagina: undefined }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Equipe e jornadas"
        descricao="Jornada de cada funcionário (o cadastro vem do RH), PIN do relógio e como está o dia agora. Marque vários para trocar a jornada de uma vez."
      />
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Trabalhando", contar("trabalhando"), "trabalhando", "text-emerald-700"],
          ["Em intervalo", contar("intervalo"), "intervalo", "text-sky-700"],
          ["Não marcou", contar("nao_marcou"), "nao_marcou", "text-red-700"],
          ["Ausentes", contar("ausente"), "ausente", "text-violet-700"],
          ["Já saíram", contar("saiu"), "saiu", ""],
          ["Sem jornada", semJornada, "sem_jornada", semJornada ? "text-amber-700" : ""],
        ].map(([r, v, s, c]) => (
          <Link key={s as string} href={linkSit(s as string)} className={`rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 ${situacao === s ? "ring-2 ring-fct-tinta/40" : ""}`}>
            <p className="rotulo">{r}</p>
            <p className={`mt-1 numero ${c}`}>{v}</p>
          </Link>
        ))}
      </section>

      <BarraFiltrosPonto
        rota="/ponto/equipe"
        filtros={filtros}
        extra={
          <SelectNativo name="situacao" defaultValue={situacao} aria-label="Situação agora" className="w-auto">
            <option value="">Qualquer situação</option>
            <option value="trabalhando">Trabalhando</option>
            <option value="intervalo">Em intervalo</option>
            <option value="nao_marcou">Não marcou</option>
            <option value="vai_entrar">Ainda vai entrar</option>
            <option value="saiu">Já saiu</option>
            <option value="ausente">Ausente</option>
            <option value="folga">Folga</option>
            <option value="sem_jornada">Sem jornada</option>
          </SelectNativo>
        }
      />

      <Painel titulo={`${filtradas.length} funcionário(s)`} descricao="Situação calculada agora, pelas marcações de hoje.">
        {filtradas.length === 0 ? (
          <EstadoVazio icone={Users} titulo="Ninguém neste filtro" descricao="Troque a filial ou limpe os filtros. O cadastro dos funcionários é feito no RH." compacto />
        ) : (
          <>
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    {podeEditar && (
                      <TableHead className="w-8">
                        <MarcarTodos />
                      </TableHead>
                    )}
                    <TableHead>Funcionário</TableHead>
                    <TableHead className="hidden md:table-cell">Filial</TableHead>
                    <TableHead>Jornada</TableHead>
                    <TableHead>Agora</TableHead>
                    <TableHead className="hidden lg:table-cell">PIN</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pag.map(({ func: f, jornadaAtual, agora: s }) => (
                    <TableRow key={f.id}>
                      {podeEditar && (
                        <TableCell>
                          <input type="checkbox" name="ids" value={f.id} form={ID_FORM_LOTE} aria-label={`Marcar ${f.nome}`} className="size-4 accent-fct-tinta" />
                        </TableCell>
                      )}
                      <TableCell>
                        <Link href={`/ponto/espelho?funcionario=${f.id}`} className="font-medium hover:underline">
                          {f.nome}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {f.matricula ? `Matr. ${f.matricula}` : "Sem matrícula"}
                          {f.cargo ? ` · ${f.cargo}` : ""}
                          {f.departamento ? ` · ${f.departamento}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="font-mono text-xs text-fct-tinta">{f.filialCodigo}</span> {f.filialNome}
                      </TableCell>
                      <TableCell>{jornadaAtual ?? <Status tom="atencao">Sem jornada</Status>}</TableCell>
                      <TableCell>
                        <Status tom={s.tom}>{s.texto}</Status>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{temPin.has(f.id) ? <Status tom="sucesso">Cadastrado</Status> : <Status tom="neutro">Sem PIN</Status>}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Link href={`/ponto/banco?funcionario=${f.id}`} className="text-xs text-fct-tinta underline">
                            Banco
                          </Link>
                          {podeEditar && <PinForm action={definirPin.bind(null, f.id)} nome={f.nome} temPin={temPin.has(f.id)} compacto />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {podeEditar && (
              <LoteJornadaForm
                action={aplicarJornada}
                jornadas={jornadas.filter((j) => j.ativo).map((j) => ({ id: j.id, nome: j.nome, filial: j.branch_id ? (pag.find((l) => l.func.branch_id === j.branch_id)?.func.filialCodigo ?? "uma filial") : null }))}
                hoje={hoje}
              />
            )}
            <div className="border-t px-4 py-3">
              <Paginacao pagina={pagina} paginas={paginas} total={filtradas.length} tamanho={TAMANHO} params={params} />
            </div>
          </>
        )}
      </Painel>
      {jornadas.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Ainda não há modelos de jornada.{" "}
          <Link href="/ponto/jornadas" className="text-fct-tinta underline">
            Cadastre o primeiro
          </Link>
          .
        </p>
      )}
    </>
  );
}
