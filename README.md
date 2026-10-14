# Sistema FCT — Gestão Empresarial Interna

Plataforma interna modular das Farmácias FCT. Hoje cobre **RH** (unidades, funcionários, documentos,
ASO, folha), **Chamados**, **TI** (fila, acessos, ativos), **Relatórios** e o **Financeiro** (lançamentos,
categorias com molde de DRE, fechamento de mês), com usuários/permissões e auditoria; a arquitetura está
pronta para contábil, conciliação, compras etc. A **unidade (filial)** é a entidade central:
todo módulo referencia o mesmo registro (nada de CNPJ/código solto).

Produção: https://sistema-fct.vercel.app (deploy automático do branch `main`).

## Stack
- **Next.js 16 (App Router) + TypeScript + React 19** — Server Components e Server Actions
- **Supabase**: PostgreSQL + Auth (login por e-mail) + Storage privado, com **RLS** em todas as tabelas
- **Tailwind 4 + shadcn/ui (Base UI)** — visual sóbrio, identidade FCT (vermelho, amarelo, navy)
- **Zod** (validação no servidor) · **Vercel** (deploy) · **GitHub** (código)

## Hierarquia
```
organization (grupo: VARELA, NAZÁRIO) → branch (unidade: F001…, F301…, ADM…) → employees / tickets / …
```

## Papéis e regra de acesso
`admin` · `rh` · `ti` · `financeiro` · `contador` · `gerente` · `usuario`

- Papéis corporativos (admin, RH, TI, financeiro, contador) enxergam todas as unidades; gerente e usuário só a
  unidade principal + `user_branch_access`.
- Financeiro: admin, financeiro e contador lançam/editam/classificam; excluir e fechar mês é admin/financeiro;
  reabrir mês, só admin. Gerente vê os lançamentos das próprias unidades. Mês fechado bloqueia alterações
  (trigger `fin_lancamento_antes`), exceto para admin.
- Salários e folha: só admin e RH. Documentos/ASO: lê quem vê o funcionário, escreve admin/RH.
- Chamados de RH: só RH, admin, quem abriu e quem atende. TI não acessa dados de RH.
- O menu (`src/lib/nav.ts`) e `exigirAcesso()` escondem/bloqueiam telas, mas a barreira real é o RLS
  (funções no schema `private`: `sou_admin`, `tem_papel`, `pode_ver_filial`, `pode_ver_employee`,
  `pode_ver_ticket`). Matriz e evidências: `docs/TESTES-PERMISSOES.md` e tela Configurações → Permissões.

## Banco (schema `public`)
`organizations` · `branches` · `departments` · `profiles` · `user_branch_access` · `employees` ·
`employee_salaries` (histórico por vigência) · `employee_documents` · `employee_aso` · `payroll_records` ·
`tickets` · `ticket_comments` · `ticket_attachments` · `ticket_history` · `it_assets` ·
`fin_categorias` · `fin_lancamentos` · `fin_meses_fechados` · `conc_*` (arquivos, conciliacoes, itens, pendencias,
depara, aprendizado, enviados_omie, config, agentes) · `audit_logs`
Views: `employee_current_salary`, `branch_employee_counts`, `fin_resumo_mensal`, `fin_resumo_categoria`
(todas `security_invoker`). Função `fin_totais()` soma receber/pagar com filtros, respeitando o RLS. Dinheiro em `numeric(14,2)`; exclusão
**lógica**; PKs `uuid`. Migrations versionadas em `supabase/migrations/` (0001–0018).
Storage: buckets privados `conciliacao` (arquivos da conciliação) e `documentos` (`funcionarios/<id>/…`, `folha/<id>/…`, `chamados/<id>/…`),
download sempre por URL assinada de 60 s (`/api/arquivos/[tipo]/[id]`).

## Como rodar
```bash
cp .env.example .env.local   # URL + publishable key do Supabase
npm install
npm run dev                  # http://localhost:3000
npm run build                # type-check completo
```

Variáveis de ambiente:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — públicas (frontend).
- `SUPABASE_SERVICE_ROLE_KEY` — **só no servidor** (Vercel → Environment Variables / `.env.local`),
  usada apenas para convidar usuários por e-mail. Nunca no código, nunca no Git.

Configuração no painel do Supabase: Authentication → URL Configuration com Site URL
`https://sistema-fct.vercel.app` e Redirect URLs `https://sistema-fct.vercel.app/**`,
`http://localhost:3000/**` (necessário para convite e "esqueci minha senha").

## Estrutura
```
src/app/(app)/            área autenticada (layout com menu lateral)
  dashboard · filiais · rh/{funcionarios,documentos,aso,folha} · chamados · ti · relatorios
  financeiro/{lancamentos,categorias} · conciliacao/{arquivos,nova,[id],pendencias,de-para,omie}
  configuracoes/{usuarios,permissoes,auditoria}
src/app/login, recuperar-senha, auth/*   autenticação
src/app/api/arquivos/     download assinado de arquivos
src/lib/data/*            consultas (server) · src/lib/*/rotulos.ts  rótulos puros (client-safe)
src/lib/rh/calculo-folha.ts   INSS/IRRF/FGTS 2026 (estimativa)
src/lib/auditoria.ts      registro de auditoria (valor anterior/novo, sem dados sensíveis)
src/lib/financeiro/*      regras do financeiro: formatos (sem centavos, regra 41), permissões, rótulos
scripts/migrar-financeiro.mjs   importador do fluxo de caixa anterior (roda na sua máquina, com seu login)
```

