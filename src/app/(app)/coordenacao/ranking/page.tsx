import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Trophy } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { rankingLojas } from "@/lib/data/coordenacao";
import { REGIONAIS_PADRAO } from "@/lib/data/filiais";
import { formatarData } from "@/lib/formatos";
import { AbasCoordenacao } from "../abas";
import { MostrarEstrelas } from "../estrelas";

export const metadata = { title: "Ranking das lojas" };

const PERIODOS = [
  { chave: "mes", rotulo: "Este mês" },
  { chave: "3m", rotulo: "Últimos 3 meses" },
  { chave: "ano", rotulo: "Este ano" },
  { chave: "tudo", rotulo: "Desde o início" },
] as const;
type Periodo = (typeof PERIODOS)[number]["chave"];
/** regionais que aparecem mesmo sem checklist no período (as de loja); as outras só se tiverem */
const REGIONAIS_DE_LOJA = ["Sul", "Serra", "Oeste", "Vale do Itajaí", "Blumenau"];
const GERAL = "Geral";

const nota1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const corNota = (v: number) => (v >= 4 ? "text-emerald-700" : v >= 3 ? "text-amber-700" : "text-red-700");
const MEDALHA = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-300 text-orange-950"];

function periodoDe(p: Periodo, hoje: string): [string, string] {
  if (p === "mes") return [`${hoje.slice(0, 7)}-01`, hoje];
  if (p === "ano") return [`${hoje.slice(0, 4)}-01-01`, hoje];
  if (p === "tudo") return ["2000-01-01", hoje];
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 3);
  return [d.toISOString().slice(0, 10), hoje];
}

type Linha = Awaited<ReturnType<typeof rankingLojas>>[number];

