import { copyFileSync, cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
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
function run(tasks, expectedStatus = 0, expectedMessage, directory = projectDir) {
  const result = spawnSync(wrapper, ['--no-daemon', '--console=plain', '-p', directory, ...tasks], {
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

if (process.argv.includes('--android')) {
  if (process.platform !== 'linux' || !process.env.ANDROID_HOME) {
    console.error('O teste integrado de APK requer o ambiente Linux/Android do CI.')
    process.exit(1)
  }
  const androidCopy = join(projectDir, 'android')
  cpSync(source, androidCopy, {
    recursive: true,
    filter: (path) => !['build', '.gradle'].includes(basename(path)) &&
      !/^keystore\.properties(?:\..*)?$/.test(basename(path)) && !/\.(jks|keystore|p12|pfx)$/i.test(path),
  })
  symlinkSync(resolve('node_modules'), join(projectDir, 'node_modules'), 'dir')
  const fixture = join(projectDir, 'build', 'disposable-key')
  copyFileSync(join(fixture, 'test.properties'), join(androidCopy, 'keystore.properties'))
  run(['assembleRelease'], 0, undefined, androidCopy)
  const apk = join(androidCopy, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
  const verifier = join(process.env.ANDROID_HOME, 'build-tools', '36.0.0', 'apksigner')
  const verification = spawnSync(verifier, ['verify', '--print-certs', apk], { encoding: 'utf8' })
  const fingerprint = verification.stdout?.match(/certificate SHA-256 digest:\s*([a-f0-9]+)/i)?.[1]
  const expected = readFileSync(join(fixture, 'certificate-sha256.txt'), 'utf8').trim()
  if (verification.error || verification.status !== 0 || fingerprint?.toLowerCase() !== expected) {
    console.error('O APK de teste não possui a assinatura esperada da chave descartável.')
    process.exit(1)
  }
  console.log('OK: APK release de teste assinado e certificado confirmado por apksigner, em cópia isolada.')
}
console.log('Nenhuma chave de produção foi usada ou criada. Os arquivos temporários são exclusivos deste teste.')
