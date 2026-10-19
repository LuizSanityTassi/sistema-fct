"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<typeof Button> & { rotuloPendente?: string };

/** Botão de envio padrão (amarelo FCT) que desabilita enquanto a Server Action roda. */
export function BotaoSalvar({ children = "Salvar", rotuloPendente = "Salvando…", className, ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className={cn("", className)}
      {...props}
    >
      {pending ? rotuloPendente : children}
    </Button>
  );
}
