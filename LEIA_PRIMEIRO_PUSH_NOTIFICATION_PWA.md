# FORJADOS - Push Notification real para PWA

Esta atualização adiciona notificação push real:

- aparece fora do app;
- aparece com o celular bloqueado;
- funciona para mensagens automáticas, avisos, aprovações e qualquer registro criado em `app_notifications`;
- depende de internet no celular para receber.

## 1. Suba o código no GitHub

Depois aguarde a Vercel publicar.

## 2. Gere as chaves VAPID

No seu computador, rode:

```bash
npx web-push generate-vapid-keys
```

Você receberá:

```text
Public Key: ...
Private Key: ...
```

## 3. Configure a Vercel

Adicione no projeto da Vercel:

```env
VITE_WEB_PUSH_PUBLIC_KEY=SUA_PUBLIC_KEY
```

Depois faça redeploy.

## 4. Rode o SQL no Supabase

Rode:

```text
supabase/push-notifications-pwa.sql
```

## 5. Configure as secrets da Supabase Edge Function

No terminal com Supabase CLI:

```bash
supabase secrets set VAPID_PUBLIC_KEY="SUA_PUBLIC_KEY"
supabase secrets set VAPID_PRIVATE_KEY="SUA_PRIVATE_KEY"
supabase secrets set VAPID_SUBJECT="mailto:forjados.ofc@gmail.com"
```

A Supabase já fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` para a Edge Function.

## 6. Faça deploy da Edge Function

```bash
supabase functions deploy send-push-notifications --no-verify-jwt
```

## 7. Configure o cron para chamar a Edge Function

No Supabase SQL Editor, rode trocando `SEU_PROJECT_REF`:

```sql
select public.forjados_configure_push_cron(
  'https://SEU_PROJECT_REF.supabase.co/functions/v1/send-push-notifications',
  '* * * * *'
);
```

O `PROJECT_REF` é o começo da URL do seu Supabase, exemplo:

```text
https://abcd1234.supabase.co
```

Então ficaria:

```sql
select public.forjados_configure_push_cron(
  'https://abcd1234.supabase.co/functions/v1/send-push-notifications',
  '* * * * *'
);
```

## 8. Como o usuário ativa

No app:

```text
Notificações > Ativar push
```

O navegador vai pedir permissão. Depois disso, o usuário passa a receber push real.

## Observação importante

Nenhum celular recebe push sem internet. O que acontece é:

- mensagem é processada no servidor;
- push é enviado quando há internet;
- se o aparelho estiver completamente offline, ele só recebe quando reconectar, dependendo do sistema/navegador.
