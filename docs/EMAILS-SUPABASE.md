# E-mails do login (Supabase Auth)

Configurado em 15/10/2026 no painel do Supabase (projeto sistema-fct). Nada disso fica no código: se o projeto for
recriado, refazer à mão.

## Envio (Authentication → Emails → SMTP Settings)

- SMTP próprio ligado, conta `nao-responda@farmaciafct.com.br` criada no cPanel do farmaciafct.com.br.
- Host `mail.farmaciafct.com.br`, porta `465` (SSL), usuário = o próprio e-mail, remetente "Sistema FCT".
- A senha fica só no cPanel e no Supabase (nunca no Git nem no chat).
- Sem SMTP próprio o Supabase não deixa editar os modelos e limita o envio a poucos e-mails por hora.
- Domínio já tem SPF, DKIM e DMARC publicados (conferido em 15/10/2026).

## Validade do link (Authentication → Sign In / Providers → Email)

- Email OTP Expiration = `86400` (24 horas). O padrão de 1 hora fazia o convite vencer antes de a pessoa abrir.

## Por que os links usam `token_hash`

O link padrão (`{{ .ConfirmationURL }}`) não funciona neste sistema:

- a redefinição de senha pedida no servidor usa PKCE: o link só abre no navegador de quem pediu (o admin que clicou
  em "Redefinir senha" ou o computador onde a pessoa pediu), e falha no celular ou no navegador da própria pessoa;
- o convite manda a sessão no fragmento `#access_token`, que a rota do servidor não enxerga.

Com `token_hash`, a rota `src/app/auth/confirm/route.ts` chama `verifyOtp` e abre a sessão em qualquer aparelho.
O `{{ .SiteURL }}` é o Site URL de Authentication → URL Configuration (`https://portal.farmaciafct.com.br`).

## Links de cada modelo

| Modelo | Assunto | Link do botão |
|---|---|---|
| Reset password | Vamos criar sua nova senha? 🔑 | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/atualizar-senha` |
| Invite user | Boas-vindas ao Sistema FCT! 🎉 | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/atualizar-senha` |
| Confirm sign up | Falta pouco! Confirme seu e-mail ✅ | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/auth/atualizar-senha` |

## Corpo (HTML) — mesmo layout nos três, muda título, texto, botão e link

```html
<div style="margin:0;padding:24px 0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#0e2148"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e3e6ec"><tr><td style="background:#0e2148;padding:18px 28px;border-radius:12px 12px 0 0"><span style="display:inline-block;background:#c1121f;color:#ffffff;font-weight:900;font-size:13px;padding:8px 10px;border-radius:8px">FCT</span><span style="color:#ffffff;font-size:16px;font-weight:bold;margin-left:10px">Sistema FCT</span></td></tr><tr><td style="height:4px;background:#c1121f"></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:20px;color:#0e2148">TÍTULO</h1><p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#3c4556">TEXTO</p><a href="LINK DA TABELA" style="display:inline-block;background:#f2c200;color:#0e2148;font-weight:bold;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:8px">BOTÃO</a><p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#5d646f">RODAPÉ DO LINK</p></td></tr><tr><td style="padding:14px 28px;background:#f3f5f8;font-size:11px;color:#5d646f;border-radius:0 0 12px 12px">Farmácias FCT · uso interno · e-mail automático, não precisa responder.</td></tr></table></td></tr></table></div>
```

| Modelo | Título | Texto | Botão | Rodapé do link |
|---|---|---|---|---|
| Reset password | Esqueceu a senha? Acontece com todo mundo 😉 | Recebemos um pedido para trocar a senha do seu acesso ao Sistema FCT. É rapidinho: clique no botão abaixo e escolha uma senha nova. | Criar minha nova senha | O link vale por 24 horas e funciona uma vez só. Não foi você que pediu? Pode ignorar este e-mail, sua senha continua a mesma. |
| Invite user | Que bom ter você com a gente! | Seu acesso ao Sistema FCT, o sistema de gestão das Farmácias FCT, já está pronto. Falta só um passo: criar sua senha. | Criar minha senha e entrar | O link vale por 24 horas e funciona uma vez só. Se ele expirar, é só pedir um novo para o administrador do sistema. |
| Confirm sign up | Falta só confirmar seu e-mail | Seu acesso ao Sistema FCT foi criado. Confirme que este e-mail é seu e já crie sua senha para começar. | Confirmar e criar senha | O link vale por 24 horas e funciona uma vez só. |
