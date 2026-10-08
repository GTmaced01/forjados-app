import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'forjados-secret-check-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  copyFileSync(resolve('.gitignore'), join(dir, '.gitignore'));
  mkdirSync(join(dir, 'nested'));
  return dir;
}

function scan(dir: string) {
  return spawnSync(process.execPath, [resolve('scripts/check-secrets.mjs')], { cwd: dir, encoding: 'utf8' });
}

test('private signing files are ignored at any depth, while the blank example is tracked', () => {
  const dir = fixture();
  const privateFiles = ['nested/upload.jks', 'nested/upload.keystore', 'nested/upload.p12',
    'nested/upload.pfx', 'nested/keystore.properties', 'nested/keystore.properties.backup'];
  for (const path of privateFiles) {
    const result = spawnSync('git', ['check-ignore', path], { cwd: dir });
    assert.equal(result.status, 0, path);
  }
  writeFileSync(join(dir, 'nested/keystore.properties.example'), 'storePassword=\nkeyPassword=\n');
  execFileSync('git', ['add', 'nested/keystore.properties.example'], { cwd: dir });
  assert.equal(scan(dir).status, 0);
});

test('force-added private signing files fail the scanner even for binary contents', () => {
  const dir = fixture();
  for (const path of ['nested/upload.jks', 'nested/upload.keystore', 'nested/upload.p12',
    'nested/upload.pfx', 'nested/keystore.properties', 'nested/keystore.properties.backup']) {
    writeFileSync(join(dir, path), Buffer.from([0, 1, 2]));
    execFileSync('git', ['add', '-f', path], { cwd: dir });
  }
  const result = scan(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /arquivo privado de assinatura/);
});

test('local ignored configuration is not scanned, but filled-in tracked examples are rejected without exposing values', () => {
  const dir = fixture();
  const secret = ['test', 'only', 'not', 'a', 'real', 'credential'].join('-');
  writeFileSync(join(dir, 'nested/keystore.properties'), `storePassword=${secret}\n`);
  assert.equal(scan(dir).status, 0);
  writeFileSync(join(dir, 'nested/keystore.properties.example'), `keyPassword=${secret}\n`);
  execFileSync('git', ['add', 'nested/keystore.properties.example'], { cwd: dir });
  const result = scan(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /senha de assinatura preenchida/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
});

test('tracked private PEM material still fails without echoing the key', () => {
  const dir = fixture();
  const pem = ['-----BEGIN ', 'PRIVATE KEY-----', '\nDISPOSABLE\n', '-----END ', 'PRIVATE KEY-----'].join('');
  writeFileSync(join(dir, 'nested/key.txt'), pem);
  execFileSync('git', ['add', 'nested/key.txt'], { cwd: dir });
  const result = scan(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /chave privada PEM/);
  assert.ok(!result.stderr.includes(pem));
});
