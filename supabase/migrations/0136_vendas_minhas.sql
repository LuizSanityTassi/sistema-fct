-- 10/11/2026 (pedido do comercial): cada vendedor vê única e exclusivamente a própria venda.
-- vendas_vendedor_vinculo liga o código do vendedor no Trier ao funcionário (e, pelo funcionário, ao login dele).
-- O vendedor NÃO ganha acesso às tabelas de vendas: lê só pela função vendas_minhas, que devolve apenas os códigos
-- ligados a ele (sem custo/CMV). O administrador liga os códigos e pode abrir a tela "como o vendedor vê" para conferir.

create table if not exists public.vendas_vendedor_vinculo (
  vendedor_codigo integer primary key,
  employee_id uuid not null references public.employees (id) on delete cascade,
  vendedor_nome text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null
);
comment on table public.vendas_vendedor_vinculo is 'Código do vendedor no Trier → funcionário. Um código pertence a um funcionário só; um funcionário pode ter mais de um código.';
create index if not exists vendas_vendedor_vinculo_employee_idx on public.vendas_vendedor_vinculo (employee_id);

alter table public.vendas_vendedor_vinculo enable row level security;
revoke all on public.vendas_vendedor_vinculo from anon;
grant select, insert, update, delete on public.vendas_vendedor_vinculo to authenticated;
drop policy if exists vvv_sel on public.vendas_vendedor_vinculo;
drop policy if exists vvv_ins on public.vendas_vendedor_vinculo;
drop policy if exists vvv_upd on public.vendas_vendedor_vinculo;
drop policy if exists vvv_del on public.vendas_vendedor_vinculo;
-- vê: o administrador todos; o funcionário só os códigos dele (para o menu saber que ele é vendedor)
create policy vvv_sel on public.vendas_vendedor_vinculo for select to authenticated
  using ((select private.sou_admin()) or employee_id = (select private.meu_employee()));
-- liga e desliga: só o administrador
create policy vvv_ins on public.vendas_vendedor_vinculo for insert to authenticated with check ((select private.sou_admin()));
create policy vvv_upd on public.vendas_vendedor_vinculo for update to authenticated using ((select private.sou_admin())) with check ((select private.sou_admin()));
create policy vvv_del on public.vendas_vendedor_vinculo for delete to authenticated using ((select private.sou_admin()));

-- A venda do vendedor logado no período (por dia e filial), os grupos de produtos do mês de p_ate e a meta desse mês.
-- p_employee: só o administrador passa outro funcionário (para conferir o que o vendedor vê). Venda do televendas sem o
-- e-commerce, como na tela de metas.
create or replace function public.vendas_minhas(p_de date, p_ate date, p_employee uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eu uuid := private.meu_employee();
  v_emp uuid := coalesce(p_employee, v_eu);
  v_cod integer[];
  v_mes date := date_trunc('month', p_ate)::date;
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Período inválido (até 400 dias).' using errcode = '22023';
  end if;
  if v_emp is distinct from v_eu and not private.sou_admin() then
    raise exception 'Só o administrador vê a venda de outro vendedor.' using errcode = '42501';
  end if;
  select coalesce(array_agg(l.vendedor_codigo order by l.vendedor_codigo), '{}') into v_cod
    from public.vendas_vendedor_vinculo l where l.employee_id = v_emp;

  return jsonb_build_object(
    'funcionario', (select e.nome from public.employees e where e.id = v_emp),
    'vendedores', (select coalesce(jsonb_agg(jsonb_build_object('codigo', l.vendedor_codigo, 'nome', l.vendedor_nome) order by l.vendedor_codigo), '[]'::jsonb)
                     from public.vendas_vendedor_vinculo l where l.employee_id = v_emp),
    'dias', (
      select coalesce(jsonb_agg(jsonb_build_object('data', x.data, 'filial', x.codigo, 'loja', x.nome, 'atendimentos', x.atend, 'venda', x.venda,
                                                   'tele_venda', x.tele_venda, 'tele_atendimentos', x.tele_atend) order by x.data, x.codigo), '[]'::jsonb)
        from (
          select d.data, b.codigo, b.nome,
                 sum(d.atendimentos - case when t.vendedor_codigo is not null then coalesce(d.ecom_atendimentos, 0) else 0 end) atend,
                 sum(d.venda - case when t.vendedor_codigo is not null then coalesce(d.ecom_venda, 0) else 0 end) venda,
                 sum(d.tele_venda) tele_venda,
                 sum(d.tele_atendimentos) tele_atend
            from public.vendas_vendedor_dia d
            join public.branches b on b.id = d.branch_id
            left join public.vendas_televendas_vendedores t on t.vendedor_codigo = d.vendedor_codigo
           where d.vendedor_codigo = any (v_cod) and d.data between p_de and p_ate
           group by d.data, b.codigo, b.nome
        ) x),
    'mes', v_mes,
    'grupos', (
      select coalesce(jsonb_agg(jsonb_build_object('grupo', g.grupo_nome, 'quantidade', g.qtd, 'venda', g.venda) order by g.venda desc), '[]'::jsonb)
        from (
          select max(m.grupo_nome) grupo_nome, sum(m.quantidade) qtd, sum(m.venda) venda
            from public.vendas_vendedor_grupo_mes m
           where m.vendedor_codigo = any (v_cod) and m.mes = v_mes
           group by m.grupo_codigo
        ) g),
    'grupos_lido_ate', (select max(m.lido_ate) from public.vendas_vendedor_grupo_mes m where m.vendedor_codigo = any (v_cod) and m.mes = v_mes),
    'meta', (select sum(m.valor) from public.vendas_metas m where m.mes = v_mes and m.alvo = 'vendedor' and m.vendedor_codigo = any (v_cod))
  );
end;
$$;
revoke all on function public.vendas_minhas(date, date, uuid) from public, anon;
grant execute on function public.vendas_minhas(date, date, uuid) to authenticated;
