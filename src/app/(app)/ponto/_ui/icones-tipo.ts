import { Coffee, LogIn, LogOut, Undo2 } from "lucide-react";
import type { TipoMarcacao } from "@/lib/ponto/calculo";

/** Ícone de cada tipo de marcação (para componentes de cliente). */
export const ICONE_TIPO_CLIENTE: Record<TipoMarcacao, typeof LogIn> = { entrada: LogIn, intervalo_inicio: Coffee, intervalo_fim: Undo2, saida: LogOut };
