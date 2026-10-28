-- Dias do período que têm vendas guardadas (para avisar quando falta dia e o total fica menor).
create or replace function public.vendas_dias(p_de date, p_ate date)
returns setof date
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct v.data from public.vendas_filial_dia v where v.data between p_de and p_ate order by 1;
$$;
revoke all on function public.vendas_dias(date, date) from public, anon;
grant execute on function public.vendas_dias(date, date) to authenticated;
