# FORJADOS App

Plataforma completa para gestão de retiros cristãos, reunindo participantes, equipes, inscrições, operação, comunicação, finanças e auditoria em uma única aplicação.

> “A forja não era para te destruir. Era para te transformar.”

## Visão geral

O FORJADOS App foi criado para apoiar todo o ciclo operacional de um retiro: cadastro e aprovação de participantes, organização de equipes e serviços, comunicação, acompanhamento financeiro e execução das atividades durante o evento.

A aplicação funciona como PWA e possui projetos nativos preparados para Android e iOS por meio do Capacitor.

## Principais funcionalidades

### Participantes

- autenticação, cadastro e recuperação de senha;
- perfil e inscrição por edição;
- acompanhamento do status da inscrição;
- envio protegido de comprovantes;
- visualização de cronograma, notificações e informações do evento;
- caronas, camisas, ofertas e lojas internas;
- sistema de pontos e Loja da Honra.

### Equipes e operação

- gestão de equipes, líderes e integrantes;
- escalas de serviço;
- cronograma e roteiro do evento;
- controle de alojamento, portão e presença;
- organização das etapas da trilha;
- acompanhamento de tráfego e tempo das equipes;
- painel público para informações operacionais.

### Administração e finanças

- painel administrativo por perfis de acesso;
- gestão de edições e abertura de inscrições;
- tesouraria e análise de comprovantes;
- controle de pedidos, estoque e pagamentos;
- mensagens automáticas e notificações push;
- histórico de alterações e trilha de auditoria;
- exportação de dados operacionais.

### Experiência mobile

- PWA instalável;
- funcionamento adaptado para desktop e dispositivos móveis;
- cache controlado para recursos essenciais;
- experiência offline em fluxos selecionados;
- base nativa para Android e iOS com Capacitor.

## Tecnologias

- **React 19**
- **TypeScript**
- **Vite**
- **Supabase**
  - PostgreSQL
  - Authentication
  - Storage
  - RPCs
  - Edge Functions
  - Row Level Security
- **Progressive Web App**
- **Capacitor 8**
- **Vercel**
- **GitHub Actions**

## Arquitetura e segurança

A aplicação utiliza o Supabase como backend e concentra operações sensíveis em políticas de banco, funções transacionais e Edge Functions.

Entre os controles presentes estão:

- políticas de acesso por perfil e edição;
- comprovantes privados com URLs assinadas e temporárias;
- operações financeiras realizadas no servidor;
- trilha de auditoria protegida;
- política de senha e recuperação de conta;
- encerramento de sessões após redefinição de senha;
- validação automatizada contra secrets versionados;
- carregamento sob demanda de módulos;
- migrations versionadas como fonte oficial do banco.

Variáveis \`VITE_*\` são incorporadas ao frontend. Nunca coloque nelas \`service_role\`, chaves secretas, tokens privados ou credenciais de gateway.

## Execução local

### Pré-requisitos

- Node.js 24;
- npm;
- projeto Supabase configurado.

### Instalação

```bash
git clone https://github.com/GTmaced01/forjados-app.git
cd forjados-app
cp .env.example .env
npm ci
npm run dev
```

### Variáveis de ambiente

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_APP_URL=http://localhost:5173
VITE_WEB_PUSH_PUBLIC_KEY=SUA_CHAVE_VAPID_PUBLICA
```

## Validação

```bash
npm run check:secrets
npm run lint
npm test
npm run build
npm run mobile:check
```

## Aplicativos móveis

```bash
npm run mobile:sync
npm run mobile:android
```

Para iOS, execute em um Mac com Xcode:

```bash
npm run mobile:ios
```

Consulte \`docs/MOBILE_ANDROID_IOS.md\` e \`docs/PWA_PLAY_STORE_CHECKLIST.md\` antes de gerar uma versão para as lojas.

## Banco de dados

As migrations oficiais ficam em \`supabase/migrations/\`. O histórico antigo ainda exige uma baseline reproduzível antes de comandos destrutivos ou reparos de versão.

Leia estes documentos antes de alterar o banco:

- \`docs/SUPABASE_BASELINE_RECOVERY.md\`
- \`docs/FORJADOS_2_1R_RELEASE.md\`
- \`docs/FORJADOS_2_1R1_RELEASE.md\`
- \`docs/FORJADOS_2_1R2_SECURITY_CLOSURE.md\`

## Estrutura principal

```text
src/
  components/     componentes compartilhados
  hooks/          hooks da aplicação
  services/       acesso a dados e regras do frontend
  views/          telas e módulos funcionais
supabase/
  functions/      Edge Functions
  migrations/     evolução versionada do banco
docs/             documentação técnica e de publicação
android/          projeto Android
ios/              projeto iOS
tests/            testes automatizados
```

## Status

Projeto em desenvolvimento ativo. O deploy principal e os fluxos críticos devem ser validados antes de cada publicação; integrações legadas não fazem parte da versão atual.

## Autor

Desenvolvido por [Gustavo Medeiros](https://github.com/GTmaced01).

## Uso do código

Este projeto **não é open source**. O código é disponibilizado publicamente para demonstração e avaliação técnica de portfólio, sem concessão de licença para uso, modificação, redistribuição ou exploração comercial.

Contribuições externas não são aceitas no momento. Todos os direitos reservados ao autor.
