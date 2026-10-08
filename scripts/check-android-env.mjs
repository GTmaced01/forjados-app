import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const REQUIRED_JAVA_MAJOR = 21
const REQUIRED_ANDROID_API = 36

function fail(message) {
  console.error(`ERRO: ${message}`)
  process.exitCode = 1
}

function commandExists(command) {
  const executable = process.platform === 'win32' ? `${command}.exe` : command
  return (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .some((directory) => existsSync(join(directory, executable)))
}

const javaResult = spawnSync('java', ['-version'], { encoding: 'utf8' })
if (javaResult.error || javaResult.status !== 0) {
  fail('Java não foi encontrado no PATH. Instale um JDK 21 e configure JAVA_HOME.')
} else {
  const javaOutput = `${javaResult.stdout}\n${javaResult.stderr}`
  const versionMatch = javaOutput.match(/version "(?:1\.)?(\d+)/)
  const javaMajor = versionMatch ? Number(versionMatch[1]) : Number.NaN

  if (!Number.isFinite(javaMajor) || javaMajor < REQUIRED_JAVA_MAJOR) {
    fail(`JDK ${REQUIRED_JAVA_MAJOR} ou superior é obrigatório; versão detectada: ${versionMatch?.[1] ?? 'desconhecida'}.`)
  } else {
    console.log(`OK: Java ${javaMajor}`)
  }
}

const androidHome = process.env.ANDROID_HOME
if (!androidHome) {
  fail('ANDROID_HOME não está configurado.')
} else if (!existsSync(androidHome)) {
  fail(`ANDROID_HOME aponta para uma pasta inexistente: ${androidHome}`)
} else {
  console.log(`OK: ANDROID_HOME=${androidHome}`)

  const platformJar = join(androidHome, 'platforms', `android-${REQUIRED_ANDROID_API}`, 'android.jar')
  if (!existsSync(platformJar)) {
    fail(`Android SDK Platform ${REQUIRED_ANDROID_API} não foi encontrado. Instale "platforms;android-${REQUIRED_ANDROID_API}".`)
  } else {
    console.log(`OK: Android SDK Platform ${REQUIRED_ANDROID_API}`)
  }
}

if (!commandExists('adb')) {
  fail('adb não foi encontrado no PATH. Adicione ANDROID_HOME/platform-tools ao PATH.')
} else {
  console.log('OK: adb disponível')
}

const gradleWrapper = process.platform === 'win32'
  ? join('android', 'gradlew.bat')
  : join('android', 'gradlew')

if (!existsSync(gradleWrapper)) {
  fail(`Gradle Wrapper não encontrado em ${gradleWrapper}.`)
} else {
  console.log(`OK: Gradle Wrapper disponível em ${gradleWrapper}`)
}

if (process.exitCode) {
  console.error('\nAmbiente Android incompleto. Consulte docs/MOBILE_ANDROID_IOS.md.')
} else {
  console.log('\nAmbiente Android pronto para compilar o projeto FORJADOS.')
}
