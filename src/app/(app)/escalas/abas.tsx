import Link from "next/link";

const ABAS = [
  { href: "/escalas", rotulo: "Filiais e equipes" },
  { href: "/escalas/simulador", rotulo: "Simulador e escalas oficiais" },
] as const;

/** Abas do simulador de escala 5x2. */
export function AbasEscala({ ativa }: { ativa: (typeof ABAS)[number]["href"] | null }) {
  return (
    <nav aria-label="Abas" className="mb-4 flex flex-wrap gap-2 print:hidden">
      {ABAS.map((a) => (
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
