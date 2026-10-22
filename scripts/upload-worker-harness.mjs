import { readdir, readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

export async function workerModules() {
  const directory = new URL('../worker/', import.meta.url)
  const names = (await readdir(directory)).filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts'))
  return Promise.all(names.map(async name => ({
    type: 'ESModule',
    path: `worker/${name.replace(/\.ts$/u, '.js')}`,
    contents: stripTypeScriptTypes(await readFile(new URL(name, directory), 'utf8')),
  })))
}
