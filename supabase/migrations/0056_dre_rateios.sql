-- Rateio por faturamento da DRE (a aba "FAT %" da planilha do contador): um valor da empresa no mês (PIS/COFINS,
-- ICMS, despesa financeira…) é dividido entre as filiais pela participação de cada uma na receita bruta do mês e
-- entra na conta escolhida da DRE de cada filial. O sistema calcula a divisão; aqui fica só o total digitado.
-- valor já com o sinal da DRE (despesa negativa). Aditiva: tabela nova.

create table if not exists public.dre_contabil_rateios (
  id              uuid primary key default gen_random_uuid(),
  empresa         text not null,
  competencia     date not null check (extract(day from competencia) = 1),
  item            text not null check (char_length(item) between 1 and 60),
  linha           text not null check (linha in (
                    'impostos_vendas', 'comissoes', 'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais',
                    'outras_despesas', 'receita_financeira', 'outras_receitas', 'despesas_financeiras', 'ir_csll')),
  valor           numeric(14, 2) not null check (valor <> 0),
  observacao      text check (observacao is null or char_length(observacao) <= 300),
  criado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  constraint dre_rateio_unico unique (empresa, competencia, item)
);

create or replace function private.dre_rateio_carimbar()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  new.criado_por := auth.uid();
  new.criado_por_nome := (select coalesce(nullif(trim(nome), ''), email) from public.profiles where id = auth.uid());
  new.criado_em := now();
  return new;
end;
$$;
revoke all on function private.dre_rateio_carimbar() from public, anon;
drop trigger if exists dre_rateio_carimbar on public.dre_contabil_rateios;
create trigger dre_rateio_carimbar before insert or update on public.dre_contabil_rateios
  for each row execute function private.dre_rateio_carimbar();

alter table public.dre_contabil_rateios enable row level security;
create policy drerat_sel on public.dre_contabil_rateios for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy drerat_ins on public.dre_contabil_rateios for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy drerat_upd on public.dre_contabil_rateios for update to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')))
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
create policy drerat_del on public.dre_contabil_rateios for delete to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro', 'contador')));
