// Quem altera em Compras (importa pré-pedidos e notas, busca no Trier, desfaz importação): administrador, compras e o
// diretor de compras quando o administrador marcou "pode editar" (acesso_telas). O banco confere de novo (RLS).
import { createClient } from "@/lib/supabase/server";

export async function podeEscreverCompras(papel: string) {
  if (papel === "admin" || papel === "compras") return true;
  if (papel !== "diretor_compras") return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("compras_pode_escrever");
  return data === true;
}
