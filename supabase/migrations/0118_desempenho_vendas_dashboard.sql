-- Vendas para gerente: a regra chamava private.pode_ver_filial() em cada linha, e a série de 10 meses levava mais de um minuto
-- (o limite é 8 segundos, então a tela dava erro). A lista das filiais agora é calculada uma vez por consulta. Quem vê o quê não
-- muda: filiais_visiveis() é pode_ver_filial() aplicada a cada filial, e branch_id nunca é nulo nestas tabelas.
alter policy vfd_sel on public.vendas_filial_dia
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')) or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[])));
alter policy vgd_sel on public.vendas_grupo_dia
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')) or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[])));
alter policy vld_sel on public.vendas_laboratorio_dia
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')) or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[])));
alter policy vvd_sel on public.vendas_vendedor_dia
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')) or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[])));
alter policy vvgm_sel on public.vendas_vendedor_grupo_mes
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'coordenador')) or ((select private.tem_papel('gerente')) and branch_id = any ((select private.filiais_visiveis())::uuid[])));

-- A mesma troca na função do televendas, que tem a regra escrita nela: só esse trecho muda.
do $$
declare
  v_def text := pg_get_functiondef('public.vendas_tele_por_filial(date, date, text)'::regprocedure);
begin
  if position('private.pode_ver_filial(d.branch_id)' in v_def) = 0 then
    raise exception 'vendas_tele_por_filial mudou: confira antes de trocar';
  end if;
  execute replace(v_def, 'private.pode_ver_filial(d.branch_id)', 'd.branch_id = any ((select private.filiais_visiveis())::uuid[])');
end $$;

-- Dashboard: descobrir as filiais da última conciliação lia 35 mil linhas inteiras.
create index if not exists conc_itens_filiais_idx on public.conc_itens (conciliacao_id, branch_id)
  where branch_id is not null and grupo in ('exato', 'aproximado', 'so_trier');

-- Dashboard: contar as pendências novas por dia trazia 10 mil linhas para o servidor, de mil em mil.
create index if not exists conc_pendencias_criado_idx on public.conc_pendencias (criado_em);

create or replace function public.conc_pendencias_novas(p_de timestamptz) returns table (dia date, qtd bigint)
language sql stable security invoker set search_path = public as $$
  select (criado_em at time zone 'America/Sao_Paulo')::date, count(*)
    from public.conc_pendencias
   where criado_em >= p_de
   group by 1;
$$;
revoke all on function public.conc_pendencias_novas(timestamptz) from public, anon;
grant execute on function public.conc_pendencias_novas(timestamptz) to authenticated;

analyze public.conc_itens;
analyze public.conc_pendencias;
