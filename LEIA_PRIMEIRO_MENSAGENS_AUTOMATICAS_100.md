# FORJADOS - Mensagens Automáticas 100% automáticas

Esta versão deixa as mensagens automáticas processando pelo próprio Supabase, sem depender de admin/diretor abrir o aplicativo.

## Ordem correta

1. Suba este projeto no GitHub.
2. Aguarde a Vercel publicar.
3. No Supabase, abra **SQL Editor**.
4. Rode o arquivo:

```text
supabase/automated-messages-100-automatic.sql
```

## O que o SQL faz

- Cria/ajusta a tabela `automated_messages`.
- Cria a função `forjados_process_due_automated_messages()`.
- Agenda um cron interno no Supabase para rodar **a cada 1 minuto**.
- Mensagens vencidas viram notificações internas na tabela `app_notifications`.
- A mensagem muda automaticamente de `scheduled` para `sent`.
- Se der erro em alguma mensagem, ela vira `failed` e grava `last_error`.

## Como testar

1. Entre no app como admin/diretor.
2. Vá em **Mensagens Automáticas**.
3. Crie uma mensagem para 2 ou 3 minutos no futuro.
4. Aguarde sem abrir/recarregar a tela.
5. Após o horário, entre em **Notificações** com um usuário destinatário.
6. A notificação deve aparecer.

## Observação importante

Essa automação é 100% automática **dentro do Supabase**, usando `pg_cron`.

Se o SQL falhar em `create extension if not exists pg_cron`, o projeto precisa habilitar a extensão `pg_cron` no Supabase. Em alguns projetos, isso pode exigir ativar a extensão em:

Database > Extensions > pg_cron

Depois disso, rode o SQL novamente.

## O que ainda falta depois disso

- Push notification real fora do app/celular bloqueado.
- PDF automático bonito com biblioteca.
- Planilha XLSX com abas reais.
- Pix/Mercado Pago integrado.
- Teste fino de permissões por setor com contas reais.
