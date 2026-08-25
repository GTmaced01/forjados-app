# FORJADOS 2.1R.1 — qualidade, desempenho e proteção de conta

## Entregue

- módulos carregados sob demanda para reduzir o JavaScript inicial;
- login e recuperação continuam no pacote principal, com telas operacionais separadas em chunks;
- senha nova com no mínimo 10 caracteres, maiúscula, minúscula, número e símbolo;
- bloqueio local de combinações comuns;
- encerramento global das sessões depois de uma redefinição de senha;
- testes unitários da política de senha;
- verificação automática de secrets versionados;
- 21 índices idempotentes para chaves estrangeiras indicadas pelo Performance Advisor;
- cache PWA versionado para distribuir os novos chunks com segurança.
- callback de recuperação capturado antes de o Supabase consumir o hash da URL;
- rota pública dedicada `/recuperar-senha`, compatível também com os links antigos.

A verificação local não substitui a proteção contra senhas vazadas do Supabase, que permanece indisponível no plano gratuito. Ela reduz senhas fracas na interface; o Supabase Auth continua sendo a autoridade de cadastro e autenticação.

## Banco

Execute somente:

```text
supabase/migrations/20260825_forjados_2_1r1_performance_indexes.sql
```

A migration não altera dados, RLS, grants ou funções. Ela apenas adiciona índices ausentes nas colunas que referenciam outras tabelas. Depois da aplicação, confira novamente o Performance Advisor.

## Validação

```bash
npm ci
npm run check:secrets
npm run lint
npm test
npm run build
npm run mobile:check
```

Teste a recuperação de senha por e-mail em uma janela anônima. Depois da troca, confirme que a nova senha entra e que uma sessão anterior em outro navegador precisa autenticar novamente.

Antes do teste, adicione exatamente esta URL em **Supabase > Authentication > URL Configuration > Redirect URLs**:

```text
https://forjados-app.vercel.app/recuperar-senha
```

Solicite um e-mail novo após o deploy e abra apenas o link mais recente. O token de recuperação é de uso único; reutilizar um link já validado resulta em “inválido ou expirado”.

## Gateway

Nenhuma dependência, chave ou regra específica de Mercado Pago, Stone ou InfinitePay foi adicionada. O pagamento manual e os comprovantes privados permanecem ativos enquanto o cliente decide o provedor.
