-- DRE: o valor digitado pode ser uma conta ("1.200+350-80"); a conta fica guardada como memória de cálculo.
alter table public.dre_contabil add column if not exists formula text;

create or replace function public.dre_contabil_lancar_manual(p_empresa text, p_competencia date, p_valores jsonb)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v record;
  n integer := 0;
  v_imp uuid;
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))) then
    raise exception 'Só Administrador, Financeiro e Contador lançam a DRE.';
  end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then raise exception 'Mês inválido.'; end if;
  select importacao_id into v_imp from public.dre_contabil where empresa = p_empresa and competencia = p_competencia limit 1;
  if v_imp is null then
    insert into public.dre_contabil_importacoes (empresa, arquivo, meses, filiais, valores, avisos)
    values (p_empresa, 'Digitado no sistema', array[p_competencia], 0, 0, null)
    returning id into v_imp;
  end if;
  for v in select nullif(x ->> 'branch_id', '')::uuid as branch_id, x ->> 'linha' as linha, (x ->> 'valor')::numeric as valor,
                  nullif(left(x ->> 'formula', 500), '') as formula
             from jsonb_array_elements(p_valores) x loop
    if v.linha not in ('vendas', 'outras_receitas_brutas', 'devolucoes', 'impostos_vendas', 'comissoes', 'custo_mercadoria', 'ajuste_cmv',
                       'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais', 'outras_despesas', 'depreciacao',
                       'receita_financeira', 'outras_receitas', 'despesas_financeiras', 'ir_csll') then
      raise exception 'Conta da DRE inválida: %', v.linha;
    end if;
    delete from public.dre_contabil
     where empresa = p_empresa and competencia = p_competencia and linha = v.linha and branch_id is not distinct from v.branch_id;
    insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual, formula)
    values (p_empresa, v.branch_id, p_competencia, v.linha, round(v.valor, 2), v_imp, true, v.formula);
    n := n + 1;
  end loop;
  return n;
end;
$function$;
