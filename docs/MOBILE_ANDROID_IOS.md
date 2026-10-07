# FORJADOS em navegadores, Android e iOS

O mesmo frontend atende três canais:

- navegador/PWA: Vercel + manifesto + Service Worker;
- Android: projeto Capacitor em `android/`;
- iPhone/iPad: projeto Capacitor em `ios/`.

O identificador preparado é `br.com.forjados.app`. Confirme esse identificador antes de criar os registros nas lojas; depois da primeira publicação ele não deve ser trocado.

## Requisitos atuais

### Android

- Android Studio com Android SDK Platform 36 e Android SDK Platform-Tools;
- JDK 17 configurado em `JAVA_HOME`;
- `ANDROID_HOME` apontando para a pasta do Android SDK e `platform-tools` no `PATH`;
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

## Preparar e validar o ambiente Android

O projeto usa JDK 17, Gradle Wrapper 8.14.3, Android Gradle Plugin 8.13.0 e Android SDK Platform 36. Não é necessário instalar o Gradle separadamente.

No Windows, instale o Android Studio e, em **SDK Manager > SDK Platforms**, marque **Android 16 (API 36)**. Em **SDK Tools**, instale **Android SDK Platform-Tools**. Depois configure, ajustando o caminho ao seu usuário:

```powershell
$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
$androidHome = "$env:LOCALAPPDATA\Android\Sdk"
[Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $androidHome, 'User')
$path = [Environment]::GetEnvironmentVariable('Path', 'User')
[Environment]::SetEnvironmentVariable('Path', "$path;$javaHome\bin;$androidHome\platform-tools", 'User')
```

Abra um novo terminal e execute:

```bash
npm ci
npm run android:env:check
npm run mobile:check
npm run android:build:check
```

`android:build:check` sincroniza o Capacitor, compila um APK de debug e valida, em modo de simulação, a tarefa `bundleRelease`. Ele não cria nem assina o AAB de publicação. A configuração da chave e a geração do AAB assinado são etapas posteriores.

O workflow `Android` repete essa validação em cada pull request que altera o aplicativo ou o projeto Android. Assim, a configuração fica verificável mesmo antes de cada máquina local estar preparada.

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
