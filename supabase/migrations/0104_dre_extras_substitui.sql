-- Complemento que SUBSTITUI a categoria no mês (pedido de 30/10/2026: "Serviço de Terceiros PJ" de setembro vem
-- rateado por filial numa lista do financeiro, no lugar do que está lançado no Omie). Se houver algum complemento com
-- substitui = true para a categoria no mês, os lançamentos dessa categoria naquele mês são ignorados na DRE.
alter table public.dre_omie_extras add column if not exists substitui boolean not null default false;

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
      -- lançamentos do Omie (receber +, pagar −), menos as categorias substituídas por complemento no mês
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
         and not exists (select 1 from public.dre_omie_extras s where s.competencia = p_competencia and s.substitui and lower(s.categoria) = lower(c.nome))
      union all
      -- complementos (categorias com * que o Omie não exporta, ou rateios que substituem a categoria), com o sinal da DRE
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
