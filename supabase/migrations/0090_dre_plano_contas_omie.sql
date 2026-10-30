-- DRE contábil: plano de contas "categoria do Omie → conta amarela da DRE" (planilha "Plano de Contas DRE", 30/10/2026)
-- e o preenchimento de setembro/2026 a partir dos lançamentos do Omie que já estão no sistema (fin_lancamentos, por
-- filial, pela data do pagamento). Receber soma, pagar subtrai. Itajaí entra na Varela e Blumenau na Nazário (pela
-- empresa do cadastro da filial); as terceirizadas (regional "Terceirizadas") vão para a filial TERC. Comissões e
-- depreciação não têm categoria: continuam digitadas à mão. As categorias com * da planilha (juros/multas/descontos
-- da baixa) não existem no sistema e ficam de fora.

create table if not exists public.dre_plano_contas (
  categoria text primary key, -- nome da categoria no Omie (minúsculo, sem *)
  linha text not null check (linha in ('devolucoes', 'outras_receitas', 'receita_financeira', 'despesas_pessoal', 'despesas_administrativas',
                                       'despesas_comerciais', 'outras_despesas', 'despesas_financeiras'))
);
alter table public.dre_plano_contas enable row level security;
drop policy if exists dpc_sel on public.dre_plano_contas;
create policy dpc_sel on public.dre_plano_contas for select using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));

