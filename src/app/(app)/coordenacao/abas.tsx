import Link from "next/link";
import type { AppRole } from "@/lib/roles";
import { podeAcessar } from "@/lib/nav";

const ABAS = [
  { href: "/coordenacao", rotulo: "Checklists" },
  { href: "/coordenacao/ranking", rotulo: "Ranking das lojas" },
] as const;

/** Abas da Coordenação (só as que o papel abre). */
export function AbasCoordenacao({ ativa, papel }: { ativa: (typeof ABAS)[number]["href"]; papel: AppRole }) {
  const abas = ABAS.filter((a) => podeAcessar(papel, a.href));
  if (abas.length < 2) return null;
  return (
    <nav aria-label="Abas" className="mb-4 flex flex-wrap gap-2 print:hidden">
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          aria-current={a.href === ativa ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${a.href === ativa ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
