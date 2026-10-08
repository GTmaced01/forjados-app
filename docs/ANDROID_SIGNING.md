# Assinatura Android do FORJADOS App

Este guia atende o item #25. A chave real deve ser criada no computador persistente do responsável. Não a crie em uma sessão temporária, não envie senhas pelo chat e não envie o keystore ao GitHub. A preparação do código pode ser feita antes do pagamento da Play Console.

## Qual chave estamos criando

Pacote: `br.com.forjados.app`. Alias sugerido: `forjados-upload`.

Criaremos a **upload key**: assina os arquivos enviados à Google Play. Ao configurar Play App Signing no item #27, o Google poderá gerar e guardar outra chave para assinar os APKs distribuídos aos usuários. A chave de upload pode ser redefinida pela Play Console em caso de perda ou comprometimento; essa redefinição não troca a assinatura dos aplicativos já instalados.

Não reutilize a chave de testes e não use a chave de debug. A decisão de compartilhar uma assinatura entre outras lojas precisa ser tomada antes do cadastro nas lojas e não está incluída neste item.

## 1. Preparar custódia

- Escolha uma pasta particular fora do repositório, em disco com criptografia e acesso restrito ao responsável.
- Guarde a senha forte em um gerenciador de senhas. Ela não deve ficar em Issues, PRs, mensagens, scripts ou histórico do terminal.
- Defina uma cópia de segurança em outro dispositivo/local protegido e uma pessoa responsável pela recuperação. Uma pasta sincronizada sem controles de acesso não substitui um backup protegido.
- Confirme que não existe uma chave real anterior antes de gerar outra. Nunca sobrescreva um arquivo de chave existente.

## 2. Gerar no seu computador

Abra o FORJADOS no Android Studio após preparar o JDK 21 e o SDK conforme `MOBILE_ANDROID_IOS.md`.

1. Abra **Build > Generate Signed Bundle / APK**, selecione **Android App Bundle** e **Next**.
2. Em **Key store path**, clique **Create new**. Se já existir uma chave real, use a existente; não crie uma substituta.
3. Escolha um caminho fora do Git, por exemplo `C:/ForjadosKeys/forjados-upload.jks`. Evite pastas públicas ou compartilhadas.
4. Defina uma senha forte, alias `forjados-upload`, senha da chave e validade de pelo menos 25 anos. Preencha os dados reais do responsável/organização.
5. Conclua a criação do keystore. Cancele o assistente antes de gerar o AAB; o pacote definitivo será tratado no item #26.

Alternativa no terminal, com senhas solicitadas de forma interativa (ajuste o caminho; não acrescente senha ao comando):

```powershell
keytool -genkeypair -v -keystore C:/ForjadosKeys/forjados-upload.jks -storetype JKS -alias forjados-upload -keyalg RSA -keysize 2048 -validity 10000
```

O arquivo só pode ser considerado pronto depois de conferir a senha, alias e backup. Guarde separadamente a senha do armazenamento e a da chave, se forem diferentes.

## 3. Conferir certificado e backup

No terminal do computador, execute (a senha será solicitada):

```powershell
keytool -list -v -keystore C:/ForjadosKeys/forjados-upload.jks -alias forjados-upload
keytool -exportcert -rfc -keystore C:/ForjadosKeys/forjados-upload.jks -alias forjados-upload -file C:/ForjadosKeys/forjados-upload-certificate.pem
```

Registre alias, validade e impressão digital SHA-256 do **certificado público**. Esse certificado não contém a chave privada, mas pode conter nome/localidade do responsável; revise esses dados antes de compartilhá-lo.

Copie o keystore para o backup protegido. Restaure essa cópia em outra pasta particular e repita `keytool -list` com o caminho restaurado. A impressão digital deve ser igual. Confirme também a recuperação da senha no gerenciador. Não sobrescreva nem apague o original para testar o backup.

## 4. Configurar assinatura local

Copie `android/keystore.properties.example` para `android/keystore.properties` e preencha localmente:

- `storeFile`: caminho absoluto da chave fora do Git; use `/` no Windows;
- `storePassword`: senha do armazenamento;
- `keyAlias`: `forjados-upload`;
- `keyPassword`: senha da chave.

O formato Java Properties interpreta barras invertidas como escapes. Prefira caminhos com `/`; se a senha contiver `\`, esse caractere precisa ser escapado como `\\`. Nunca cole o arquivo de configuração em logs ou no chat. O arquivo guarda senhas em texto simples: mantenha-o em disco protegido e com permissões restritas.

Por compatibilidade, caminhos relativos continuam sendo resolvidos a partir de `android/app`. É mais seguro e previsível usar o caminho absoluto.

O Gradle verifica campos, arquivo, senha do armazenamento, alias e senha da chave. Mensagens de erro não exibem senhas nem valores da configuração. Debug funciona sem chave; release real fica bloqueado sem assinatura. A simulação `--dry-run` do CI continua disponível e **não comprova uma assinatura de produção**.

Não use `--debug`, `--scan` ou publique dumps de propriedades em sessões com a chave real. Se o arquivo estiver presente e inválido, corrija-o antes de usar o Gradle, inclusive para debug.

## 5. Teste de preparação e conclusão

```bash
npm run check:secrets
npm run android:signing:test
npm run android:build:check
```

`android:signing:test` usa um projeto temporário separado, uma chave descartável e senhas aleatórias. Testa a validação, uma assinatura JAR real, certificado e restauração; não lê sua chave ou configuração de produção. No CI Linux, após sincronizar o Capacitor, a opção `--android` também compila um APK release em uma cópia isolada do projeto e confere a assinatura com `apksigner`. Essa cópia exclui configurações e chaves privadas do projeto original. O CI executa os testes com o JDK 21. Os arquivos temporários de teste não são enviados como artefatos e o APK de teste nunca deve ser distribuído ou usado para publicação.

O scanner examina arquivos rastreados pelo Git e recusa keystores/configurações privadas, inclusive quando adicionados à força. O `.gitignore` reduz erros de inclusão, mas não remove arquivos já versionados e não substitui a revisão antes de cada commit.

Critérios para concluir #25:

- [ ] Chave real criada no computador persistente, fora do Git.
- [ ] Alias, certificado público e validade conferidos.
- [ ] Senha recuperável pelo responsável, sem exposição.
- [ ] Backup protegido restaurado e impressão digital conferida.
- [ ] Configuração release validada localmente, sem valores privados em logs.
- [ ] Preparação de código revisada e integrada com aprovação.

Somente informar que a preparação do código passou não conclui este item. AAB definitivo, pagamento, cadastro e publicação ficam nos itens seguintes.

## Recuperação e incidente

Primeiro restaure o backup e confira a impressão digital. Se a chave de upload foi perdida ou exposta depois de cadastrada no Play App Signing, crie uma nova upload key no ambiente seguro e solicite a redefinição na Play Console. Não substitua silenciosamente a chave nem gere um novo cadastro do app. Antes de qualquer publicação, trate vazamento como incidente e pause o envio.

Referência oficial: [Assinatura de aplicativos Android](https://developer.android.com/studio/publish/app-signing).
