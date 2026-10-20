-- Retiradas de caixa × depósitos (tela "Pesquisar Retirada de Caixa" da Zanini).
-- As retiradas vêm do Trier (caixa_diferencas: o "informado" do dinheiro de cada caixa é o valor retirado para
-- depósito); o declarado vem das sangrias da loja. Cada "Salvar" da tela grava uma linha aqui: o período pesquisado,
-- os totais da hora, se ficou conferido e o comentário (histórico — não se altera nem se apaga). Não mexe nas
-- sangrias: a conferência de cada depósito continua na Conferência de sangrias (decisão do usuário).
-- Aditiva: só tabela nova.

create table if not exists public.caixa_retirada_conferencias (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references public.branches (id) on delete restrict,
  retirada_de     date not null,
  retirada_ate    date not null,
  deposito_de     date not null,
  deposito_ate    date not null,
  conta_id        uuid references public.fin_contas_bancarias (id) on delete set null,
  total_retirada  numeric(14, 2) not null,
  total_declarado numeric(14, 2) not null,
  -- como na Zanini: retirada − declarado (negativo = a loja declarou mais do que retirou)
  diferenca       numeric(14, 2) generated always as (total_retirada - total_declarado) stored,
  conferido       boolean not null default false,
  comentario      text check (comentario is null or char_length(comentario) <= 1000),
  criado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  constraint caixa_retirada_conf_periodos check (retirada_de <= retirada_ate and deposito_de <= deposito_ate)
);
create index if not exists caixa_retirada_conf_idx on public.caixa_retirada_conferencias (branch_id, criado_em desc);

-- quem salvou e quando vêm do banco (não da tela)
create or replace function private.retirada_conf_carimbar()
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
revoke all on function private.retirada_conf_carimbar() from public, anon;
drop trigger if exists retirada_conf_carimbar on public.caixa_retirada_conferencias;
create trigger retirada_conf_carimbar before insert on public.caixa_retirada_conferencias
  for each row execute function private.retirada_conf_carimbar();

alter table public.caixa_retirada_conferencias enable row level security;
create policy crc_sel on public.caixa_retirada_conferencias for select to authenticated
  using ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
create policy crc_ins on public.caixa_retirada_conferencias for insert to authenticated
  with check ((select private.sou_admin()) or (select private.tem_papel('financeiro')));
