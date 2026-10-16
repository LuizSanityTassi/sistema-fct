"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BotaoImprimir() {
  return (
    <Button onClick={() => window.print()} className="bg-fct-yellow font-semibold text-fct-tinta hover:bg-fct-yellow/85">
      <Printer data-icon="inline-start" />
      Imprimir
    </Button>
  );
}
