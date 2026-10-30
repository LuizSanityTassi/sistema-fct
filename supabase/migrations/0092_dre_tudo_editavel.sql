-- DRE contábil: tudo digitável (pedido de 30/10/2026: "deixa TUDO editável, não só setembro e não só as amarelas").
-- O valor digitado fica marcado (manual) e a importação da planilha não passa por cima dele. Setembro nas contas que
-- vêm do Omie continua protegido também (private.dre_manual).

alter table public.dre_contabil add column if not exists manual boolean not null default false;

-- digitar: qualquer mês e qualquer conta da DRE; se o mês ainda não foi importado, cria o registro do mês
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
  for v in select nullif(x ->> 'branch_id', '')::uuid as branch_id, x ->> 'linha' as linha, (x ->> 'valor')::numeric as valor
             from jsonb_array_elements(p_valores) x loop
    if v.linha not in ('vendas', 'outras_receitas_brutas', 'devolucoes', 'impostos_vendas', 'comissoes', 'custo_mercadoria', 'ajuste_cmv',
                       'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais', 'outras_despesas', 'depreciacao',
                       'receita_financeira', 'outras_receitas', 'despesas_financeiras', 'ir_csll') then
      raise exception 'Conta da DRE inválida: %', v.linha;
    end if;
    delete from public.dre_contabil
     where empresa = p_empresa and competencia = p_competencia and linha = v.linha and branch_id is not distinct from v.branch_id;
    insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual)
    values (p_empresa, v.branch_id, p_competencia, v.linha, round(v.valor, 2), v_imp, true);
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- importar: não apaga nem regrava o que foi digitado (nem setembro nas contas do Omie)
create or replace function public.dre_contabil_importar(p_empresa text, p_arquivo text, p_meses date[], p_valores jsonb, p_avisos jsonb DEFAULT NULL::jsonb)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_filiais integer;
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador'))) then
    raise exception 'Só Administrador, Financeiro e Contador importam a DRE.';
  end if;
  if coalesce(array_length(p_meses, 1), 0) = 0 then raise exception 'Nenhum mês para importar.'; end if;
  select count(distinct v ->> 'branch_id') into v_filiais from jsonb_array_elements(p_valores) v where v ->> 'branch_id' is not null;
  insert into public.dre_contabil_importacoes (empresa, arquivo, meses, filiais, valores, avisos)
  values (p_empresa, p_arquivo, p_meses, v_filiais, jsonb_array_length(p_valores), p_avisos)
  returning id into v_id;
  delete from public.dre_contabil
   where empresa = p_empresa and competencia = any (p_meses) and not manual and not private.dre_manual(competencia, linha);
  insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id)
  select p_empresa, nullif(v ->> 'branch_id', '')::uuid, (v ->> 'competencia')::date, v ->> 'linha', (v ->> 'valor')::numeric, v_id
    from jsonb_array_elements(p_valores) v
   where (v ->> 'competencia')::date = any (p_meses)
     and not private.dre_manual((v ->> 'competencia')::date, v ->> 'linha')
     and not exists (select 1 from public.dre_contabil m
                      where m.manual and m.empresa = p_empresa and m.competencia = (v ->> 'competencia')::date
                        and m.linha = v ->> 'linha' and m.branch_id is not distinct from nullif(v ->> 'branch_id', '')::uuid);
  return v_id;
end;
$function$;
