-- 0128 — Receita do mês na DRE vinda do Trier (pedido do Luiz em 05/11/2026): todo dia 1º o robô de vendas tira o
-- relatório Vendas Produtos do mês anterior (por filial, só vendas, sem o grupo 61 SERVICO, custo gerencial) e grava
-- cada filial como "Vendas de mercadorias" na DRE da empresa dela. A linha fica marcada como manual, então a importação
-- da planilha do contador não passa por cima. Só a linha "vendas" do mês muda; nada mais é apagado.

-- 1) a tabela das buscas do robô passa a aceitar o relatório novo "receita" (os nomes antigos continuam valendo)
alter table public.vendas_coletas drop constraint if exists vendas_coletas_relatorio_check;
alter table public.vendas_coletas add constraint vendas_coletas_relatorio_check
  check (relatorio = any (array['filiais', 'grupos', 'laboratorios', 'vendedores', 'atendimentos', 'tele_entrega', 'ecommerce', 'receita']));

-- 2) gravação da receita na DRE
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

  for v_emp in
    select upper(o.nome_fantasia) as empresa, count(distinct b.id) as filiais, round(sum((x ->> 'valor')::numeric), 2) as total
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
    n := n + v_n;
    v_total := v_total + v_emp.total;
    v_empresas := v_empresas || jsonb_build_object('empresa', v_emp.empresa, 'filiais', v_n, 'total', v_emp.total);
  end loop;

  insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_novo)
  values (auth.uid(), 'editar', 'dre_contabil', null,
          jsonb_build_object('linha', 'vendas', 'origem', 'Trier: Vendas Produtos', 'competencia', p_competencia, 'arquivo', left(p_arquivo, 200),
                             'filiais', n, 'total', v_total, 'empresas', v_empresas));
  return jsonb_build_object('linhas', n, 'total', v_total, 'empresas', v_empresas);
end $function$;

revoke all on function public.dre_receita_trier_gravar(date, jsonb, text) from public, anon;
grant execute on function public.dre_receita_trier_gravar(date, jsonb, text) to authenticated, service_role;