## Etapas
1. ✅ Arquitetura + banco (migrations + RLS)  2. ✅ Supabase client + Auth  3. ✅ Layout base
4. ✅ Empresas/Filiais  5. ✅ Funcionários  6. ✅ Documentos + ASO  7. ✅ Folha (com cálculo)
8. ✅ Chamados (linha do tempo)  9. ✅ Usuários, permissões e auditoria  10. ✅ Dashboard
11. ✅ Testes de permissão/segurança (`docs/TESTES-PERMISSOES.md`)

Fase 2: ✅ TI (fila, acessos, ativos) · ✅ Relatórios com CSV · ✅ Financeiro F1 (lançamentos, categorias/DRE,
fechamento de mês, visão geral por grupo/mês/unidade, migração do legado). · ✅ Conciliação C1 (arquivos do Itaú e do Trier,
motor de conciliação, pendências, de-para e aprendizado) · ✅ C2 envio ao Omie (planilha e API, desfazer).

Próximas: importador Omie (F2), DRE/contábil com ajustes e saldos (F3), orçamento e caixa diário/mensal (F4),
inadimplência e ranking (F5), alertas/fechamento (F6); depois conciliação DDA (upload CNAB240 primeiro).

## Conciliação DDA Itaú × Trier (módulo Conciliação)

Substitui o site `conciliacao.farmaciafct.com.br` (PHP). O **motor** (`src/lib/conciliacao/motor.js`) é o mesmo da
ferramenta em produção, portado como módulo ES; os **leitores** (`leitores.ts`) rodam no servidor: `.RET` CNAB 240,
planilha "Boletos Recebidos" do portal Itaú (SheetJS) e relatório "Contas a Pagar ou Pagas" do Trier em PDF
(pdf.js, página girada) ou XLS. Arquivos ficam no bucket privado `conciliacao` (`arquivos/<sha256>.<ext>`, sem duplicar);
cada rodada grava `conc_conciliacoes` + `conc_itens` (uma linha por conta: boleto com os títulos que casaram, ou título só
do Trier), registra/resolve `conc_pendencias` (chave = `Omie.chave()`: boleto+filial pagadora ou título do Trier) e
aprende fornecedor ↔ raiz de CNPJ em `conc_aprendizado`. De-para do financeiro em `conc_depara` (seed na migração 0018).
Regras: a filial PAGADORA do boleto manda; AGRUPADO/COMBINAÇÃO contam como exatos; só vale desconto pagando no vencimento.

**Envio ao Omie** (aba "Enviar ao Omie" da conciliação + tela Conciliação → Omie): seleção por grupo (exatos pré-marcados,
já enviados ficam de fora), validação 🟢/🟡/🔴 (já enviada, sem departamento, alerta, duplicidade, pendência justificada),
**planilha** no modelo oficial v1.1.5 (`omie-modelo.ts` + JSZip, guardada em `conc_arquivos` tipo `omie`) ou **API**
(`omie-api.ts`: UpsertContaPagar, fornecedor por CNPJ com cadastro automático, departamento por nome/prefixo da filial,
2 empresas — filial ≥ 300 e TRIO = Nazário, < 300 = Varela; modo teste lança 1 conta até "liberar lote"). Chaves só em
`OMIE_NAZARIO_APP_KEY/SECRET` e `OMIE_VARELA_APP_KEY/SECRET` (env). Tudo que vai registra `conc_enviados_omie` (chave da conta),
resolve a pendência e pode ser desfeito com motivo (reabre pendências). Regra do financeiro: emissão/registro/vencimento/previsão
= vencimento do boleto; categoria e conta padrão em `conc_config` ("omie").
Próximo: robô do Trier, agente dos .RET do Itaú, painel por fornecedor/anomalias.

## Migração do financeiro anterior (fluxo de caixa SQLite)

O histórico (lançamentos realizados, categorias e classificação DRE/financeira) é importado por
`scripts/migrar-financeiro.mjs`, executado **na sua máquina** com o **seu login de administrador** — a
`service_role` nunca entra em cena e nenhum dado real vai para o Git. Precisa de Node 22.13+ (usa `node:sqlite`).

```powershell
# na pasta do projeto, com .env.local preenchido
$env:FCT_EMAIL = "seu-email@..."            # a senha é pedida no terminal (sem eco)
node scripts/migrar-financeiro.mjs --db "C:\caminholuxo-caixa-TESTEackend\dataluxo-caixa.db"
# revise o plano impresso (unidades novas, categorias, totais) e então:
node scripts/migrar-financeiro.mjs --db "C:\caminho\...luxo-caixa.db" --confirmar
```

O que o script faz: casa cada filial do legado com a unidade pelo CNPJ (ou código), cria as que não
existem (ex.: F007/F017/F018 inativas, F202–F205, F501–F503, TELEVENDAS, TERCEIRIZADAS), faz upsert das
categorias com `seed-dre.json`/`seed-financeiro.json`, insere os lançamentos com `legado_id` (reexecutar
não duplica) e grava auditoria. Lançamentos com observação "Importado do Omie" ficam com origem `omie`;
os demais, `migracao`.
