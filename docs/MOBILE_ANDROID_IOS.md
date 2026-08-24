# FORJADOS em navegadores, Android e iOS

O mesmo frontend atende três canais:

- navegador/PWA: Vercel + manifesto + Service Worker;
- Android: projeto Capacitor em `android/`;
- iPhone/iPad: projeto Capacitor em `ios/`.

O identificador preparado é `br.com.forjados.app`. Confirme esse identificador antes de criar os registros nas lojas; depois da primeira publicação ele não deve ser trocado.

## Requisitos atuais

### Android

- Android Studio e JDK compatível com o projeto gerado;
- `minSdk 24`, `compileSdk 36` e `targetSdk 36`;
- conta Google Play Console;
- chave de assinatura guardada fora do repositório;
- formulário de segurança de dados, política de privacidade e exclusão de conta/dados.

### Apple

- macOS, Xcode e Apple Developer Program;
- Bundle ID `br.com.forjados.app` e certificado/perfil de distribuição;
- versão mínima iOS 15 definida pelo Capacitor 8;
- App Privacy, política de privacidade, screenshots e dados de revisão;
- conta de demonstração para a equipe de revisão quando o conteúdo exigir login.

## Gerar e abrir

```bash
npm ci
npm run mobile:sync
npm run mobile:android
```

No macOS:

```bash
npm run mobile:ios
```

O comando `mobile:sync` sempre executa um build novo e copia os arquivos para os projetos nativos.

## Assinatura e publicação

1. Ajustar `versionCode/versionName` no Android e `CURRENT_PROJECT_VERSION/MARKETING_VERSION` no iOS.
2. Configurar assinatura Release sem versionar keystore, senhas ou certificados.
3. Testar em aparelho físico, inclusive login, reset de senha, upload de PDF/imagem e links externos.
4. Gerar Android App Bundle (`.aab`) e Archive do Xcode.
5. Publicar primeiro em faixas internas/TestFlight.
6. Corrigir relatórios de pré-lançamento antes da produção.

## Notificações

Web Push continua válido para navegadores e PWA instalada, inclusive dispositivos Apple compatíveis. O WebView do aplicativo das lojas exige uma implementação nativa separada com FCM/APNs. Essa integração deve ser feita em uma fase posterior, com credenciais próprias e sem colocar secrets no frontend.

## Limites desta preparação

Os projetos nativos, ícones, splash, retorno físico do Android e políticas básicas de transporte seguro já estão preparados. A publicação efetiva depende das contas Google/Apple, aceite dos contratos, identidade jurídica, certificados, conteúdo da listagem e revisão das lojas.
