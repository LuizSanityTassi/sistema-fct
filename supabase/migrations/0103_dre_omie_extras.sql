-- Complementos da DRE que o Omie não exporta nos relatórios de pagamentos/recebimentos (categorias com * geradas na
-- baixa: Descontos Obtidos*, Juros Recebidos*, Multas Recebidas*…). O financeiro manda os valores por filial e eles
-- entram aqui; dre_contabil_preencher_omie soma isto aos lançamentos (só na DRE; o Caixa contábil não muda).
-- valor com o sinal da DRE: receita positiva, despesa negativa. A categoria segue o plano (dre_plano_contas).
create table public.dre_omie_extras (
  id uuid primary key default gen_random_uuid(),
  competencia date not null check (extract(day from competencia) = 1),
  branch_id uuid not null references public.branches (id) on delete cascade,
  categoria text not null,
  valor numeric not null,
  origem text,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index dre_omie_extras_comp_idx on public.dre_omie_extras (competencia);

alter table public.dre_omie_extras enable row level security;
create policy doe_sel on public.dre_omie_extras for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy doe_ins on public.dre_omie_extras for insert to authenticated with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy doe_upd on public.dre_omie_extras for update to authenticated using ((select private.sou_admin()) or (select private.tem_papel('financeiro'))) with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy doe_del on public.dre_omie_extras for delete to authenticated using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));

create or replace function public.dre_contabil_preencher_omie(p_competencia date)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  n integer;
  v_terc uuid := (select id from public.branches where codigo = 'TERC' limit 1);
begin
  if auth.uid() is not null and not ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))) then
    raise exception 'Só Administrador, Financeiro e Contador preenchem a DRE.';
  end if;
  if not private.dre_manual(p_competencia, 'despesas_administrativas') then
    raise exception 'Esse mês não está liberado para lançar à mão.';
  end if;
  create temporary table if not exists _dre_omie (empresa text, branch_id uuid, linha text, valor numeric) on commit drop;
  truncate _dre_omie;
  insert into _dre_omie
  select t.empresa, t.branch_id, t.linha, round(sum(t.v), 2)
    from (
      -- lançamentos do Omie (receber +, pagar −)
      select upper(o.nome_fantasia) empresa,
             case when b.regional = 'Terceirizadas' and v_terc is not null then v_terc else b.id end branch_id,
             p.linha,
             case l.tipo when 'receber' then l.valor else -l.valor end v
        from public.fin_lancamentos l
        join public.fin_categorias c on c.id = l.categoria_id
        join public.dre_plano_contas p on p.categoria = lower(c.nome)
        join public.branches b on b.id = l.branch_id
        join public.organizations o on o.id = b.organization_id
       where l.competencia = to_char(p_competencia, 'YYYY-MM')
      union all
      -- complementos (categorias com * que o Omie não exporta), já com o sinal da DRE
      select upper(o.nome_fantasia),
             case when b.regional = 'Terceirizadas' and v_terc is not null then v_terc else b.id end,
             p.linha,
             x.valor
        from public.dre_omie_extras x
        join public.dre_plano_contas p on p.categoria = lower(x.categoria)
        join public.branches b on b.id = x.branch_id
        join public.organizations o on o.id = b.organization_id
       where x.competencia = p_competencia
    ) t
   where t.empresa in (select distinct empresa from public.dre_contabil where competencia = p_competencia)
   group by 1, 2, 3;
  delete from public.dre_contabil d
   where d.competencia = p_competencia
     and d.linha in (select distinct linha from public.dre_plano_contas)
     and d.empresa in (select distinct empresa from _dre_omie);
  insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id)
  select x.empresa, x.branch_id, p_competencia, x.linha, x.valor,
         (select importacao_id from public.dre_contabil i where i.empresa = x.empresa and i.competencia = p_competencia limit 1)
    from _dre_omie x
   where x.valor <> 0;
  get diagnostics n = row_count;
  return n;
end;
$function$;
