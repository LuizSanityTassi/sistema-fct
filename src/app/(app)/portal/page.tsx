import Link from "next/link";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { Emblema, Onda } from "@/components/layout/marca";
import { getSessao } from "@/lib/auth/session";
import { carregarPendencias } from "@/lib/data/pendencias";
import { pluralizar } from "@/lib/formatos";
import { grupoDaRota, navParaPapel } from "@/lib/nav";
import { rotuloCargo } from "@/lib/roles";

export const metadata = { title: "Portal de Gestão" };

/** Tela de entrada: os grupos do menu viram módulos (só os que o perfil abre), cada um com as telas dele. */
export default async function PortalPage() {
  const sessao = await getSessao();
  const [modulos, pendencias] = await Promise.all([navParaPapel(sessao.papel, sessao.telasExtras), carregarPendencias(sessao)]);
  const primeiroNome = sessao.nome.split(" ")[0];
  const hojeTexto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = hojeTexto.charAt(0).toUpperCase() + hojeTexto.slice(1);
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  // pendências de cada módulo (pela tela para onde cada uma leva)
  const pendDoModulo = new Map<string, number>();
  for (const p of pendencias) {
    const titulo = grupoDaRota(p.href.split(/[?#]/)[0])?.titulo;
    if (titulo) pendDoModulo.set(titulo, (pendDoModulo.get(titulo) ?? 0) + 1);
  }
  const totalTelas = modulos.reduce((s, m) => s + m.itens.length, 0);

  return (
    <>
      <section className="relative mb-8 overflow-hidden rounded-3xl bg-fct-red-fundo px-6 pt-7 pb-20 text-white shadow-lg sm:px-10 sm:pt-10 sm:pb-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_26rem_at_-15%_-20%,oklch(0.577_0.234_28/0.7),transparent_60%)]" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-48 size-72 rounded-full bg-fct-yellow sm:-right-10 sm:-bottom-56 sm:size-96" />
        <Onda tom="vermelho" className="pointer-events-none absolute inset-x-0 bottom-0 h-14 sm:h-16" />
        <div className="relative flex items-center gap-6">
          <span className="hidden shrink-0 rounded-2xl bg-white p-2.5 shadow-xl ring-1 ring-white/20 sm:block">
            <Emblema largura={84} prioridade />
          </span>
          <div className="max-w-[min(42rem,78%)]">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-white/90 uppercase">{hoje}</p>
            <h1 className="mt-1.5 font-heading text-3xl leading-tight text-balance sm:text-[2.6rem]">Bem-vindo ao Portal de Gestão FCT</h1>
            <p className="mt-2 text-sm text-white/90 sm:text-base">
              {saudacao}, {primeiroNome}. Escolha um módulo para começar.
            </p>
          </div>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <LayoutGrid className="size-4 text-fct-red" aria-hidden />
            Seus módulos
          </h2>
          <p className="text-xs text-muted-foreground">
            {rotuloCargo(sessao.cargo, sessao.adminSistema)} · {pluralizar(modulos.length, "módulo", "módulos")} · {pluralizar(totalTelas, "tela liberada", "telas liberadas")}
            {pendencias.length ? ` · ${pluralizar(pendencias.length, "pendência", "pendências")}` : ""}
          </p>
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Procurando uma tela? Aperte <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px]">Ctrl</kbd> + <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px]">K</kbd>
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {modulos.map((m) => {
          const Icone = m.icone ?? LayoutGrid;
          const entrada = m.itens[0];
          const pend = m.titulo ? (pendDoModulo.get(m.titulo) ?? 0) : 0;
          const visiveis = m.itens.slice(0, 4);
          const resto = m.itens.length - visiveis.length;
          return (
            <li key={m.titulo ?? entrada.href}>
              <article className="group relative flex h-full flex-col rounded-2xl border bg-card p-5 shadow-xs transition-[transform,box-shadow,border-color] duration-200 focus-within:border-fct-red/40 hover:-translate-y-0.5 hover:border-fct-red/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-fct-red/10 text-fct-red transition-colors group-hover:bg-fct-red group-hover:text-white">
                    <Icone className="size-5" aria-hidden />
                  </span>
                  {pend > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">{pluralizar(pend, "pendência", "pendências")}</span>
                  )}
                </div>
                <h3 className="mt-4 font-heading text-lg leading-snug">
                  <Link href={entrada.href} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
                    {m.titulo}
                  </Link>
                </h3>
                {m.descricao && <p className="mt-1 text-sm text-muted-foreground">{m.descricao}</p>}
                <ul className="relative z-10 mt-4 flex flex-wrap gap-1.5" aria-label={`Telas de ${m.titulo}`}>
                  {visiveis.map((i) => (
                    <li key={i.href}>
                      <Link href={i.href} className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:border-fct-red/40 hover:text-fct-red-dark">
                        {i.label}
                      </Link>
                    </li>
                  ))}
                  {resto > 0 && <li className="px-1 py-1 text-xs text-muted-foreground">+{resto}</li>}
                </ul>
                <span className="mt-auto flex items-center gap-1 pt-5 text-sm font-semibold text-fct-red-dark" aria-hidden>
                  Entrar
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}
