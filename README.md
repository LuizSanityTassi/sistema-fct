# Sistema FCT — Gestão Empresarial Interna

Plataforma interna modular das Farmácias FCT. Hoje cobre **RH** (unidades, funcionários, documentos,
ASO, folha), **Chamados**, **TI** (fila, acessos, ativos), **Relatórios** e o **Financeiro** (lançamentos,
categorias com molde de DRE, fechamento de mês), com usuários/permissões e auditoria; a arquitetura está
pronta para contábil, conciliação, compras etc. A **unidade (filial)** é a entidade central:
todo módulo referencia o mesmo registro (nada de CNPJ/código solto).

Produção: https://portal.farmaciafct.com.br (deploy automático do branch `main` na Vercel; o endereço
https://sistema-fct.vercel.app continua funcionando). DNS: registro A `portal` → `216.198.79.1` no Zone Editor
do cPanel da hospedagem (o subdomínio também existe no cPanel, mas não é usado).

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
depara, aprendizado, enviados_omie, config, agentes) · `folha_*` (eventos, empresas_dominio, lancamentos, observacoes) · `audit_logs`
Views: `employee_current_salary`, `branch_employee_counts`, `fin_resumo_mensal`, `fin_resumo_categoria`
(todas `security_invoker`). Função `fin_totais()` soma receber/pagar com filtros, respeitando o RLS. Dinheiro em `numeric(14,2)`; exclusão
**lógica**; PKs `uuid`. Migrations versionadas em `supabase/migrations/` (0001–0024).
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
`https://portal.farmaciafct.com.br` e Redirect URLs `https://portal.farmaciafct.com.br/**`,
`https://sistema-fct.vercel.app/**`, `http://localhost:3000/**` (necessário para convite e "esqueci minha senha").
Os links dos e-mails usam o endereço por onde a pessoa acessou (cabeçalho `x-forwarded-host`).

