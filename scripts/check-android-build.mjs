import { spawnSync } from 'node:child_process'

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'

run(npm, ['run', 'android:env:check'])
run(npm, ['run', 'mobile:sync'])
run(gradle, ['--no-daemon', 'assembleDebug'], { cwd: 'android' })
run(gradle, ['--no-daemon', '--dry-run', 'bundleRelease'], { cwd: 'android' })

console.log('\nBuild Android validado; a assinatura e o AAB definitivo permanecem fora deste comando.')
