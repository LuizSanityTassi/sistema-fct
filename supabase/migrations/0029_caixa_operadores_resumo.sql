-- 0029 — Resumo por operador do Trier (para ligar operador → funcionário): quantos caixas, quantas quebras,
-- em quais filiais e o último dia visto. Visão com security_invoker: respeita a RLS das tabelas (só financeiro/admin).
-- ADITIVA: só cria a visão.
create view public.caixa_operadores_resumo with (security_invoker = true) as
select o.cod_operador,
       o.nome_trier,
       o.employee_id,
       o.vinculado_em,
       o.visto_em,
       count(d.id)::int as caixas,
       (count(d.id) filter (where d.classe = 'quebra'))::int as quebras,
       (count(d.id) filter (where d.classe = 'quebra' and d.employee_id is null))::int as quebras_sem_funcionario,
       coalesce(array_agg(distinct d.branch_id) filter (where d.branch_id is not null), '{}'::uuid[]) as filiais,
       max(d.dia) as ultimo_dia
  from public.caixa_operadores o
  left join public.caixa_diferencas d on d.cod_operador = o.cod_operador
 group by o.cod_operador;
revoke all on public.caixa_operadores_resumo from anon;
grant select on public.caixa_operadores_resumo to authenticated;
