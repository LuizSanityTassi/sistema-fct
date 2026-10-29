import Link from "next/link";
import { Clock, KeyRound, Maximize } from "lucide-react";
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
import { FormAcessoRelogio } from "./acessos-relogio";
import { salvarAcessoRelogio } from "./actions";
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
  if (admin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, email, ativo, ultimo_acesso, branch_id")
      .eq("papel", "relogio")
      .order("email");
    acessos = data ?? [];
  }
  const filialPorId = new Map(opcoes.map((u) => [u.id, u]));
  const comAcesso = new Set(acessos.map((a) => a.branch_id));

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Relógio da filial"
        descricao="O relógio abre em tela cheia, sem o menu do sistema: o funcionário só consegue digitar a matrícula e o PIN. Para sair, pede a senha."
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
    </>
  );
}
