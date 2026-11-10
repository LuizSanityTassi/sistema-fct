-- 0138 — CMV do mês na DRE vindo do Trier (pedido do Luiz em 10/11/2026): o mesmo relatório Vendas Produtos que traz a
-- receita (0128) traz o "Total Vlr. Custo" (custo gerencial) de cada filial. Esse custo vai para a linha "Custo das
-- mercadorias" (custo_mercadoria, negativo, como o contador lança) da DRE da empresa da filial, marcada como manual (a
-- planilha do contador não passa por cima). O "Crédito CMV" (ajuste_cmv) do contador não muda. Mês travado pelo
-- contador continua barrado pelo banco (0134).

create or replace function public.dre_receita_trier_gravar(p_competencia date, p_valores jsonb, p_arquivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_emp record;
  v_imp uuid;
  v_n integer;
  n integer := 0;
  v_total numeric := 0;
  v_custo_total numeric := 0;
  v_com_custo boolean;
  v_empresas jsonb := '[]'::jsonb;
begin
  -- o robô grava com a chave de serviço (sem usuário); pela tela, só administrador e financeiro
  if auth.uid() is not null and not ((select private.sou_admin()) or (select private.tem_papel('financeiro'))) then
    raise exception 'Só Administrador e Financeiro gravam a receita do Trier na DRE.' using errcode = 'P0001';
  end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then
    raise exception 'Mês inválido.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_valores) is distinct from 'array' or jsonb_array_length(p_valores) = 0 then
    raise exception 'Nenhuma filial com receita: nada foi gravado.' using errcode = 'P0001';
  end if;
  -- toda filial precisa existir e ter empresa; se faltar uma, nada é gravado (receita não some em silêncio)
  if exists (select 1
               from jsonb_array_elements(p_valores) x
               left join public.branches b on b.id = nullif(x ->> 'branch_id', '')::uuid
               left join public.organizations o on o.id = b.organization_id
              where o.id is null or x ->> 'valor' is null) then
    raise exception 'Há filial sem cadastro ou sem empresa no relatório: nada foi gravado.' using errcode = 'P0001';
  end if;
  -- custo: ou vem de todas as filiais ou de nenhuma (CMV pela metade não entra)
  v_com_custo := exists (select 1 from jsonb_array_elements(p_valores) x where x ? 'custo');
  if v_com_custo and exists (select 1 from jsonb_array_elements(p_valores) x where jsonb_typeof(x -> 'custo') is distinct from 'number') then
    raise exception 'Há filial sem o custo no relatório: nada foi gravado.' using errcode = 'P0001';
  end if;

  for v_emp in
    select upper(o.nome_fantasia) as empresa, count(distinct b.id) as filiais, round(sum((x ->> 'valor')::numeric), 2) as total,
           round(sum(coalesce((x ->> 'custo')::numeric, 0)), 2) as custo
      from jsonb_array_elements(p_valores) x
      join public.branches b on b.id = (x ->> 'branch_id')::uuid
      join public.organizations o on o.id = b.organization_id
     group by 1
  loop
    select importacao_id into v_imp from public.dre_contabil where empresa = v_emp.empresa and competencia = p_competencia limit 1;
    if v_imp is null then
      insert into public.dre_contabil_importacoes (empresa, arquivo, meses, filiais, valores, avisos)
      values (v_emp.empresa, left(p_arquivo, 200), array[p_competencia], v_emp.filiais, v_emp.filiais, null)
      returning id into v_imp;
    end if;
    delete from public.dre_contabil where empresa = v_emp.empresa and competencia = p_competencia and linha = 'vendas';
    insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual)
    select v_emp.empresa, b.id, p_competencia, 'vendas', round(sum((x ->> 'valor')::numeric), 2), v_imp, true
      from jsonb_array_elements(p_valores) x
      join public.branches b on b.id = (x ->> 'branch_id')::uuid
      join public.organizations o on o.id = b.organization_id
     where upper(o.nome_fantasia) = v_emp.empresa
     group by b.id;
    get diagnostics v_n = row_count;
    if v_com_custo then
      -- custo das mercadorias = custo gerencial do Trier, negativo (despesa), uma linha por filial
      delete from public.dre_contabil where empresa = v_emp.empresa and competencia = p_competencia and linha = 'custo_mercadoria';
      insert into public.dre_contabil (empresa, branch_id, competencia, linha, valor, importacao_id, manual)
      select v_emp.empresa, b.id, p_competencia, 'custo_mercadoria', -round(sum((x ->> 'custo')::numeric), 2), v_imp, true
        from jsonb_array_elements(p_valores) x
        join public.branches b on b.id = (x ->> 'branch_id')::uuid
        join public.organizations o on o.id = b.organization_id
       where upper(o.nome_fantasia) = v_emp.empresa
       group by b.id;
      v_custo_total := v_custo_total + v_emp.custo;
    end if;
    n := n + v_n;
    v_total := v_total + v_emp.total;
    v_empresas := v_empresas || jsonb_build_object('empresa', v_emp.empresa, 'filiais', v_n, 'total', v_emp.total, 'custo', case when v_com_custo then v_emp.custo end);
  end loop;

  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'dre_contabil', null,
          jsonb_build_object('linha', case when v_com_custo then 'vendas + custo_mercadoria' else 'vendas' end, 'origem', 'Trier: Vendas Produtos',
                             'competencia', p_competencia, 'arquivo', left(p_arquivo, 200), 'filiais', n, 'total', v_total,
                             'custo', case when v_com_custo then v_custo_total end, 'empresas', v_empresas));
  return jsonb_build_object('linhas', n, 'total', v_total, 'custo', case when v_com_custo then v_custo_total end, 'empresas', v_empresas);
end $function$;

revoke all on function public.dre_receita_trier_gravar(date, jsonb, text) from public, anon;
grant execute on function public.dre_receita_trier_gravar(date, jsonb, text) to authenticated, service_role;

-- outubro/2026 (o único mês já buscado e não travado): o robô de 10 em 10 minutos relê o Excel guardado e grava a
-- receita (mesmos valores) e agora o CMV
update public.vendas_coletas set lido_em = null
 where relatorio = 'receita' and status = 'ok' and de = '2026-10-01' and ate = '2026-10-31' and arquivo_b64 is not null
   and not exists (select 1 from public.contabil_meses_travados where competencia = '2026-10-01');
