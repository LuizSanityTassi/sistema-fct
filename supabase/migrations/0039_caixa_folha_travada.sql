-- 0039 — Para a importação da planilha POS: quais funcionários já têm quebra de caixa digitada ou importada à mão na
-- folha da competência (origem diferente de 'caixa'). Nesses casos o gatilho não sobrescreve o lançamento do RH, então
-- o valor importado não chega sozinho na folha e o financeiro precisa avisar o RH.
-- O financeiro não lê folha_lancamentos (RLS do RH): a função devolve só QUEM está travado, nunca o valor.
-- ADITIVA: uma função.

create or replace function public.caixa_folha_travada(p_competencia date, p_employees uuid[])
returns table (employee_id uuid, origem text)
language sql
stable
security definer
set search_path = public, private
as $$
  select l.employee_id, l.origem
    from public.folha_lancamentos l
    join public.folha_eventos e on e.id = l.evento_id and e.chave = 'quebra_caixa'
   where (private.sou_admin() or private.tem_papel('financeiro', 'rh'))
     and l.competencia = p_competencia
     and l.employee_id = any (p_employees)
     and l.origem <> 'caixa';
$$;
revoke all on function public.caixa_folha_travada(date, uuid[]) from public, anon;
grant execute on function public.caixa_folha_travada(date, uuid[]) to authenticated;
