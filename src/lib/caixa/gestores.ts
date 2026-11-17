// Opções de gestor das quebras (puro): gerentes primeiro, depois os líderes de loja e os demais usuários ativos.
import { ehPapel, PAPEL_LABEL } from "@/lib/roles";

export type UsuarioGestor = { id: string; nome: string; papel: string; filial: string | null };
export type GrupoGestores = { titulo: string; opcoes: { id: string; rotulo: string }[] };

export function gruposDeGestores(usuarios: UsuarioGestor[]): GrupoGestores[] {
  const rotulo = (u: UsuarioGestor) => `${u.nome}${u.filial ? ` · ${u.filial}` : ""}${ehPapel(u.papel) ? ` · ${PAPEL_LABEL[u.papel]}` : ""}`;
  const gerentes = usuarios.filter((u) => u.papel === "gerente");
  const lideres = usuarios.filter((u) => u.papel === "lider_loja");
  const outros = usuarios.filter((u) => u.papel !== "gerente" && u.papel !== "lider_loja");
  return [
    ...(gerentes.length ? [{ titulo: "Gerentes", opcoes: gerentes.map((u) => ({ id: u.id, rotulo: rotulo(u) })) }] : []),
    ...(lideres.length ? [{ titulo: "Líderes de loja", opcoes: lideres.map((u) => ({ id: u.id, rotulo: rotulo(u) })) }] : []),
    ...(outros.length ? [{ titulo: "Outros usuários", opcoes: outros.map((u) => ({ id: u.id, rotulo: rotulo(u) })) }] : []),
  ];
}
