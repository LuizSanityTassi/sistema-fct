import "server-only";
import { cache } from "react";
import type { AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

// Trava contábil do mês (migração 0134): o contador trava o mês que passou e nada da parte contábil dele muda —
// DRE contábil, caixa contábil e os lançamentos do financeiro do mês. Quem garante é o banco (triggers); aqui é só
// para a tela mostrar e avisar antes.

/** Travar e liberar: contador e administrador. */
export const podeTravarContabil = (papel: AppRole) => papel === "admin" || papel === "contador";

export type MesTravado = { competencia: string; travadoEm: string; por: string | null };

/** Meses travados, do mais novo para o mais velho ("aaaa-mm"). */
export const listarMesesTravados = cache(async (): Promise<MesTravado[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contabil_meses_travados").select("competencia, travado_em, travado_por_nome").order("competencia", { ascending: false });
  if (error) throw error;
  return data.map((m) => ({ competencia: m.competencia.slice(0, 7), travadoEm: m.travado_em, por: m.travado_por_nome }));
});

/** O mês "aaaa-mm" está travado pelo contador? */
export async function mesTravadoContabil(competencia: string) {
  return (await listarMesesTravados()).some((m) => m.competencia === competencia);
}