export default async function RankingPage({ searchParams }: PageProps<"/coordenacao/ranking">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/coordenacao/ranking"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const periodo: Periodo = PERIODOS.some((p) => p.chave === s("periodo")) ? (s("periodo") as Periodo) : "3m";
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [de, ate] = periodoDe(periodo, hoje);
  const linhas = await rankingLojas(de, ate);

  const ordem = [...REGIONAIS_PADRAO, ...new Set(linhas.map((l) => l.regional ?? "Sem regional"))];
  const regionais = [...new Set(ordem)].filter((r) => {
    const daRegional = linhas.filter((l) => (l.regional ?? "Sem regional") === r);
    return daRegional.length > 0 && (REGIONAIS_DE_LOJA.includes(r) || daRegional.some((l) => l.qtd > 0));
  });
  const pedida = s("regional");
  const regional = pedida === GERAL || regionais.includes(pedida) ? pedida : "";
  const blocos = regional === GERAL ? [GERAL] : regional ? [regional] : regionais;
  const totalChecklists = linhas.reduce((t, l) => t + l.qtd, 0);

  return (
    <>
      <PageHeader eyebrow="Coordenação" titulo="Ranking das lojas" descricao="Lojas mais bem avaliadas nos checklists do coordenador, por regional. Média das notas (0 a 5 estrelas) dos checklists do período; cancelados não contam." />
      <AbasCoordenacao ativa="/coordenacao/ranking" papel={sessao.papel} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Período</span>
          <SelectNativo name="periodo" defaultValue={periodo} className="w-48">
            {PERIODOS.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Regional</span>
          <SelectNativo name="regional" defaultValue={regional} className="w-56">
            <option value="">Cada regional separada</option>
            <option value={GERAL}>Geral (todas juntas)</option>
            {regionais.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </SelectNativo>
        </label>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
        <p className="ml-auto self-center text-xs text-muted-foreground">
          {periodo === "tudo" ? "Desde o início" : `${formatarData(de)} a ${formatarData(ate)}`} · {totalChecklists} {totalChecklists === 1 ? "checklist" : "checklists"}
        </p>
      </form>

      {totalChecklists === 0 ? (
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            icone={Trophy}
            titulo="Nenhum checklist nesse período"
            descricao={
              <>
                O ranking sai das notas dos{" "}
                <Link href="/coordenacao" className="underline">
                  checklists da loja
                </Link>
                . Escolha um período maior ou faça os checklists das visitas.
              </>
            }
          />
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {blocos.map((b) => (
            <BlocoRanking key={b} titulo={b === GERAL ? "Ranking geral" : `Ranking ${b}`} linhas={b === GERAL ? linhas : linhas.filter((l) => (l.regional ?? "Sem regional") === b)} mostrarRegional={b === GERAL} />
          ))}
        </div>
      )}
    </>
  );
}

function BlocoRanking({ titulo, linhas, mostrarRegional }: { titulo: string; linhas: Linha[]; mostrarRegional: boolean }) {
  const avaliadas = linhas
    .filter((l) => l.qtd > 0 && l.media !== null)
    .sort((a, b) => b.media! - a.media! || b.qtd - a.qtd || (b.ultima_data ?? "").localeCompare(a.ultima_data ?? "") || a.codigo.localeCompare(b.codigo));
  const semChecklist = linhas.filter((l) => l.qtd === 0).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const mediaRegional = avaliadas.length ? avaliadas.reduce((t, l) => t + l.media!, 0) / avaliadas.length : null;

  return (
    <Painel
      titulo={titulo}
      icone={Trophy}
      descricao={`${avaliadas.length} de ${linhas.length} ${linhas.length === 1 ? "loja avaliada" : "lojas avaliadas"} no período`}
      acao={
        mediaRegional !== null && (
          <span className="flex items-center gap-1.5 text-sm font-semibold" title="Média das lojas avaliadas">
            <MostrarEstrelas nota={mediaRegional} tamanho="size-3.5" />
            {nota1(mediaRegional)}
          </span>
        )
      }
    >
      {avaliadas.length === 0 ? (
        <p className="border-t px-5 py-3 text-sm text-muted-foreground">Nenhuma loja desta regional com checklist no período.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Média</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Visitas</TableHead>
              <TableHead className="hidden md:table-cell">Última</TableHead>
              <TableHead className="hidden lg:table-cell">Ponto fraco</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {avaliadas.map((l, i) => {
              const subiu = l.ultima_media !== null && l.anterior_media !== null ? l.ultima_media - l.anterior_media : null;
              return (
                <TableRow key={l.branch_id}>
                  <TableCell>
                    <span className={`inline-grid size-6 place-items-center rounded-full text-xs font-bold ${MEDALHA[i] ?? "text-muted-foreground"}`}>{i + 1}º</span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/coordenacao?filial=${l.branch_id}`} className="hover:underline">
                      <span className="font-mono text-xs">{l.codigo}</span> <span className="text-sm">{l.nome}</span>
                    </Link>
                    {mostrarRegional && <span className="block text-[11px] text-muted-foreground">{l.regional ?? "Sem regional"}</span>}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <MostrarEstrelas nota={l.media!} tamanho="size-3.5" />
                      <span className={`text-sm font-semibold tabular-nums ${corNota(l.media!)}`}>{nota1(l.media!)}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{l.qtd}</TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {formatarData(l.ultima_data)}
                    {l.ultima_media !== null && <span className="ml-1 tabular-nums text-muted-foreground">({nota1(l.ultima_media)})</span>}
                    {subiu !== null && Math.abs(subiu) >= 0.05 && (
                      <span className={`ml-1 inline-flex items-center ${subiu > 0 ? "text-emerald-700" : "text-red-700"}`} title={`Em relação à visita anterior (${nota1(l.anterior_media!)})`}>
                        {subiu > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                        <span className="sr-only">{subiu > 0 ? "subiu" : "caiu"} em relação à visita anterior</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {l.pior_item ? (
                      <>
                        {l.pior_item} <span className={`font-semibold tabular-nums ${corNota(l.pior_nota ?? 0)}`}>{nota1(l.pior_nota ?? 0)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {semChecklist.length > 0 && (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Sem checklist no período ({semChecklist.length}): </span>
          {semChecklist.map((l) => l.codigo).join(", ")}
        </p>
      )}
    </Painel>
  );
}
