// A partir de quando a conciliação e a quebra de caixa contam (decisão do Luiz em 05/11/2026): o que é anterior sai das telas, sem
// apagar nada. A parte do contador (DRE, caixa contábil) e as retiradas não usam este corte. O banco tem a mesma data em
// private.operacao_inicio() (migração 0121): mudando aqui, mude lá também.
export const INICIO_OPERACAO = "2026-11-05";

/** Conciliações mais antigas saem da lista. A de 04/11 fica porque tem o que vence daqui em diante e o trabalho de envio ao Omie. */
export const CONCILIACOES_DESDE = "2026-11-04T12:54:00Z";

/** A data mais recente entre a pedida e o início da operação. */
export const desdeOInicio = (dia: string) => (dia < INICIO_OPERACAO ? INICIO_OPERACAO : dia);
