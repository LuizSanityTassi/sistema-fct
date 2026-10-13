import type { Database } from "@/lib/supabase/types";

// Atalhos para os tipos gerados do banco (src/lib/supabase/types.ts).
export type Tabelas = Database["public"]["Tables"];
export type Linha<T extends keyof Tabelas> = Tabelas[T]["Row"];
export type Inserir<T extends keyof Tabelas> = Tabelas[T]["Insert"];
export type Atualizar<T extends keyof Tabelas> = Tabelas[T]["Update"];
export type Enums = Database["public"]["Enums"];
