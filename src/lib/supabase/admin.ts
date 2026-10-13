// USO EXCLUSIVO NO SERVIDOR (Server Actions). Nunca importar em componentes client.
// A chave service_role ignora o RLS: só é usada para operações administrativas de Auth
// (convidar usuário por e-mail). Vem de variável de ambiente; não existe no código nem no Git.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;
  return createClient<Database>(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
