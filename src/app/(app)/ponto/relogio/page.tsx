import Link from "next/link";
import { Clock, Fingerprint, KeyRound, Link2, Maximize } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { lerUuid } from "@/lib/data/ponto";
import { formatarDataHora } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { origemDoSistema } from "@/lib/ti/qr";
import { CopiarLink, FormAcessoRelogio, FormLinkRelogio } from "./acessos-relogio";
import { desativarLinkRelogio, gerarLinkRelogio, revogarLeitor, salvarAcessoRelogio } from "./actions";
import { filiaisDoRelogio } from "./filiais";

export const metadata = { title: "Relógio da filial" };

export default async function RelogioPage({
  searchParams,
}: PageProps<"/ponto/relogio">) {
  const [sessao, sp] = await Promise.all([
    exigirAcesso("/ponto/relogio"),
    searchParams,
  ]);
  const opcoes = await filiaisDoRelogio(sessao);
  const escolhida = lerUuid(sp.filial) ?? sessao.branchId ?? undefined;
  const filial =
    opcoes.find((u) => u.id === escolhida) ??
    (opcoes.length === 1 ? opcoes[0] : undefined);
  const admin = sessao.papel === "admin";

  // logins de relógio já criados (só o administrador vê e cria)
  let acessos: {
    id: string;
    email: string | null;
    ativo: boolean;
    ultimo_acesso: string | null;
    branch_id: string | null;
  }[] = [];
  let leitores: {
    id: string;
    branch_id: string;
    ativo: boolean;
    ativado_em: string | null;
    ultimo_uso: string | null;
  }[] = [];
  let links: { branch_id: string; token: string | null; criado_em: string; ultimo_uso: string | null; usos: number }[] = [];
  if (admin) {
    const supabase = await createClient();
    const [{ data }, { data: dadosLeitores }, { data: dadosLinks }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, ativo, ultimo_acesso, branch_id")
        .eq("papel", "relogio")
        .order("email"),
      supabase.rpc("ponto_leitores_lista"),
      supabase.from("relogio_links").select("branch_id, token, criado_em, ultimo_uso, usos").is("revogado_em", null),
    ]);
    acessos = data ?? [];
    leitores = dadosLeitores ?? [];
    links = dadosLinks ?? [];
  }
  const filialPorId = new Map(opcoes.map((u) => [u.id, u]));
  const comAcesso = new Set(acessos.map((a) => a.branch_id));
  const comLink = new Set(links.map((l) => l.branch_id));
  const origem = admin ? await origemDoSistema() : "";

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Relógio da filial"
        descricao="O relógio abre em tela cheia, sem o menu do sistema: o funcionário só coloca o dedo ou digita a matrícula e o PIN. Para sair, pede a senha."
        acoes={
          opcoes.length > 1 && (
            <form method="get" className="flex gap-2">
              <SelectNativo
                name="filial"
                defaultValue={filial?.id ?? ""}
                aria-label="Filial do relógio"
                className="w-64"
              >
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
                Escolher
              </Button>
            </form>
          )
        }
      />
      {filial ? (
        <Painel className="mb-6">
          <div className="flex flex-col items-start gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-fct-red/10 text-fct-red">
                <Clock className="size-6" aria-hidden />
              </span>
              <div>
                <p className="font-heading text-lg leading-tight">
                  {filial.codigo} {filial.nome}
                </p>
                <p className="text-sm text-muted-foreground">
                  Abra no computador ou tablet da loja e deixe ligado. Para sair
                  do relógio, digite a sua senha.
                </p>
              </div>
            </div>
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href={`/relogio?filial=${filial.id}`} replace />}
            >
              <Maximize aria-hidden />
              Abrir relógio
            </Button>
          </div>
        </Painel>
      ) : (
        <Painel className="mb-6">
          <EstadoVazio
            icone={Clock}
            titulo="Escolha a filial do relógio"
            descricao="O relógio só registra o ponto de funcionários da filial escolhida."
          />
        </Painel>
      )}

      {admin && (
        <Painel
          className="mb-6"
          icone={Link2}
          titulo="Link do relógio de cada filial (sem senha)"
          descricao="Gere o link e abra no computador da loja: ele entra direto no relógio da filial, sem digitar senha, e não dá acesso a mais nada do sistema. O link não vence: vale até alguém gerar outro ou desativar, e fica aqui para copiar quando precisar. Deixe a página aberta (dá para salvar como favorito ou atalho). Para sair do relógio, um gestor digita o e-mail e a senha dele. Não abra o link no seu computador: ele troca o seu login pelo do relógio."
        >
          <FormLinkRelogio
            acao={gerarLinkRelogio}
            filiais={opcoes.map((u) => ({ id: u.id, codigo: u.codigo, nome: u.nome, temLink: comLink.has(u.id) }))}
          />
          {links.length > 0 && (
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Filial</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead>Gerado em</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((l) => {
                    const u = filialPorId.get(l.branch_id);
                    return (
                      <TableRow key={l.branch_id}>
                        <TableCell className="pl-5">
                          {u ? (
                            <>
                              <span className="font-mono">{u.codigo}</span> {u.nome}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {l.token ? <CopiarLink link={`${origem}/relogio/entrar/${l.token}`} /> : <span className="text-xs text-muted-foreground">gere de novo para ver</span>}
                        </TableCell>
                        <TableCell className="text-sm">{formatarDataHora(l.criado_em)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {l.ultimo_uso ? `${formatarDataHora(l.ultimo_uso)} (${l.usos}×)` : "nunca aberto"}
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          <form action={desativarLinkRelogio}>
                            <input type="hidden" name="filial" value={l.branch_id} />
                            <Button type="submit" size="xs" variant="ghost" title="O link para de funcionar e os computadores com o relógio aberto saem em até 1 hora">
                              Desativar e desconectar
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Painel>
      )}

      {admin && (
        <Painel
          icone={KeyRound}
          titulo="Login do relógio de cada filial"
          descricao="Mais seguro que abrir o relógio com o login do gerente: este login só abre o relógio da filial e, mesmo que alguém saia da tela, não vê nada do sistema. Na loja, entre uma vez com ele e o aparelho fica no relógio."
        >
          <FormAcessoRelogio
            acao={salvarAcessoRelogio}
            filiais={opcoes.map((u) => ({
              id: u.id,
              codigo: u.codigo,
              nome: u.nome,
              temAcesso: comAcesso.has(u.id),
            }))}
          />
          {acessos.length > 0 && (
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Filial</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Último uso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acessos.map((a) => {
                    const u = a.branch_id
                      ? filialPorId.get(a.branch_id)
                      : undefined;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="pl-5">
                          {u ? (
                            <>
                              <span className="font-mono">{u.codigo}</span>{" "}
                              {u.nome}
                            </>
                          ) : (
                            "—"
                          )}
                          {!a.ativo && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (desativado)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {a.email}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {a.ultimo_acesso
                            ? formatarDataHora(a.ultimo_acesso)
                            : "nunca"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Painel>
      )}

      {admin && (
        <Painel
          className="mt-6"
          icone={Fingerprint}
          titulo="Leitor de digital de cada filial"
          descricao="Instale o programa do leitor no computador da loja e abra o relógio: o leitor se ativa sozinho. A pessoa só coloca o dedo; a matrícula com o PIN fica de reserva. Um computador novo em filial que já tem leitor precisa que o RH, a TI ou um administrador abra o relógio nele uma vez."
        >
          {leitores.length > 0 && (
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Filial</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leitores.map((l) => {
                    const u = filialPorId.get(l.branch_id);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="pl-5">
                          {u ? (
                            <>
                              <span className="font-mono">{u.codigo}</span>{" "}
                              {u.nome}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {l.ativo
                            ? `Ativo desde ${formatarDataHora(l.ativado_em ?? "")}`
                            : "Desativado"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {l.ultimo_uso
                            ? formatarDataHora(l.ultimo_uso)
                            : "nunca"}
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          {l.ativo && (
                            <form action={revogarLeitor}>
                              <input type="hidden" name="leitor" value={l.id} />
                              <Button type="submit" size="xs" variant="ghost">
                                Desativar
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Painel>
      )}
    </>
  );
}