## Estrutura
```
src/app/(app)/            área autenticada (layout com menu lateral)
  dashboard · filiais · rh/{funcionarios,documentos,aso,folha} · chamados · ti · relatorios
  financeiro/{lancamentos,categorias,importar,dre,orcamento,caixa,analise,migrar} · conciliacao/{arquivos,nova,[id],pendencias,de-para,omie,fornecedores,robos}
  api/conciliacao/{arquivo/[id],agente}   download assinado de arquivo · endpoint do agente dos .RET (chave X-Agente)
  public/agente-itau/                     scripts PowerShell do agente (instalar, agente, desinstalar, LEIA-ME)
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

Fase 3 (financeiro completo): ✅ F2 importador do Omie · ✅ F3 DRE com ajustes do contador e saldos de caixa ·
✅ F4 orçamento e caixa (diário, mensal, semanal) · ✅ F5 inadimplência, ranking, resumo por loja e comparativo ·
✅ F6 alertas na visão geral · ✅ migração do sistema anterior também pela tela (`/financeiro/migrar`, admin).
Conciliação: ✅ C3 robô do Trier + agente dos .RET do Itaú · ✅ C4 ficha por fornecedor e detecção de anomalias.
RH: ✅ lançamentos da folha para a contabilidade (grade do mês, importação da planilha do RH, planilha da Domínio por CNPJ).
Pendente do lado da operação: definir as variáveis de ambiente (Omie, Trier, service_role) na Vercel, rodar a migração do
financeiro antigo e instalar o agente no PC do Itaú Mailbox.

## Lançamentos da folha para a contabilidade (RH → Lançamentos da folha)

O RH lança durante o mês os eventos variáveis de cada funcionário (horas extras 50/60/75/100%, horas noturnas, feriado,
domingo, comissões, faltas parciais, adiantamento, farmácia, quebra de caixa, VT, consignado, outros) numa grade por
filial, e no fechamento baixa a planilha **RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO** que a contabilidade importa na
Domínio: um `.xls` (Excel 97-2003) por CNPJ, nome "<nº da filial no CNPJ> <MÊS>.xls" (30.598.529/**0032**-16 → `32 SETEMBRO.xls`),
ou um `.zip` com todos (`/api/folha-lancamentos/planilha`). Layout copiado do modelo de 09/2026: cabeçalho em A3..C6
(código da empresa, razão social, CNPJ, competência mm/yyyy), nomes dos eventos na linha 9, códigos na linha 10, dados a
partir da linha 11 (A = 11 tipo de cálculo, B = matrícula 00000, C = nome, D = função, valores 0.00), 40 linhas no mínimo,
"S" e a linha TOTAL. A biblioteca não grava fórmulas em .xls: o TOTAL sai somado (o modelo somava a partir da linha 12).

- O arquivo é separado pelo **CNPJ de registro** do funcionário (`employees.branch_id`), que é como a contabilidade separa.
- Eventos e códigos da Domínio em `folha_eventos` (tela Configurar). "Horas Extras 75%" ainda não tem código: é
  gravado, mas só vai para a planilha quando o código for informado.
- Código da empresa na Domínio e razão social da planilha por CNPJ em `folha_empresas_dominio` (só a /0032 = 801 é
  conhecida; CNPJ sem código não gera arquivo e aparece no LEIA-ME do .zip).
- **Importar planilha do RH** (transição): lê do .xlsx do Google só as abas do mês ("VARELA 092026", "QC Varela 092026"),
  entende "9,58 100" / "19,32 adc", recupera células que o Sheets virou data ("12.03 60" → 12/03/1960 → 12,03) e marca
  para conferência; falta "sim" e reembolsos viram observação pendente; **farmacêutico não tem quebra de caixa** (a grade
  bloqueia a célula, a gravação recusa, a importação ignora e a planilha nunca leva). Casa pelo nome (exato, sem "de/da/dos", ou até 2 letras de diferença com o mesmo primeiro nome); o CPF
  da aba de quebra não é lido. Valores existentes que não estão na planilha não são apagados.
- Acesso: admin e RH (RLS nas 4 tabelas). Auditoria registra gravação, importação e exportação só com contagens.

## Integrações (Configurações → Integrações, só admin)

Tudo que precisa de chave ou senha é cadastrado **pela tela**, não por variável de ambiente: usuário/senha do robô do
Trier e app_key/app_secret da Omie (Nazário e Varela). Os valores vão para o **Supabase Vault** (criptografado) pelas
funções `integracao_salvar_segredo` / `integracao_ler_segredos` / `integracao_status_segredos` (migração 0023, security
definer: admin grava; admin e financeiro leem; a tela recebe só "configurado" e o final da chave). "Salvar e testar" já
faz o login no Trier ou busca os cadastros na Omie. Variáveis `TRIER_*` / `OMIE_*` continuam valendo como alternativa
(`src/lib/integracoes/segredos.ts` resolve: tela primeiro, ambiente depois). A única exceção é a
`SUPABASE_SERVICE_ROLE_KEY` (Vercel), usada pelo agente dos .RET e pelo convite formal por e-mail — sem ela o convite
cai no modo "conta + e-mail de confirmação" (signUp com a chave pública) e o agente fica desligado.

## Financeiro (módulo Financeiro)

Reproduz o fluxo de caixa anterior dentro do sistema, com RLS e auditoria. Valores sempre **sem centavos** (regra 41).
- **Lançamentos / Categorias / Visão geral** (F1): por grupo financeiro (VARELA = Varela + Itajaí; NAZÁRIO = Nazário + Blumenau),
  mês e unidade; fechamento de mês bloqueia lançamentos (trigger) — reabrir é só admin.
- **Importar do Omie** (F2, `/financeiro/importar`): lê o relatório "LANÇAMENTOS DESPESAS" (FILIAL·TIPO·GRUPO·Categoria·Valor·MÊS,
  células mescladas herdadas) e a planilha pivot por CNPJ; mostra o plano (novos, repetidos no arquivo/banco, mês fechado,
  inválidos, categorias novas) antes de gravar; cada importação vira um **lote** que pode ser desfeito.
- **DRE** (F3, `/financeiro/dre`): molde `fin_dre_estrutura` (famílias → grupos → categorias), três níveis de detalhe, busca,
  % sobre receitas; contador/financeiro/admin **editam células** (ajuste da categoria no mês → `fin_dre_ajustes`) e os
  **saldos de caixa** (OmieCash, Sicredi, Itaú, Santander… → `fin_dre_saldos`); acumulado, capacidade e payback como no antigo.
- **Orçamento** (F4, `/financeiro/orcamento`): orçado × realizado por categoria e mês (`fin_orcamentos`), visão mês ou ano,
  realizado automático dos lançamentos ou informado à mão.
- **Caixa** (F4, `/financeiro/caixa`): **diário** (a receber dinheiro/PIX/boletos, a pagar do dia, conferência de caixa
  com motivo, saldo por conta — `fin_fluxo_diario`), **mensal** (provisão × realizado por família com acertividade —
  `fin_fluxo_mensal`) e **dia a dia** do mês por empresa.
- **Inadimplência e ranking** (F5, `/financeiro/analise`): crediário/convênio por mês (`fin_inadimplencia`, taxa colorida),
  ranking de lojas por resultado/despesa/receita, resumo por loja (lucro/prejuízo/empate e composição das despesas) e
  comparativo mês × mês anterior por grupo.
- **Alertas** (F6, na visão geral): prejuízo no mês, categorias >30% acima da média dos 3 meses anteriores e a categoria
  que mais consumiu.
Funções SQL (`fin_totais`, `fin_dre`, `fin_resumo_unidades`, `fin_diario`) fazem as somas no banco (PostgREST sem agregações)
e são paginadas de 1.000 em 1.000 (`rpcPaginado`).

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
**Robôs e agente** (C3, tela Conciliação → Robôs e agente):
- **Robô do Trier** (`trier-robo.ts`, porta fiel do `api.php` anterior): entra no Trier web (Podium: `Login.pod` → `httpStart`
  → `save`, com `Origin`/`Referer`), abre `Rel_0010.pod`, roda `runReport` (todas as filiais, a pagar, detalhado, por
  vencimento, saída Excel), baixa o .xlsx e guarda como arquivo `trier` com origem `robo_trier`. Credenciais só em
  `TRIER_URL`/`TRIER_USUARIO`/`TRIER_SENHA` (env); período padrão (dias antes/depois) em `conc_config` "trier" (admin).
  A tela tem `maxDuration = 300` porque o Trier pode levar minutos.
- **Agente dos .RET** (`/api/conciliacao/agente`, scripts em `public/agente-itau/`): o PC com o Itaú Mailbox roda
  `agente-itau.ps1` a cada 15 min (Agendador de Tarefas) e manda cada arquivo novo que começa com "341" com o cabeçalho
  `X-Agente: ag_…`. O servidor valida o SHA-256 da chave em `conc_agentes` (gerada uma vez pelo admin, revogável), grava via
  `guardarArquivo` com a service_role (env `SUPABASE_SERVICE_ROLE_KEY`, nunca no cliente) e marca `ultimo_uso`/`uploads`.

**Fornecedores e anomalias** (C4): a view `conc_boletos_vistos` (um boleto por chave, leitura mais recente) e as funções
`conc_fornecedor_historico`, `conc_fornecedores_lista` e `conc_fornecedor_ficha` (migração 0022) dão a **ficha por raiz de
CNPJ** (Conciliação → Fornecedores: boletos, total, % que bateu direto, divergências, faixa normal P10/mediana/P90/máximo,
CNPJs, bancos, nomes no Trier, de-para aprendido, pendências abertas). A cada conciliação, `analisarAnomalias` compara cada
boleto com esse histórico e grava em `conc_itens.dados.anomalias` (+ `fora_padrao`): fornecedor novo, valor muito/EXTREMAMENTE
acima (≥ R$ 2 mil e > 4×P90, 8×mediana, 1,5×máximo, com ≥ 15 boletos), banco ou CNPJ diferente do habitual, fornecedor do
Trier que costuma usar outro CNPJ, boleto > 10 % diferente do título. Aparecem no detalhe da conciliação (card "Fora do padrão",
filtro `?anomalias=1`, tag na linha) e na validação do Omie (EXTREMAMENTE/banco diferente bloqueiam; o resto avisa).

## Migração do financeiro anterior (fluxo de caixa SQLite)

Dois caminhos, ambos com o **seu login de administrador** (a `service_role` nunca entra em cena e nenhum dado real
vai para o Git):

1. **Pela tela** `/financeiro/migrar` (menu Financeiro, só admin): envie o arquivo `fluxo-caixa.db`; o sistema lê o SQLite no
   servidor (sql.js), mostra o plano (unidades a criar, categorias, lançamentos novos × já importados, extras: ajustes,
   saldos, orçamento, caixa, inadimplência) e grava quando você confirmar. Em produção (Vercel) o upload é limitado a
   4,5 MB — para um banco maior, rode `npm run dev` e use a tela em `localhost:3000`.
2. **Pelo script** `scripts/migrar-financeiro.mjs`, executado na sua máquina. Precisa de Node 22.13+ (usa `node:sqlite`).

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