insert into public.dre_plano_contas (categoria, linha)
select lower(c), l from (values
  ('Desconto PV', 'devolucoes'),
  ('Devolução Cheque', 'devolucoes'),
  ('Devolução de Pix', 'devolucoes'),
  ('Depósito Indevido ou desconhecido', 'outras_receitas'),
  ('Estorno Fornecedor', 'outras_receitas'),
  ('Outras Receitas', 'outras_receitas'),
  ('Recebimento de Empréstimos', 'outras_receitas'),
  ('Repasses', 'outras_receitas'),
  ('Bônus Relacionamento Bancos', 'receita_financeira'),
  ('Descontos Obtidos', 'receita_financeira'),
  ('Dividendos Recebidos', 'receita_financeira'),
  ('Juros Recebidos', 'receita_financeira'),
  ('Multas Recebidas', 'receita_financeira'),
  ('Rendimento Aplicações', 'receita_financeira'),
  ('Cesta Básica', 'despesas_pessoal'),
  ('Compras para Copa (mercado)', 'despesas_pessoal'),
  ('Cursos e Palestras', 'despesas_pessoal'),
  ('Despesa com Alimentação', 'despesas_pessoal'),
  ('Eventos e Reuniões', 'despesas_pessoal'),
  ('Medicina do Trabalho', 'despesas_pessoal'),
  ('Plano de Saúde', 'despesas_pessoal'),
  ('Pró Labore', 'despesas_pessoal'),
  ('Reembolso Funcionarios', 'despesas_pessoal'),
  ('Seguro de Vida', 'despesas_pessoal'),
  ('Serviço de Terceiros PJ', 'despesas_pessoal'),
  ('Uniformes', 'despesas_pessoal'),
  ('Vale Transporte', 'despesas_pessoal'),
  ('Advogados', 'despesas_administrativas'),
  ('Água e Esgoto', 'despesas_administrativas'),
  ('Aluguel', 'despesas_administrativas'),
  ('Bens de Pequeno Valor', 'despesas_administrativas'),
  ('Cartão de Crédito', 'despesas_administrativas'),
  ('Cheque Caução', 'despesas_administrativas'),
  ('Coleta de Resíduos', 'despesas_administrativas'),
  ('Combustivel', 'despesas_administrativas'),
  ('Condomínio', 'despesas_administrativas'),
  ('Contabilidade', 'despesas_administrativas'),
  ('Dedetização', 'despesas_administrativas'),
  ('Desp. com Internet', 'despesas_administrativas'),
  ('Desp. com Sistema', 'despesas_administrativas'),
  ('Energia Elétrica', 'despesas_administrativas'),
  ('Gastos com Lojas', 'despesas_administrativas'),
  ('Gráficas e Impressões', 'despesas_administrativas'),
  ('Locação de Veículos', 'despesas_administrativas'),
  ('Manutenção de Veículos', 'despesas_administrativas'),
  ('Manutenção Extra', 'despesas_administrativas'),
  ('Martins Incorporadora Serviços', 'despesas_administrativas'),
  ('Material de Escritório', 'despesas_administrativas'),
  ('Material de Limpeza e Higiene', 'despesas_administrativas'),
  ('Material de Uso e Consumo', 'despesas_administrativas'),
  ('Material e Assistência com informática', 'despesas_administrativas'),
  ('Material e Serviço Elétrico', 'despesas_administrativas'),
  ('Material e Serviço p/ Climatização', 'despesas_administrativas'),
  ('Material e Serviço p/ Obras e Reformas', 'despesas_administrativas'),
  ('Mensalidade Ciee', 'despesas_administrativas'),
  ('Mensalidades Associações', 'despesas_administrativas'),
  ('NJ Escritório Serviços RT', 'despesas_administrativas'),
  ('Outras Despesas', 'despesas_administrativas'),
  ('Pagamento Rescisório Contratos', 'despesas_administrativas'),
  ('Pagamentos Indevidos ou Desconhecidos', 'despesas_administrativas'),
  ('Segurança e Vigilância', 'despesas_administrativas'),
  ('Seguro de Veículos', 'despesas_administrativas'),
  ('Telefonia', 'despesas_administrativas'),
  ('Terceiros Manutenção', 'despesas_administrativas'),
  ('Encargo Conta Garantida', 'despesas_financeiras'),
  ('Fundo de Troco (Lojas)', 'despesas_financeiras'),
  ('IOF', 'despesas_financeiras'),
  ('IOF Antecipação', 'despesas_financeiras'),
  ('IOF Cheque Especial', 'despesas_financeiras'),
  ('IOF Conta Garantida', 'despesas_financeiras'),
  ('Juros Antecipação', 'despesas_financeiras'),
  ('Juros Cheque Especial', 'despesas_financeiras'),
  ('Juros Conta Garantida', 'despesas_financeiras'),
  ('Juros de Mora', 'despesas_financeiras'),
  ('Juros de Parcelamentos', 'despesas_financeiras'),
  ('Juros Pagos', 'despesas_financeiras'),
  ('Multas Pagas', 'despesas_financeiras'),
  ('Pagamento FGI', 'despesas_financeiras'),
  ('Tarifa boleto bancário', 'despesas_financeiras'),
  ('Tarifas Bancárias', 'despesas_financeiras'),
  ('Tarifas e Encargos Pix', 'despesas_financeiras'),
  ('Bonificações', 'despesas_comerciais'),
  ('Despesa com Taxi / Uber', 'despesas_comerciais'),
  ('Despesas com Hospedagem', 'despesas_comerciais'),
  ('Estacionamento', 'despesas_comerciais'),
  ('Fretes Motoboy', 'despesas_comerciais'),
  ('Inserção Rádio', 'despesas_comerciais'),
  ('Marketing', 'despesas_comerciais'),
  ('Permultas', 'despesas_comerciais'),
  ('Alvará', 'outras_despesas'),
  ('CRF', 'outras_despesas'),
  ('Impostos Terceirizados', 'outras_despesas'),
  ('IPTU', 'outras_despesas'),
  ('Simples Nacional (DAS)', 'outras_despesas'),
  ('Taxas Diversas', 'outras_despesas'),
  ('Taxas Tribunal de Justiça', 'outras_despesas')
) v(c, l)
on conflict (categoria) do update set linha = excluded.linha;

-- preenche as contas do plano no mês (só meses liberados para lançar à mão) a partir do Omie
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
  select upper(o.nome_fantasia),
         case when b.regional = 'Terceirizadas' and v_terc is not null then v_terc else b.id end,
         p.linha,
         round(sum(case l.tipo when 'receber' then l.valor else -l.valor end), 2)
    from public.fin_lancamentos l
    join public.fin_categorias c on c.id = l.categoria_id
    join public.dre_plano_contas p on p.categoria = lower(c.nome)
    join public.branches b on b.id = l.branch_id
    join public.organizations o on o.id = b.organization_id
   where l.competencia = to_char(p_competencia, 'YYYY-MM')
     and upper(o.nome_fantasia) in (select distinct empresa from public.dre_contabil where competencia = p_competencia)
   group by 1, 2, 3;
  -- troca as contas do plano no mês (comissões e depreciação ficam como estão)
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
revoke all on function public.dre_contabil_preencher_omie(date) from public, anon;
grant execute on function public.dre_contabil_preencher_omie(date) to authenticated;

select public.dre_contabil_preencher_omie(date '2026-09-01');
