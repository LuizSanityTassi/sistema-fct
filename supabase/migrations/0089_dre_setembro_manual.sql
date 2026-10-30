-- DRE contábil: setembro/2026 com as contas "amarelas" da planilha lançadas à mão pelo contador (pedido de 30/10/2026).
-- Só setembro e só estas contas: devoluções, comissões, despesas (pessoal, administrativas, comerciais, outras,
-- depreciação) e o financeiro (receita financeira, outras receitas, despesas financeiras). Impostos, CMV, vendas e
-- IR/CSLL continuam vindo da planilha. Os valores de setembro dessas contas são zerados (cópia guardada antes) e a
-- importação da planilha deixa de mexer neles.

-- 1) cópia do que estava lá (para desfazer, se precisar)
create table if not exists public.dre_contabil_bkp_set2026 as
  select * from public.dre_contabil
   where competencia = '2026-09-01'
     and linha in ('devolucoes', 'comissoes', 'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais',
                   'outras_despesas', 'depreciacao', 'receita_financeira', 'outras_receitas', 'despesas_financeiras');
alter table public.dre_contabil_bkp_set2026 enable row level security;

-- 2) conta lançada à mão naquele mês?
create or replace function private.dre_manual(p_competencia date, p_linha text)
 returns boolean
 language sql
 immutable
as $function$
  select p_competencia = date '2026-09-01'
     and p_linha in ('devolucoes', 'comissoes', 'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais',
                     'outras_despesas', 'depreciacao', 'receita_financeira', 'outras_receitas', 'despesas_financeiras');
$function$;
grant execute on function private.dre_manual(date, text) to authenticated;

-- 3) zera setembro nessas contas (todas as empresas e filiais)
update public.dre_contabil set valor = 0 where private.dre_manual(competencia, linha) and valor <> 0;

-- 4) a importação da planilha não apaga nem regrava as contas lançadas à mão
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
   where empresa = p_empresa and competencia = any (p_meses) and not private.dre_manual(competencia, linha);
  insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id)
  select p_empresa, nullif(v ->> 'branch_id', '')::uuid, (v ->> 'competencia')::date, v ->> 'linha', (v ->> 'valor')::numeric, v_id
    from jsonb_array_elements(p_valores) v
   where (v ->> 'competencia')::date = any (p_meses)
     and not private.dre_manual((v ->> 'competencia')::date, v ->> 'linha');
  return v_id;
end;
$function$;

-- 5) o contador lança (ou corrige) os valores à mão: substitui o valor de cada filial × conta do mês
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
  -- o valor digitado fica ligado à importação daquele mês (importacao_id é obrigatório)
  select importacao_id into v_imp from public.dre_contabil where empresa = p_empresa and competencia = p_competencia limit 1;
  if v_imp is null then raise exception 'Importe o mês da planilha antes de lançar à mão.'; end if;
  for v in select nullif(x ->> 'branch_id', '')::uuid as branch_id, x ->> 'linha' as linha, (x ->> 'valor')::numeric as valor
             from jsonb_array_elements(p_valores) x loop
    if not private.dre_manual(p_competencia, v.linha) then
      raise exception 'Só dá para lançar à mão as contas liberadas de setembro/2026.';
    end if;
    delete from public.dre_contabil
     where empresa = p_empresa and competencia = p_competencia and linha = v.linha and branch_id is not distinct from v.branch_id;
    insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id)
    values (p_empresa, v.branch_id, p_competencia, v.linha, round(v.valor, 2), v_imp);
    n := n + 1;
  end loop;
  return n;
end;
$function$;
revoke all on function public.dre_contabil_lancar_manual(text, date, jsonb) from public, anon;
grant execute on function public.dre_contabil_lancar_manual(text, date, jsonb) to authenticated;
