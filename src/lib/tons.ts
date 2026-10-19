// Tons semânticos do sistema: a MESMA cor quer dizer a mesma coisa em todas as telas.
//   sucesso  verde    resolvido, abonado, conciliado, ativo
//   atencao  amarelo  esperando alguém, perto do prazo
//   alerta   laranja  atrasado / prioridade alta (entre atenção e perigo)
//   perigo   vermelho crítico, estourado, desconto, falta
//   info     azul     em andamento, informação
//   destaque roxo     etapa intermediária (justificada, aguardando terceiro)
//   neutro   cinza    encerrado, cancelado, sem efeito
// As classes da paleta do Tailwind têm versão escura em globals.css, então valem nos dois temas.

export type Tom = "neutro" | "sucesso" | "atencao" | "alerta" | "perigo" | "info" | "destaque";

/** Selo (borda + fundo + texto). */
export const TOM: Record<Tom, string> = {
  neutro: "border-border bg-muted text-muted-foreground",
  sucesso: "border-emerald-200 bg-emerald-50 text-emerald-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  alerta: "border-orange-200 bg-orange-50 text-orange-800",
  perigo: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  destaque: "border-violet-200 bg-violet-50 text-violet-800",
};

/** Ponto de cor (bolinha do selo, legenda de gráfico). */
export const PONTO: Record<Tom, string> = {
  neutro: "bg-muted-foreground/50",
  sucesso: "bg-emerald-500",
  atencao: "bg-amber-400",
  alerta: "bg-orange-500",
  perigo: "bg-red-600",
  info: "bg-sky-500",
  destaque: "bg-violet-500",
};

/** Só o texto na cor do tom (valores, ícones). */
export const TEXTO: Record<Tom, string> = {
  neutro: "text-muted-foreground",
  sucesso: "text-emerald-700",
  atencao: "text-amber-800",
  alerta: "text-orange-700",
  perigo: "text-red-700",
  info: "text-sky-700",
  destaque: "text-violet-700",
};
