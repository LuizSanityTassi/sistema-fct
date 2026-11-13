-- Baixa das pendências "só no Trier" que já bateram com boleto (13/11/2026, autorizado pelo Luiz: "então arruma e atualiza").
-- Causa: a pendência "só no Trier" tem a chave do título (TR<filial>-<doc>|<filial>); quando o título passava a bater com um
-- boleto o item ganhava a chave do boleto (DDA…) e a pendência antiga nunca era baixada (corrigido no código em 2c31e01).
-- Critério: o título aparece como EXATO ou APROXIMADO (com boleto) nas conciliações mais recentes de cada faixa (12/11):
-- Varela 1–112, Itajaí 201–205 (robô e Trier da Mega), Nazário 301–504 e Blumenau 501–504 (Trier da Mega).
-- Só pendências "pendente"/"em_analise"; nada é apagado; backup em private.conc_pendencias_bkp_2026_11_13_so_trier.

create table if not exists private.conc_pendencias_bkp_2026_11_13_so_trier as
select * from public.conc_pendencias where false;

drop table if exists _alvo;
create temp table _alvo as
select distinct on (x.k) x.k as chave, x.conciliacao_id
from (
  select 'TR' || (t ->> 'fil') || '-' || (t ->> 'doc') || '|' || (t ->> 'fil') as k, i.conciliacao_id, c.criado_em
  from public.conc_itens i
  join public.conc_conciliacoes c on c.id = i.conciliacao_id
  cross join lateral jsonb_array_elements(i.dados -> 'trier') t
  where i.conciliacao_id in (
    '070161ec-e55b-4e11-b8ab-9bd9d608b3ac', -- Automática · Varela · 12/11
    '8f2e580f-294a-4792-acc0-47c159400ef5', -- Automática · Itajaí · 12/11
    '30dbdba3-fd0f-4564-972f-74f05fcae56f', -- Automática · Nazário · 12/11
    'f13c418e-65b3-4107-a46a-27da3465dbd7', -- Itajaí · Trier da Mega (PDF 12/11)
    'd99708dd-80d8-4023-8304-d8e88cfecdb7'  -- Blumenau · Trier da Mega (PDF 12/11)
  )
    and i.grupo in ('exato', 'aproximado')
) x
join public.conc_pendencias p on p.chave = x.k and p.problema = 'SO_TRIER' and p.status in ('pendente', 'em_analise')
order by x.k, x.criado_em desc;

insert into private.conc_pendencias_bkp_2026_11_13_so_trier
select p.* from public.conc_pendencias p join _alvo a on a.chave = p.chave;

update public.conc_pendencias p
set status = 'resolvido',
    auto = true,
    motivo = 'Conciliou automaticamente',
    decidido_por = null,
    decidido_em = now(),
    regra_id = null,
    visto_em = now(),
    conciliacao_id = a.conciliacao_id,
    historico = coalesce(p.historico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', 'resolvido',
      'quando', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'por', 'sistema',
      'motivo', 'Conciliou automaticamente (o título já batia com boleto; correção de 13/11)'))
from _alvo a
where p.chave = a.chave;
