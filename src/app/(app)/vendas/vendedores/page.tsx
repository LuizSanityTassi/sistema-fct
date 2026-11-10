import Link from "next/link";
import { Eye, UserCheck, UserX } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { DIAS_VENDEDORES, FILIAIS_FORA_DO_PORTAL, vendedoresEFuncionarios, type FuncionarioVinculo, type LinhaVendedor } from "@/lib/data/vendas-vendedores";
import { cn } from "cn";
import { AbasVendas, moeda } from "../comum";
import { desligarVendedor, ligarSugestoes, ligarVendedor } from "./actions";

export const metadata = { title: "Acesso dos vendedores" };

const VISOES = { pendentes: "Falta ligar", ligados: "Ligados", fora: "Lojas fora do portal", todos: "Todos" } as const;
type Visao = keyof typeof VISOES;

const ROTULO_SUGESTAO = { certa: "sugestão certa", provavel: "confira", varias: "mais de um possível", nenhuma: "" } as const;

function Login({ f }: { f: FuncionarioVinculo }) {
  return f.temLogin ? (
    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">tem login</span>
  ) : (
    <Link href="/configuracoes/usuarios" className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 underline" title="Sem login ativo: crie o acesso em Configurações → Usuários para ele entrar">
      sem login
    </Link>
  );
}

