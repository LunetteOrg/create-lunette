#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { argv, cwd, exit, stderr, stdout } from 'node:process'

const TEMPLATE_REPO = 'LunetteOrg/starter'
const TEMPLATE_REF = 'main'
const PLACEHOLDER_SCOPE = '@starter'
const PLACEHOLDER_NAMES = ['starter-db', 'starter-web']
const TEXT_EXTENSIONS = new Set([
  '.json', '.jsonc', '.yaml', '.yml', '.ts', '.tsx', '.js', '.mjs', '.cjs',
  '.md', '.mdx', '.css', '.html', '.env', '.nvmrc', '.npmrc', '.gitignore',
  '.template',
])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.react-router', '.turbo'])

function log(msg) { stdout.write(`${msg}\n`) }
function err(msg) { stderr.write(`${msg}\n`) }

function printUsage() {
  log('Usage: npm create @lunette <project-name>')
  log('       pnpm create @lunette <project-name>')
  log('')
  log('Scaffolds a new project from LunetteOrg/starter.')
}

function parseArgs() {
  const args = argv.slice(2)
  if (args.includes('-h') || args.includes('--help')) {
    printUsage()
    exit(0)
  }
  const name = args[0]
  if (!name) {
    err('Error: missing project name.\n')
    printUsage()
    exit(1)
  }
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    err(`Error: project name "${name}" must be kebab-case (lowercase letters, digits, hyphens; starting with a letter).`)
    exit(1)
  }
  return { name }
}

function downloadTemplate(targetDir) {
  // `git clone --depth 1` works for both public and private repos (private requires
  // user credentials via SSH/HTTPS). We then delete `.git` so the scaffold starts
  // from a clean history.
  const url = `https://github.com/${TEMPLATE_REPO}.git`
  execSync(`git clone --depth 1 --branch ${TEMPLATE_REF} --quiet "${url}" "${targetDir}"`, {
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  rmSync(join(targetDir, '.git'), { recursive: true, force: true })
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) walk(full, files)
    else if (stats.isFile()) files.push(full)
  }
  return files
}

function isTextFile(path) {
  const dot = path.lastIndexOf('.')
  const ext = dot === -1 ? '' : path.slice(dot)
  return TEXT_EXTENSIONS.has(ext) || ['Dockerfile', 'compose.yaml', 'render.yaml', 'lefthook.yml', 'turbo.json', 'biome.json'].includes(path.split('/').pop())
}

function renamePlaceholders(rootDir, name) {
  const scope = `@${name}`
  const dbName = `${name}-db`
  const webName = `${name}-web`

  for (const file of walk(rootDir)) {
    if (!isTextFile(file)) continue
    const original = readFileSync(file, 'utf8')
    // Match the scope when it prefixes a package path via either a plain slash
    // (`@starter/ui`) or a regex-escaped slash (`/^@starter\/db/` in arch specs).
    const scopeBeforePathSep = new RegExp(`${PLACEHOLDER_SCOPE}(?=[\\\\/])`, 'g')
    let content = original
      .replace(scopeBeforePathSep, scope)
      .replaceAll('starter-db', dbName)
      .replaceAll('starter-web', webName)
    // Only rewrite "name": "starter" in package.json files (avoid false positives elsewhere)
    if (file.endsWith('package.json')) {
      content = content.replace(/"name":\s*"starter"/g, `"name": "${name}"`)
    }
    // Devcontainer name
    if (file.endsWith('devcontainer.json')) {
      content = content.replace(/"name":\s*"starter"/g, `"name": "${name}"`)
    }
    if (content !== original) writeFileSync(file, content)
  }
}

function rewriteComposeCreds(rootDir, name) {
  const composePath = join(rootDir, 'compose.yaml')
  if (!existsSync(composePath)) return
  const original = readFileSync(composePath, 'utf8')
  const content = original
    .replaceAll('POSTGRES_USER: starter', `POSTGRES_USER: ${name}`)
    .replaceAll('POSTGRES_PASSWORD: starter', `POSTGRES_PASSWORD: ${name}`)
    .replaceAll('POSTGRES_DB: starter', `POSTGRES_DB: ${name}`)
    .replaceAll("pg_isready', '-U', 'starter'", `pg_isready', '-U', '${name}'`)
  if (content !== original) writeFileSync(composePath, content)
}

function rewriteRenderCreds(rootDir, name) {
  const renderPath = join(rootDir, 'render.yaml')
  if (!existsSync(renderPath)) return
  const original = readFileSync(renderPath, 'utf8')
  const content = original
    .replaceAll('databaseName: starter', `databaseName: ${name}`)
    .replaceAll('user: starter', `user: ${name}`)
  if (content !== original) writeFileSync(renderPath, content)
}

function rewriteCiCreds(rootDir, name) {
  const ciPath = join(rootDir, '.github/workflows/ci.yml')
  if (!existsSync(ciPath)) return
  const original = readFileSync(ciPath, 'utf8')
  const content = original
    .replaceAll('POSTGRES_USER: starter', `POSTGRES_USER: ${name}`)
    .replaceAll('POSTGRES_PASSWORD: starter', `POSTGRES_PASSWORD: ${name}`)
    .replaceAll('POSTGRES_DB: starter', `POSTGRES_DB: ${name}`)
    .replaceAll('postgresql://starter:starter@localhost:5432/starter', `postgresql://${name}:${name}@localhost:5432/${name}`)
  if (content !== original) writeFileSync(ciPath, content)
}

function gitInit(rootDir, name) {
  try {
    execSync('git init -q -b main', { cwd: rootDir, stdio: 'inherit' })
    execSync('git add .', { cwd: rootDir, stdio: 'inherit' })
    execSync(`git commit -q -m "chore: scaffold ${name} from @lunette/create"`, {
      cwd: rootDir,
      stdio: 'inherit',
    })
  } catch {
    // git missing or commit failed — non-fatal, the user can do it manually.
  }
}

async function main() {
  const { name } = parseArgs()
  const targetDir = resolve(cwd(), name)
  if (existsSync(targetDir)) {
    err(`Error: target directory "${name}" already exists.`)
    exit(1)
  }

  log(`Scaffolding "${name}" from ${TEMPLATE_REPO}@${TEMPLATE_REF}...`)

  // Download into a temp dir first, then rename — keeps the target untouched on failure.
  const stagingParent = mkdtempSync(join(tmpdir(), 'create-lunette-'))
  const stagingDir = join(stagingParent, 'staging')
  execSync(`mkdir -p "${stagingDir}"`, { stdio: 'ignore' })

  try {
    downloadTemplate(stagingDir)
    renamePlaceholders(stagingDir, name)
    rewriteComposeCreds(stagingDir, name)
    rewriteRenderCreds(stagingDir, name)
    rewriteCiCreds(stagingDir, name)
    renameSync(stagingDir, targetDir)
  } catch (e) {
    rmSync(stagingParent, { recursive: true, force: true })
    err(`\nScaffolding failed: ${e instanceof Error ? e.message : String(e)}`)
    exit(1)
  } finally {
    rmSync(stagingParent, { recursive: true, force: true })
  }

  gitInit(targetDir, name)

  log('')
  log(`✔ Created ${relative(cwd(), targetDir) || '.'}`)
  log('')
  log('Next steps:')
  log(`  cd ${name}`)
  log('  pnpm install')
  log('  pnpm infra:up')
  log('  pnpm dev')
}

main().catch((e) => {
  err(`\nUnexpected error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`)
  exit(1)
})
