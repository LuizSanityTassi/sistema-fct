-- 0142 — Setembro/2026: categoria Contabilidade da VARELA trocada pela lista do contas a pagar enviada pelo Luiz em
-- 11/11/2026 (o contas a pagar de setembro mudou no Omie). Troca os complementos (dre_omie_extras, substitui o Omie) e
-- acerta a linha Despesas Administrativas da DRE de setembro de cada filial pela diferença (só essa categoria; nada mais
-- do mês é recalculado). Setembro está travado pelo contador: a trava do mês é desligada só nesta transação.
-- F201–F205 entram nos complementos, mas não na DRE (fora da DRE desde a 0141). NAZÁRIO não muda.
begin;

create temporary table _nova (codigo text primary key, valor numeric not null) on commit drop;
insert into _nova (codigo, valor) values
  ('CIRLEI', -937.56), ('ELEGANCE', -312.52), ('F001', -4646.90),
  ('F002', -4021.86), ('F003', -4021.86), ('F004', -4021.86), ('F005', -4021.86), ('F006', -4021.86),
  ('F008', -4021.86), ('F009', -4021.86), ('F010', -4021.86), ('F011', -4021.86), ('F012', -4021.86),
  ('F013', -4021.86), ('F014', -4021.86), ('F015', -4021.86), ('F019', -4021.86), ('F021', -4021.86),
  ('F101', -4021.86), ('F102', -4021.86), ('F103', -4021.86), ('F104', -4021.86), ('F105', -4021.86),
  ('F106', -4021.86), ('F107', -4021.86), ('F108', -4021.86), ('F109', -4021.86), ('F110', -4021.86),
  ('F111', -4021.86), ('F112', -4021.86),
  ('F201', -4021.86), ('F202', -4021.86), ('F203', -4021.86), ('F204', -4021.86), ('F205', -4021.88),
  ('JERIVA', -1000.00), ('ADM', -2071.35), ('RFA', -625.04);

do $$
begin
  if (select count(*) from _nova) <> 38 or (select round(sum(valor), 2) from _nova) <> -138292.91 then
    raise exception 'A lista não bate (38 filiais, -138.292,91): nada foi feito.';
  end if;
  if exists (select 1 from _nova n left join public.branches b on b.codigo = n.codigo
              left join public.organizations o on o.id = b.organization_id
             where o.nome_fantasia is distinct from 'VARELA') then
    raise exception 'Há filial da lista que não é da VARELA: nada foi feito.';
  end if;
end $$;

-- o que estava (para a diferença e para a auditoria)
create temporary table _antes on commit drop as
select x.branch_id, b.codigo, x.valor, x.origem
  from public.dre_omie_extras x
  join public.branches b on b.id = x.branch_id
  join public.organizations o on o.id = b.organization_id
 where x.competencia = date '2026-09-01' and lower(x.categoria) = 'contabilidade' and o.nome_fantasia = 'VARELA';

-- 1) complementos: sai o antigo da VARELA, entra a lista
delete from public.dre_omie_extras x
 using _antes a
 where x.competencia = date '2026-09-01' and lower(x.categoria) = 'contabilidade' and x.branch_id = a.branch_id;

insert into public.dre_omie_extras (competencia, branch_id, categoria, valor, origem, substitui)
select date '2026-09-01', b.id, 'Contabilidade', n.valor,
       'lista do contas a pagar (Contabilidade) enviada pelo Luiz em 11/11/2026; substitui o pivot de 30/10/2026', true
  from _nova n join public.branches b on b.codigo = n.codigo;

-- 2) DRE de setembro: Despesas Administrativas de cada filial muda pela diferença (as terceirizadas — ADM, CIRLEI,
--    ELEGANCE, JERIVA, RFA — ficam juntas na linha da TERC, como no "Preencher pelo Omie")
create temporary table _dif on commit drop as
select x.destino branch_id, round(sum(x.dif), 2) dif
  from (select case when b.regional = 'Terceirizadas' then (select t.id from public.branches t where t.codigo = 'TERC') else b.id end destino,
               n.valor - coalesce((select sum(a.valor) from _antes a where a.branch_id = b.id), 0) dif
          from _nova n
          join public.branches b on b.codigo = n.codigo
         where not exists (select 1 from public.dre_filiais_bloqueadas f where f.branch_id = b.id)) x
 group by x.destino
having round(sum(x.dif), 2) <> 0;

do $$
begin
  if exists (select 1 from _dif d where not exists (
               select 1 from public.dre_contabil c where c.competencia = date '2026-09-01' and c.empresa = 'VARELA'
                  and c.linha = 'despesas_administrativas' and c.branch_id = d.branch_id)) then
    raise exception 'Filial com diferença sem Despesas Administrativas na DRE de setembro: nada foi feito.';
  end if;
end $$;

alter table public.dre_contabil disable trigger t_contabil_trava;

update public.dre_contabil c
   set valor = round(c.valor + d.dif, 2)
  from _dif d
 where c.competencia = date '2026-09-01' and c.empresa = 'VARELA' and c.linha = 'despesas_administrativas'
   and c.branch_id = d.branch_id;

alter table public.dre_contabil enable trigger t_contabil_trava;

insert into public.audit_logs (user_id, acao, entidade, registro_id, valor_anterior, valor_novo)
values (auth.uid(), 'editar', 'dre_omie_extras', null,
        (select jsonb_build_object('competencia', '2026-09', 'categoria', 'Contabilidade', 'empresa', 'VARELA',
                                   'total', round(sum(valor), 2), 'filiais', jsonb_agg(jsonb_build_object('codigo', codigo, 'valor', valor, 'origem', origem) order by codigo))
           from _antes),
        (select jsonb_build_object('competencia', '2026-09', 'categoria', 'Contabilidade', 'empresa', 'VARELA',
                                   'total', round(sum(n.valor), 2),
                                   'dre_despesas_administrativas_diferenca', (select round(sum(dif), 2) from _dif),
                                   'filiais', jsonb_agg(jsonb_build_object('codigo', n.codigo, 'valor', n.valor) order by n.codigo))
           from _nova n));

commit;
