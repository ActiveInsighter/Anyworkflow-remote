// Browser regressions. Every case mocks PocketBase, so nothing touches real records.
//
//   npm run test:browser                  start a Vite dev server and run every case
//   npm run test:browser -- pdf editor    run only the named cases
//   TEST_BASE_URL=https://… npm run test:browser   check a deployed preview instead
//
// SCREENSHOT_DIR is passed through to the cases that save screenshots.
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const scriptsDir = fileURLToPath(new URL('.', import.meta.url))
const rootDir = fileURLToPath(new URL('..', import.meta.url))
const suffix = '.browser.mjs'

const available = (await readdir(scriptsDir))
  .filter((file) => file.endsWith(suffix))
  .map((file) => file.slice(0, -suffix.length))
  .sort()
const requested = process.argv.slice(2)
const unknown = requested.filter((name) => !available.includes(name))
if (unknown.length) {
  console.error(`Unknown browser case: ${unknown.join(', ')}\nAvailable: ${available.join(', ')}`)
  process.exit(1)
}
const cases = requested.length ? requested : available

let server
let baseUrl = process.env.TEST_BASE_URL
if (!baseUrl) {
  server = await createServer({ root: rootDir, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  baseUrl = server.resolvedUrls.local[0].replace(/\/$/u, '')
}
console.log(`Browser regressions against ${baseUrl}\n`)

function runCase(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, [`${scriptsDir}${name}${suffix}`], {
      cwd: rootDir,
      env: { ...process.env, TEST_BASE_URL: baseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('close', (code) => resolve({ name, ok: code === 0, output, seconds: (Date.now() - started) / 1000 }))
  })
}

const failures = []
try {
  for (const name of cases) {
    const result = await runCase(name)
    const lines = result.output.trim().split('\n')
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${name.padEnd(18)} ${result.seconds.toFixed(1)}s`)
    if (result.ok) console.log(`      ${lines.at(-1)}`)
    else {
      failures.push(name)
      console.log(lines.map((line) => `      ${line}`).join('\n'))
    }
  }
} finally {
  await server?.close()
}

console.log(`\n${cases.length - failures.length}/${cases.length} browser cases passed`)
if (failures.length) process.exit(1)
