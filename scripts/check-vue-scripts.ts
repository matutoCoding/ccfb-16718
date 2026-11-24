import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

const transpiler = new Bun.Transpiler({ loader: 'ts' })
let failed = false
for (const file of walk('src')) {
  const source = readFileSync(file, 'utf8')
  const match = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)
  if (!match) continue
  try {
    transpiler.transformSync(match[1])
    console.log('ok', file)
  } catch (error) {
    failed = true
    console.error('fail', file, error)
  }
}
if (failed) process.exit(1)
