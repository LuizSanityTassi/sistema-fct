import Link from "next/link";
import { CalendarDays, Clock, Pencil, Plus } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, LinkPainel, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { administraPonto, configFiliais, listarJornadas } from "@/lib/data/ponto";
import { cargaSemanal, duracao, hojeLocal } from "@/lib/ponto/calculo";
import { createClient } from "@/lib/supabase/server";
import { ResumoJornada } from "../_ui/resumo-jornada";
import { salvarConfigFilial } from "./actions";
import { ConfigFilialForm } from "./config-filial-form";

export const metadata = { title: "Modelos de jornada" };

const OK: Record<string, string> = { criada: "Jornada criada.", atualizada: "Jornada atualizada." };

export default async function JornadasPage({ searchParams }: PageProps<"/ponto/jornadas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/jornadas"), searchParams]);
  const supabase = await createClient();
  const hoje = hojeLocal();
  const [jornadas, unidades, configs, { data: vinculos }] = await Promise.all([
    listarJornadas(),
    listarUnidadesParaSelecao(),
    configFiliais(),
    supabase.from("ponto_vinculos").select("jornada_id").lte("inicio", hoje).or(`fim.is.null,fim.gte.${hoje}`),
  ]);
  const pode = administraPonto(sessao);
  const usos = new Map<string, number>();
  for (const v of vinculos ?? []) usos.set(v.jornada_id, (usos.get(v.jornada_id) ?? 0) + 1);
  const filialDe = new Map(unidades.map((u) => [u.id, u]));
  const padroes = new Map<string, number>();
  for (const c of configs.values()) if (c.jornada_padrao_id) padroes.set(c.jornada_padrao_id, (padroes.get(c.jornada_padrao_id) ?? 0) + 1);
  const ok = typeof sp.ok === "string" ? OK[sp.ok] : undefined;
  const ativas = jornadas.filter((j) => j.ativo);

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Modelos de jornada"
        descricao="Jornadas fixas por dia da semana e escalas em ciclo (12x36, 6x2…). Cada funcionário usa um modelo; quem não tem usa a jornada padrão da filial."
        acoes={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/ponto/jornadas/feriados" />}>
              <CalendarDays aria-hidden /> Feriados
            </Button>
            {pode && (
              <Button nativeButton={false} render={<Link href="/ponto/jornadas/nova" />}>
                <Plus aria-hidden /> Nova jornada
              </Button>
            )}
          </>
        }
      />
      {ok && (
        <div className="mb-4">
          <AvisoSucesso mensagem={ok} />
        </div>
      )}

      {jornadas.length === 0 ? (
        <Painel>
          <EstadoVazio
            icone={Clock}
            titulo="Nenhuma jornada cadastrada"
            descricao="Comece pelo modelo mais comum da empresa (ex.: comercial 44h). Depois defina a jornada padrão de cada filial ou de cada funcionário."
            acao={
              pode && (
                <Button nativeButton={false} render={<Link href="/ponto/jornadas/nova" />}>
                  <Plus aria-hidden /> Criar a primeira jornada
                </Button>
              )
            }
          />
        </Painel>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jornadas.map((j) => {
            const f = j.branch_id ? filialDe.get(j.branch_id) : null;
            return (
              <article key={j.id} className="flex flex-col rounded-xl border bg-card p-4">
                <header className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{j.nome}</h2>
                    <p className="text-xs text-muted-foreground">
                      {j.tipo === "semanal" ? "Semanal" : `Escala de ${j.ciclo_dias} dias`} · {duracao(cargaSemanal(j))}h/semana · tolerância {j.tolerancia_min} min
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!j.ativo && <Status tom="neutro">Inativa</Status>}
                    {pode && (
                      <Button size="icon-sm" variant="ghost" nativeButton={false} render={<Link href={`/ponto/jornadas/${j.id}`} aria-label={`Editar ${j.nome}`} />}>
                        <Pencil aria-hidden />
                      </Button>
                    )}
                  </div>
                </header>
                <ResumoJornada jornada={j} />
                <footer className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                  <span>{f ? `Só ${f.codigo} ${f.nome}` : "Todas as filiais"}</span>
                  <span>{usos.get(j.id) ?? 0} funcionário(s)</span>
                  {padroes.get(j.id) ? <span>padrão de {padroes.get(j.id)} filial(is)</span> : null}
                </footer>
                {j.descricao && <p className="mt-1 text-xs text-muted-foreground">{j.descricao}</p>}
              </article>
            );
          })}
        </section>
      )}

      <Painel
        className="mt-6"
        titulo="Jornada padrão por filial"
        descricao="Vale para quem não tem jornada própria, a partir da data informada (antes dela ninguém tem falta). Localização: no celular, o registro pede o GPS."
        acao={<LinkPainel href="/ponto/equipe">Jornada por funcionário</LinkPainel>}
      >
        {pode ? (
          <div className="border-t">
            {unidades
              .filter((u) => u.ativo)
              .map((u) => (
                <ConfigFilialForm
                  key={u.id}
                  action={salvarConfigFilial}
                  filial={u}
                  jornadas={ativas.filter((j) => !j.branch_id || j.branch_id === u.id).map((j) => ({ id: j.id, nome: j.nome }))}
                  atual={configs.get(u.id) ?? null}
                  hoje={hoje}
                />
              ))}
          </div>
        ) : (
          <ul className="border-t text-sm">
            {unidades
              .filter((u) => u.ativo && configs.get(u.id)?.jornada_padrao_id)
              .map((u) => (
                <li key={u.id} className="flex justify-between gap-2 border-b px-5 py-2 last:border-0">
                  <span>
                    <span className="font-mono text-xs text-fct-tinta">{u.codigo}</span> {u.nome}
                  </span>
                  <span className="text-muted-foreground">{jornadas.find((j) => j.id === configs.get(u.id)?.jornada_padrao_id)?.nome}</span>
                </li>
              ))}
            {![...configs.values()].some((c) => c.jornada_padrao_id) && <li className="px-5 py-4 text-muted-foreground">Nenhuma filial com jornada padrão.</li>}
          </ul>
        )}
      </Painel>
    </>
  );
}
