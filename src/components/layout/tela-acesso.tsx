import type { ReactNode } from "react";
import { BadgeCheck, Building2, ChartColumn, LifeBuoy, Users } from "lucide-react";
import { Emblema, Onda } from "@/components/layout/marca";

const DESTAQUES = [
  { icone: Users, texto: "RH, folha e lançamentos para a contabilidade" },
  { icone: ChartColumn, texto: "Financeiro, DRE e conciliação bancária" },
  { icone: LifeBuoy, texto: "Chamados, TI e acessos" },
  { icone: Building2, texto: "Todas as filiais num lugar só" },
];

/** Layout das telas sem login (entrar, recuperar e definir senha): painel da marca + formulário. */
export function TelaAcesso({ titulo, descricao, children, rodape }: { titulo: string; descricao?: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-fct-red-fundo p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* faixa vermelha do site, com um leve brilho no alto */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_26rem_at_-15%_-20%,oklch(0.577_0.234_28/0.7),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <span className="rounded-2xl bg-white p-2.5 shadow-xl ring-1 ring-white/20">
            <Emblema largura={96} prioridade />
          </span>
          <span className="leading-tight">
            <span className="block text-[11px] font-semibold tracking-[0.18em] text-white/90 uppercase">Farmácia do Trabalhador</span>
            <span className="block font-heading text-2xl">Sistema FCT</span>
          </span>
        </div>
        <div className="relative max-w-md">
          <h2 className="font-heading text-[2rem] leading-tight text-balance">A gestão das Farmácias FCT, de ponta a ponta.</h2>
          <ul className="mt-8 space-y-3">
            {DESTAQUES.map(({ icone: Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex size-8 items-center justify-center rounded-lg bg-black/15 ring-1 ring-white/15">
                  <Icone className="size-4 text-fct-yellow" aria-hidden />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
        {/* o desenho da logo: sol nascendo atrás da onda */}
        <div aria-hidden className="pointer-events-none absolute -right-28 -bottom-60 size-[26rem] rounded-full bg-fct-yellow" />
        <Onda tom="vermelho" className="pointer-events-none absolute inset-x-0 bottom-16 h-24" />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-xs text-white/85 ring-1 ring-white/10">
            <BadgeCheck className="size-4" aria-hidden />
            Uso interno · acesso restrito a colaboradores autorizados
          </p>
          <p className="mt-2 pl-3 text-[11px] text-white/85">Desenvolvido por: Luiz Otávio Moreira</p>
        </div>
      </aside>

      <main id="conteudo" className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Emblema largura={150} prioridade />
            <span className="mt-2 text-[11px] font-semibold tracking-[0.18em] text-fct-red-dark uppercase">Farmácia do Trabalhador</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fct-tinta">{titulo}</h1>
          {descricao && <p className="mt-1.5 text-sm text-muted-foreground">{descricao}</p>}
          <div className="mt-6">{children}</div>
          {rodape && <div className="mt-6 text-center text-sm">{rodape}</div>}
          {/* no celular o painel vermelho some: o crédito vem para baixo do formulário */}
          <p className="mt-10 text-center text-[11px] text-muted-foreground lg:hidden">Desenvolvido por: Luiz Otávio Moreira</p>
        </div>
      </main>
    </div>
  );
}
