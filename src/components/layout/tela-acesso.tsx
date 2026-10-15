import type { ReactNode } from "react";
import { BadgeCheck, Building2, ChartColumn, LifeBuoy, Users } from "lucide-react";

const DESTAQUES = [
  { icone: Users, texto: "RH, folha e lançamentos para a contabilidade" },
  { icone: ChartColumn, texto: "Financeiro, DRE e conciliação bancária" },
  { icone: LifeBuoy, texto: "Chamados, TI e acessos" },
  { icone: Building2, texto: "Todas as filiais num lugar só" },
];

function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-11 items-center justify-center rounded-xl bg-fct-red text-sm font-black tracking-tight text-white shadow-lg ring-1 ring-white/10">FCT</span>
      <span className="leading-tight">
        <span className={claro ? "block text-[11px] font-semibold tracking-[0.16em] text-white/70 uppercase" : "block text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase"}>
          Farmácias FCT
        </span>
        <span className={claro ? "block text-lg font-semibold text-white" : "block text-lg font-semibold text-fct-navy"}>Sistema FCT</span>
      </span>
    </div>
  );
}

/** Layout das telas sem login (entrar, recuperar e definir senha): painel da marca + formulário. */
export function TelaAcesso({ titulo, descricao, children, rodape }: { titulo: string; descricao?: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(60rem 40rem at -10% -20%, oklch(0.52 0.21 27 / 0.35), transparent 60%), radial-gradient(40rem 30rem at 110% 120%, oklch(0.84 0.17 92 / 0.18), transparent 60%)",
          }}
        />
        <div className="relative">
          <Logo claro />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance">A gestão das Farmácias FCT, de ponta a ponta.</h2>
          <ul className="mt-8 space-y-3">
            {DESTAQUES.map(({ icone: Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
                  <Icone className="size-4 text-fct-yellow" aria-hidden />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/70">
          <BadgeCheck className="size-4" aria-hidden />
          Uso interno · acesso restrito a colaboradores autorizados
        </p>
      </aside>

      <main id="conteudo" className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fct-navy">{titulo}</h1>
          {descricao && <p className="mt-1.5 text-sm text-muted-foreground">{descricao}</p>}
          <div className="mt-6">{children}</div>
          {rodape && <div className="mt-6 text-center text-sm">{rodape}</div>}
        </div>
      </main>
    </div>
  );
}
