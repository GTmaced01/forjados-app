import { mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// Completely isolated from android/keystore.properties and the production key.
const projectDir = mkdtempSync(join(tmpdir(), 'forjados-signing-test-'))
const source = resolve('android')
writeFileSync(join(projectDir, 'settings.gradle'), "rootProject.name = 'signing-regression'\n")
writeFileSync(join(projectDir, 'build.gradle'), `
apply from: new File(System.getenv('FORJADOS_SIGNING_SOURCE'), 'release-signing.gradle')
apply from: new File(System.getenv('FORJADOS_SIGNING_SOURCE'), 'signing-tests.gradle')
tasks.register('assembleDebug')
tasks.register('bundleRelease')
`)

const wrapper = resolve('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
function run(tasks, expectedStatus = 0, expectedMessage) {
  const result = spawnSync(wrapper, ['--no-daemon', '--console=plain', '-p', projectDir, ...tasks], {
    encoding: 'utf8',
    env: { ...process.env, FORJADOS_SIGNING_SOURCE: source },
    // Windows batch wrappers require the command interpreter; all arguments are
    // generated here and contain no user input or passwords.
    shell: process.platform === 'win32',
  })
  if (result.error || (expectedStatus === 0 ? result.status !== 0 : result.status === 0) ||
      (expectedMessage && !`${result.stdout}${result.stderr}`.includes(expectedMessage))) {
    console.error(result.stdout ?? '')
    console.error(result.stderr ?? '')
    console.error(result.error?.message ?? 'Falha no teste de assinatura.')
    process.exit(1)
  }
  if (expectedStatus === 0) console.log(result.stdout.trim())
}

run(['signingRegression', 'assembleDebug'])
run(['bundleRelease', '--dry-run'])
run(['bundleRelease'], 1, 'Assinatura release ausente.')
console.log('OK: release sem chave bloqueado; debug e dry-run permitidos.')
console.log('Nenhuma chave de produção foi usada ou criada. Os arquivos temporários são exclusivos deste teste.')
