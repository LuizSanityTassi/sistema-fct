import type { Sessao } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";

/** Filiais em que a pessoa pode abrir o relógio: o gerente só a dele; os demais escolhem. */
export async function filiaisDoRelogio(sessao: Sessao) {
  const unidades = (await listarUnidadesParaSelecao()).filter((u) => u.ativo);
  return sessao.papel === "gerente" && sessao.branchId
    ? unidades.filter((u) => u.id === sessao.branchId)
    : unidades;
}

/** Login do relógio de cada filial (não recebe e-mail: a senha é definida pelo administrador). */
export function emailDoRelogio(codigo: string) {
  return `relogio.${codigo.trim().toLowerCase()}@farmaciafct.com.br`;
}
