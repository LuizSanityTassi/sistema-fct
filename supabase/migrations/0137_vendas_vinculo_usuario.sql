-- 10/11/2026: o código do vendedor no Trier também pode ser ligado direto a um USUÁRIO do portal (sem ficha de funcionário
-- no RH), como o usuário "Artur" do comercial interno, dono do código 56562 do televendas (pedido do Luiz).
-- Cada vínculo aponta para um funcionário OU para um usuário, nunca os dois.

alter table public.vendas_vendedor_vinculo alter column employee_id drop not null;
alter table public.vendas_vendedor_vinculo add column if not exists profile_id uuid references public.profiles (id) on delete cascade;
alter table public.vendas_vendedor_vinculo drop constraint if exists vendas_vendedor_vinculo_dono_check;
alter table public.vendas_vendedor_vinculo add constraint vendas_vendedor_vinculo_dono_check check (num_nonnulls(employee_id, profile_id) = 1);
create index if not exists vendas_vendedor_vinculo_profile_idx on public.vendas_vendedor_vinculo (profile_id);
comment on table public.vendas_vendedor_vinculo is 'Código do vendedor no Trier → funcionário (employee_id) ou usuário do portal sem ficha no RH (profile_id). Um código pertence a uma pessoa só; uma pessoa pode ter mais de um código.';

-- o vendedor vê os códigos dele (pelo funcionário ou pelo próprio login)
drop policy if exists vvv_sel on public.vendas_vendedor_vinculo;
create policy vvv_sel on public.vendas_vendedor_vinculo for select to authenticated
  using ((select private.sou_admin()) or employee_id = (select private.meu_employee()) or profile_id = (select auth.uid()));

-- vendas_minhas ganha p_profile (o administrador confere o que um usuário vê); a versão antiga sai
drop function if exists public.vendas_minhas(date, date, uuid);
create or replace function public.vendas_minhas(p_de date, p_ate date, p_employee uuid default null, p_profile uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eu_emp uuid := private.meu_employee();
  v_eu uuid := auth.uid();
  v_emp uuid;
  v_prof uuid;
  v_cod integer[];
  v_mes date := date_trunc('month', p_ate)::date;
begin
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Período inválido (até 400 dias).' using errcode = '22023';
  end if;
  if p_employee is null and p_profile is null then
    -- eu mesmo: pela ficha de funcionário e pelo login
    v_emp := v_eu_emp;
    v_prof := v_eu;
  else
    -- outra pessoa: só o administrador (conferir o que o vendedor vê)
    if not private.sou_admin() and not (p_employee is not distinct from v_eu_emp and p_profile is null) and not (p_profile is not distinct from v_eu and p_employee is null) then
      raise exception 'Só o administrador vê a venda de outro vendedor.' using errcode = '42501';
    end if;
    v_emp := p_employee;
    v_prof := p_profile;
  end if;
  select coalesce(array_agg(l.vendedor_codigo order by l.vendedor_codigo), '{}') into v_cod
    from public.vendas_vendedor_vinculo l
   where (v_emp is not null and l.employee_id = v_emp) or (v_prof is not null and l.profile_id = v_prof);

  return jsonb_build_object(
    'funcionario', coalesce((select e.nome from public.employees e where e.id = v_emp), (select p.nome from public.profiles p where p.id = v_prof)),
    'vendedores', (select coalesce(jsonb_agg(jsonb_build_object('codigo', l.vendedor_codigo, 'nome', l.vendedor_nome) order by l.vendedor_codigo), '[]'::jsonb)
                     from public.vendas_vendedor_vinculo l where l.vendedor_codigo = any (v_cod)),
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
revoke all on function public.vendas_minhas(date, date, uuid, uuid) from public, anon;
grant execute on function public.vendas_minhas(date, date, uuid, uuid) to authenticated;

-- pedido do Luiz (10/11/2026): o código 56562 (ARTUR, televendas) é do usuário "Artur" do comercial interno, não do
-- funcionário ARTHUR VINICIUS TEIXEIRA SOARES, a quem a sugestão tinha ligado.
update public.vendas_vendedor_vinculo
   set employee_id = null, profile_id = '3e86f1da-5af9-40ac-9a5b-6693889dc1cc'
 where vendedor_codigo = 56562
   and exists (select 1 from public.profiles where id = '3e86f1da-5af9-40ac-9a5b-6693889dc1cc');
