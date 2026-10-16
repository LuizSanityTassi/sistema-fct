import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type EmConstrucaoProps = {
  /** Ex.: "Etapa 5" ou "Fase futura". */
  fase: string;
  itens: string[];
  titulo?: string;
};

/** Marcador de módulo ainda não implementado: diz o que vai existir ali e em qual etapa. */
export function EmConstrucao({ fase, itens, titulo = "Módulo em desenvolvimento" }: EmConstrucaoProps) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2">
          <Construction className="size-4 text-fct-tinta" aria-hidden />
          <Badge variant="secondary">{fase}</Badge>
        </div>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>
          A estrutura de dados deste módulo já existe no banco. As telas entram nesta fase do projeto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          O que vai ter aqui
        </p>
        <ul className="grid gap-1.5 text-sm text-foreground/85 sm:grid-cols-2">
          {itens.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fct-red" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
