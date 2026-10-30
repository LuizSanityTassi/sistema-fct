-- Vendas do dia (pedido de 30/10/2026: "puxar no dia também e deixar puxando de 10 em 10 min").
-- O robô de hoje (/api/cron/vendas-hoje) busca os relatórios do dia corrente a cada 10 minutos e grava a coleta como
-- PARCIAL: o robô da madrugada não a conta como feita e busca o dia inteiro de novo. De cada relatório do dia fica só
-- a última leitura parcial (as anteriores são apagadas pelo robô).
alter table public.vendas_coletas add column if not exists parcial boolean not null default false;
create index if not exists vendas_coletas_parcial_idx on public.vendas_coletas (ate) where parcial;

-- Hora da última leitura de hoje (relatório por filial): as telas mostram "até hoje, HH:MM". Null = hoje ainda sem leitura.
create or replace function public.vendas_hoje_lido_em()
 returns timestamptz
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select max(c.coletado_em) from public.vendas_coletas c
   where c.parcial and c.relatorio = 'filiais' and c.status in ('ok', 'vazio')
     and c.de = (now() at time zone 'America/Sao_Paulo')::date
$function$;
revoke execute on function public.vendas_hoje_lido_em() from public, anon;
grant execute on function public.vendas_hoje_lido_em() to authenticated;

-- Agendador: o plano Hobby da Vercel só roda cron uma vez por dia, então quem chama a rota a cada 10 min é o banco
-- (pg_cron + pg_net). A senha da rota é gerada aqui: o texto fica só no Vault, a tabela de configuração guarda o hash.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not exists (select 1 from vault.secrets where name = 'vendas_hoje_token') then
    perform vault.create_secret(t, 'vendas_hoje_token', 'senha do robô de vendas de hoje (pg_cron chama /api/cron/vendas-hoje)');
    insert into public.sistema_config (chave, valor)
    values ('vendas_hoje_token', jsonb_build_object('hash', encode(extensions.digest(t, 'sha256'), 'hex')))
    on conflict (chave) do update set valor = excluded.valor;
  end if;
end $$;

-- 7h às 23h50 (Brasília = UTC−3): minutos 0,10,…,50 das 10h às 23h e da 0h às 2h UTC.
select cron.schedule(
  'vendas-hoje',
  '*/10 0-2,10-23 * * *',
  $$select net.http_get(
      url := 'https://portal.farmaciafct.com.br/api/cron/vendas-hoje',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vendas_hoje_token')),
      timeout_milliseconds := 30000
    )$$
);
