-- 0076 — Fluxo de caixa: a pagar por categoria do Omie e o "lugar" de cada categoria no relatório, como a coordenação
-- financeira organiza (não o molde do contador): custo da mercadoria, DESPESAS FIXAS e DESPESAS VARIÁVEIS (cada uma com
-- seus grupos), despesas financeiras, outras despesas, pagamento de empréstimos e investimento.
--
-- Regra de cada conta a pagar, da mais específica para a mais geral:
--   1. grupo + categoria do Omie;   2. só a categoria (grupo = '');   3. o grupo inteiro (categoria = '');
--   sem regra = "não classificada" (a tela avisa e deixa escolher o lugar).
-- A filial sai do a pagar (a tela não usa e a soma por categoria fica bem menor). A tabela ainda está vazia.

alter table public.fin_fluxo_pagar drop column filial;
alter table public.fin_fluxo_pagar add column categoria text not null default '' check (length(categoria) <= 120);

create or replace function public.fin_fluxo_importar_pagar(p_empresa text, p_arquivo text, p_gerado text, p_linhas jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_de date;
  v_ate date;
  v_n int;
  v_total numeric;
begin
  if not (select private.fluxo_pode_editar()) then
    raise exception 'Sem permissão para importar o a pagar.';
  end if;
  select min((l->>'data')::date), max((l->>'data')::date), count(*), coalesce(sum((l->>'valor')::numeric), 0)
    into v_de, v_ate, v_n, v_total
    from jsonb_array_elements(p_linhas) l;
  if v_n = 0 then
    raise exception 'O relatório não tem contas a pagar dessa empresa.';
  end if;
  insert into public.fin_fluxo_pagar_importacoes (empresa, arquivo, gerado, de, ate, linhas, total, criado_por)
    values (p_empresa, left(p_arquivo, 200), left(p_gerado, 200), v_de, v_ate, v_n, v_total, auth.uid())
    returning id into v_id;
  delete from public.fin_fluxo_pagar where empresa = p_empresa and data between v_de and v_ate;
  insert into public.fin_fluxo_pagar (importacao_id, empresa, data, grupo, categoria, valor)
    select v_id, p_empresa, (l->>'data')::date, left(coalesce(l->>'grupo', ''), 120), left(coalesce(l->>'categoria', ''), 120), (l->>'valor')::numeric
      from jsonb_array_elements(p_linhas) l;
  return v_id;
end;
$$;

drop function public.fin_fluxo_pagar_somas(date, date);
create function public.fin_fluxo_pagar_somas(p_de date, p_ate date)
returns table (empresa text, data date, grupo text, categoria text, valor numeric)
language sql stable security invoker set search_path = public as $$
  select p.empresa, p.data, p.grupo, p.categoria, sum(p.valor)::numeric(16, 2)
    from public.fin_fluxo_pagar p
   where p.data between p_de and p_ate
   group by 1, 2, 3, 4
   order by 2, 1, 3, 4;
$$;
revoke execute on function public.fin_fluxo_pagar_somas(date, date) from public, anon;
grant execute on function public.fin_fluxo_pagar_somas(date, date) to authenticated;

-- lugar = 'CUSTO DA MERCADORIA', 'DESPESAS FIXAS|Despesas Administrativas'… (lista em src/lib/fluxo-caixa/classes.ts)
create table public.fin_fluxo_classes (
  grupo          text not null default '' check (length(grupo) <= 120),
  categoria      text not null default '' check (length(categoria) <= 120),
  lugar          text not null check (length(lugar) <= 120),
  ordem          int not null default 1000,
  atualizado_por uuid references public.profiles(id),
  atualizado_em  timestamptz not null default now(),
  primary key (grupo, categoria),
  check (grupo <> '' or categoria <> '')
);

alter table public.fin_fluxo_classes enable row level security;
create policy ffcl_sel on public.fin_fluxo_classes for select to authenticated using ((select private.fluxo_pode_ver()));
create policy ffcl_ins on public.fin_fluxo_classes for insert to authenticated with check ((select private.fluxo_pode_editar()));
create policy ffcl_upd on public.fin_fluxo_classes for update to authenticated using ((select private.fluxo_pode_editar())) with check ((select private.fluxo_pode_editar()));
create policy ffcl_del on public.fin_fluxo_classes for delete to authenticated using ((select private.fluxo_pode_editar()));