export default async function AcessoVendedoresPage({ searchParams }: PageProps<"/vendas/vendedores">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/vendas/vendedores"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const visao: Visao = s("ver") in VISOES ? (s("ver") as Visao) : "pendentes";
  const q = s("q").trim();
  const msg = s("msg");
  const { linhas, opcoes } = await vendedoresEFuncionarios();

  const busca = q.toUpperCase();
  const filtradas = linhas.filter(
    (l) =>
      (visao === "todos" || (visao === "ligados" ? !!l.vinculado : visao === "fora" ? l.foraDoPortal : !l.vinculado && !l.foraDoPortal)) &&
      (!busca || l.nomeTrier.toUpperCase().includes(busca) || String(l.codigo) === busca || l.vinculado?.nome.toUpperCase().includes(busca) || l.filial === busca),
  );
  const ligados = linhas.filter((l) => l.vinculado);
  const certas = filtradas.filter((l) => l.sugestao?.tipo === "certa");
  const volta = new URLSearchParams({ ...(visao !== "pendentes" ? { ver: visao } : {}), ...(q ? { q } : {}) }).toString();
  const pares = JSON.stringify(certas.map((l) => ({ c: l.codigo, e: l.sugestao!.candidatos[0].id, n: l.nomeTrier })));

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        titulo="Acesso dos vendedores"
        descricao="Ligue o código de cada vendedor do Trier ao funcionário. Ligado, ele entra com o login dele e vê em Comercial → Minhas vendas única e exclusivamente a própria venda (sem custo, sem a venda dos colegas ou da loja)."
      />
      <AbasVendas ativa="/vendas/vendedores" papel={sessao.papel} />
      {msg && (
        <div role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {msg}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{linhas.length}</strong> vendedores (venderam nos últimos {DIAS_VENDEDORES} dias ou já ligados)
        </span>
        <span>
          <strong className="text-foreground">{ligados.length}</strong> ligados
        </span>
        <span>
          <strong className="text-foreground">{ligados.filter((l) => l.vinculado?.temLogin).length}</strong> ligados com login
        </span>
        <span>
          <strong className="text-foreground">{linhas.filter((l) => !l.vinculado && !l.foraDoPortal).length}</strong> falta ligar
        </span>
        <span>
          <strong className="text-foreground">{linhas.filter((l) => l.foraDoPortal).length}</strong> de lojas fora do portal ({[...FILIAIS_FORA_DO_PORTAL].join(", ")}), que não precisam de vínculo
        </span>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <div className="flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Quais">
          {(Object.keys(VISOES) as Visao[]).map((v) => (
            <Link key={v} href={`/vendas/vendedores?ver=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={visao === v ? "page" : undefined} className={cn("rounded-md px-3 py-1", visao === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {VISOES[v]}
            </Link>
          ))}
        </div>
        <input type="hidden" name="ver" value={visao} />
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Procurar</span>
          <Input name="q" defaultValue={q} placeholder="Nome, código ou filial (F014)" className="w-64" />
        </label>
        <Button type="submit">Pesquisar</Button>
        {certas.length > 0 && (
          <div className="ml-auto flex flex-col items-end gap-1">
            <Button type="submit" form="ligar-certas" variant="default">
              Ligar as {certas.length} sugestões certas
            </Button>
            <span className="text-[11px] text-muted-foreground">nome do Trier batendo com um único funcionário ativo; nenhum código já ligado é trocado</span>
          </div>
        )}
      </form>
      <form id="ligar-certas" action={ligarSugestoes} className="hidden">
        <input type="hidden" name="pares" value={pares} />
        <input type="hidden" name="volta" value={volta} />
      </form>

      <datalist id="funcionarios-ativos">
        {opcoes.map((o) => (
          <option key={o.id} value={o.rotulo} />
        ))}
      </datalist>

      <section className="rounded-xl border bg-card">
        {!filtradas.length ? (
          <EstadoVazio icone={UserCheck} titulo={visao === "pendentes" && !q ? "Todos os vendedores estão ligados" : "Nenhum vendedor com esse filtro"} />
        ) : (
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Vendedor no Trier</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Venda {DIAS_VENDEDORES} dias</TableHead>
                <TableHead className="pr-4">Funcionário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => (
                <Linha key={l.codigo} l={l} volta={volta} />
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        As sugestões comparam o nome do Trier (que corta em 20 letras e abrevia) com o cadastro dos funcionários ativos, dando preferência a quem é da filial onde o vendedor mais vendeu. Nada é ligado sem você confirmar. Para o vendedor entrar, ele precisa de login (o mesmo do Meu ponto); quem estiver &quot;sem login&quot; ganha acesso em Configurações → Usuários.
      </p>
    </>
  );
}

function Linha({ l, volta }: { l: LinhaVendedor; volta: string }) {
  const sug = l.sugestao;
  return (
    <TableRow className="align-top">
      <TableCell className="pl-4">
        <span className="font-medium">{l.nomeTrier}</span> <span className="font-mono text-xs text-muted-foreground">{l.codigo}</span>
      </TableCell>
      <TableCell>
        {l.filial ? (
          <>
            <span className="font-mono text-xs">{l.filial}</span> <span className="hidden text-xs text-muted-foreground lg:inline">{l.loja}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">sem venda em 60 dias</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{l.venda ? moeda(l.venda) : "—"}</TableCell>
      <TableCell className="pr-4">
        {l.vinculado ? (
          <div className="flex flex-wrap items-center gap-2">
            <UserCheck className="size-4 text-emerald-600" aria-hidden />
            <span className="font-medium">{l.vinculado.nome}</span>
            {l.vinculado.usuario ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">usuário do portal, sem ficha no RH</span> : <span className="font-mono text-xs text-muted-foreground">{l.vinculado.filial}</span>}
            {l.vinculado.status === "desligado" ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-800">desligado</span> : <Login f={l.vinculado} />}
            <Link href={`/vendas/minhas?${l.vinculado.usuario ? "usuario" : "func"}=${l.vinculado.id}`} className="inline-flex items-center gap-1 text-xs underline">
              <Eye className="size-3.5" aria-hidden /> ver o que ele vê
            </Link>
            <form action={desligarVendedor} className="ml-auto">
              <input type="hidden" name="codigo" value={l.codigo} />
              <input type="hidden" name="volta" value={volta} />
              <button type="submit" className="inline-flex items-center gap-1 text-xs text-red-700 underline">
                <UserX className="size-3.5" aria-hidden /> desligar
              </button>
            </form>
          </div>
        ) : l.foraDoPortal ? (
          <span className="text-xs text-muted-foreground">loja fora do portal: sem vínculo</span>
        ) : (
          <div className="grid gap-1.5">
            {sug && sug.candidatos.length > 0 && (
              <form action={ligarVendedor} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="codigo" value={l.codigo} />
                <input type="hidden" name="nome" value={l.nomeTrier} />
                <input type="hidden" name="volta" value={volta} />
                {sug.candidatos.length === 1 ? (
                  <>
                    <input type="hidden" name="employee" value={sug.candidatos[0].id} />
                    <span className="font-medium">{sug.candidatos[0].nome}</span>
                  </>
                ) : (
                  <select name="employee" className="h-8 max-w-64 rounded-md border bg-background px-2 text-sm" aria-label={`Qual funcionário é ${l.nomeTrier}`}>
                    {sug.candidatos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                )}
                <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", sug.tipo === "certa" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>{ROTULO_SUGESTAO[sug.tipo]}</span>
                <Button type="submit" size="sm" variant="outline" className="h-7">
                  Ligar
                </Button>
              </form>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">{sug?.candidatos.length ? "é outra pessoa" : "escolher o funcionário"}</summary>
              <form action={ligarVendedor} className="mt-1.5 flex flex-wrap items-center gap-2">
                <input type="hidden" name="codigo" value={l.codigo} />
                <input type="hidden" name="nome" value={l.nomeTrier} />
                <input type="hidden" name="volta" value={volta} />
                <Input name="rotulo" list="funcionarios-ativos" placeholder="Digite o nome do funcionário" className="h-8 w-72" aria-label={`Funcionário para ${l.nomeTrier}`} required />
                <Button type="submit" size="sm" variant="outline" className="h-7">
                  Ligar
                </Button>
              </form>
            </details>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
