-- 0075 — Soma do a pagar do fluxo de caixa por empresa × dia × grupo (a tela não precisa das filiais).
create function public.fin_fluxo_pagar_somas(p_de date, p_ate date)
returns table (empresa text, data date, grupo text, valor numeric)
language sql stable security invoker set search_path = public as $$
  select p.empresa, p.data, p.grupo, sum(p.valor)::numeric(16, 2)
    from public.fin_fluxo_pagar p
   where p.data between p_de and p_ate
   group by 1, 2, 3
   order by 2, 1, 3;
$$;
revoke execute on function public.fin_fluxo_pagar_somas(date, date) from public, anon;
grant execute on function public.fin_fluxo_pagar_somas(date, date) to authenticated;
