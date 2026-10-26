// Utilitários das Server Actions do ponto.

export type EstadoPonto = {
  erro?: string;
  erros?: Record<string, string>;
  ok?: string;
};

export function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "8:00" / "08:00" → "08:00"; vazio → null; inválido → undefined. */
export function lerHorario(fd: FormData, nome: string): string | null | undefined {
  const t = texto(fd, nome);
  if (!t) return null;
  const n = t.length === 4 ? `0${t}` : t.slice(0, 5);
  return HORA_RE.test(n) ? n : undefined;
}

/** Mensagem do banco sem o prefixo técnico (as funções do ponto já devolvem frases prontas). */
export function mensagemBanco(e: { message: string; code?: string } | null | undefined, padrao = "Não foi possível salvar.") {
  if (!e) return padrao;
  if (e.code === "P0001") return e.message;
  if (e.code === "23505") return "Já existe um registro igual.";
  if (e.code === "42501" || /row-level security/i.test(e.message)) return "Você não tem permissão para esta ação.";
  return `${padrao} (${e.message})`;
}
