# Projetos Vercel do FORJADOS App

## Projeto atual

O projeto oficial é `forjados-app` na equipe `MedeirosDev`. Ele mantém o deploy de produção e o domínio público `forjados-app.vercel.app`.

## Projeto legado

`forjados-app-legacy` é um projeto histórico que ainda aponta para o repositório `GTmaced01/forjados-app`. Ele não possui domínio ativo próprio e não deve ser usado para publicar a versão atual.

Para evitar builds duplicados e falhas de previews do legado, novos previews desse projeto ficam desabilitados na configuração da Vercel. O projeto não é excluído e seus deploys históricos permanecem disponíveis para auditoria.

## Verificação operacional

Após qualquer alteração nesta configuração:

1. confirme que `forjados-app.vercel.app` continua associado ao projeto `forjados-app`;
2. confirme que o último deploy de produção do projeto atual está `READY`;
3. abra uma PR ou faça um push de teste e verifique que o preview do projeto atual é criado normalmente;
4. confirme que o projeto legado não cria novos previews.

## Rollback

Se for necessário reativar os previews do legado, altere somente a opção `previewDeploymentsDisabled` do projeto `forjados-app-legacy` para `false` na equipe `MedeirosDev`. Não pause o projeto atual e não altere seus domínios.

Nenhum domínio, deploy histórico, repositório, variável de ambiente ou dado de usuário faz parte desta limpeza.
