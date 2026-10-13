# Sistema FCT — Gestão Empresarial Interna

Plataforma interna modular das Farmácias FCT. Hoje cobre **RH** (unidades, funcionários, documentos,
ASO, folha) e **Chamados**, com usuários/permissões e auditoria; a arquitetura está pronta para
financeiro, contábil, conciliação, TI, compras etc. A **unidade (filial)** é a entidade central:
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
`admin` · `rh` · `ti` · `financeiro` · `gerente` · `usuario`

- Papéis corporativos (admin, RH, TI, financeiro) enxergam todas as unidades; gerente e usuário só a
  unidade principal + `user_branch_access`.
- Salários e folha: só admin e RH. Documentos/ASO: lê quem vê o funcionário, escreve admin/RH.
- Chamados de RH: só RH, admin, quem abriu e quem atende. TI não acessa dados de RH.
- O menu (`src/lib/nav.ts`) e `exigirAcesso()` escondem/bloqueiam telas, mas a barreira real é o RLS
  (funções no schema `private`: `sou_admin`, `tem_papel`, `pode_ver_filial`, `pode_ver_employee`,
  `pode_ver_ticket`). Matriz e evidências: `docs/TESTES-PERMISSOES.md` e tela Configurações → Permissões.

## Banco (schema `public`)
`organizations` · `branches` · `departments` · `profiles` · `user_branch_access` · `employees` ·
`employee_salaries` (histórico por vigência) · `employee_documents` · `employee_aso` · `payroll_records` ·
`tickets` · `ticket_comments` · `ticket_attachments` · `ticket_history` · `audit_logs`
Views: `employee_current_salary`, `branch_employee_counts`. Dinheiro em `numeric(14,2)`; exclusão
**lógica**; PKs `uuid`. Migrations versionadas em `supabase/migrations/` (0001–0013).
Storage: bucket privado `documentos` (`funcionarios/<id>/…`, `folha/<id>/…`, `chamados/<id>/…`),
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
  dashboard · filiais · rh/{funcionarios,documentos,aso,folha} · chamados · configuracoes/{usuarios,permissoes,auditoria}
src/app/login, recuperar-senha, auth/*   autenticação
src/app/api/arquivos/     download assinado de arquivos
src/lib/data/*            consultas (server) · src/lib/*/rotulos.ts  rótulos puros (client-safe)
src/lib/rh/calculo-folha.ts   INSS/IRRF/FGTS 2026 (estimativa)
src/lib/auditoria.ts      registro de auditoria (valor anterior/novo, sem dados sensíveis)
```

## Etapas
1. ✅ Arquitetura + banco (migrations + RLS)  2. ✅ Supabase client + Auth  3. ✅ Layout base
4. ✅ Empresas/Filiais  5. ✅ Funcionários  6. ✅ Documentos + ASO  7. ✅ Folha (com cálculo)
8. ✅ Chamados (linha do tempo)  9. ✅ Usuários, permissões e auditoria  10. ✅ Dashboard
11. ✅ Testes de permissão/segurança (`docs/TESTES-PERMISSOES.md`)

Próximas fases: módulo de TI (ativos/acessos), relatórios exportáveis, integração ao portal via SSO,
financeiro/contábil/conciliação.
