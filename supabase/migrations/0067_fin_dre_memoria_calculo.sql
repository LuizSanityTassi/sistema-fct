-- Caixa contábil:
-- 1) as linhas de total (família/grupo) voltaram a ser só soma (pedido do contador: são resultado, não se digitam) —
--    fin_dre_ajustes_linhas (0066) sai; só é apagada se estiver vazia.
-- 2) memória de cálculo: a conta digitada na célula (ex.: "348300+200-100") fica guardada junto do valor.

do $$
begin
  if exists (select 1 from public.fin_dre_ajustes_linhas) then
    raise exception 'fin_dre_ajustes_linhas tem linhas digitadas; não apago.';
  end if;
end $$;
drop table public.fin_dre_ajustes_linhas;

alter table public.fin_dre_ajustes add column formula text check (formula is null or length(formula) <= 500);
alter table public.fin_dre_saldos  add column formula text check (formula is null or length(formula) <= 500);
comment on column public.fin_dre_ajustes.formula is 'Memória de cálculo digitada (ex.: 348300+200-100); valor = resultado da conta.';
comment on column public.fin_dre_saldos.formula  is 'Memória de cálculo digitada (ex.: -277420,20+1500); valor = resultado da conta.';
