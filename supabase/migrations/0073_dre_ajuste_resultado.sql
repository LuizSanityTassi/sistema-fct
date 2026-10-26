-- 0073 — Caixa contábil: ajuste do resultado do mês (linha "RA").
--
-- O resultado do mês é sempre total de receitas − total de saídas. O contador pode somar um ajuste em cima dele, na
-- própria linha do resultado (ex.: +2.928,45 + 241): fica guardado como "RA" e soma na conta — se receitas ou saídas
-- mudarem, o resultado acompanha e o ajuste continua por cima. Ajuste numa filial soma no grupo e em todas.
-- Os resultados digitados antes ("R", que travavam o número) continuam guardados, sem valer.
alter table public.fin_dre_ajustes_linhas drop constraint fin_dre_ajustes_linhas_linha_check;
alter table public.fin_dre_ajustes_linhas add constraint fin_dre_ajustes_linhas_linha_check
  check (linha ~ '^(F\|.+|G\|.+|S|R|RA)$' and length(linha) <= 300);
