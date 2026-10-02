// dcore-explore — read-only repository intelligence. Pure node:fs (no network, no subprocess, no writes).
// Answers "what is this project and how do I build/test/run it?" from files actually present. Secret files are
// reported by NAME only (never read); agent/VCS/dependency dirs are skipped. Deterministic (sorted) output.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, extname, basename } from 'node:path';

const SKIP_DIR = new Set(['.git', '.hg', '.svn', 'node_modules', '.ssh', 'dist', 'build', 'out', '.next', '.nuxt', 'target', '.cache', 'coverage', '.venv', 'venv', '__pycache__', 'vendor', '.claude', '.paysec', '.dcore', '.idea', '.vscode', '.gradle']);
const SECRET_NAME = /^(\.env(\..*)?|\.credentials.*|credentials\.json|\.git-credentials|\.npmrc|\.pypirc|id_rsa.*|.*\.(pem|key|p12|pfx|keystore|pk8))$/i;
const LANG = { '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JavaScript', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.py': 'Python', '.java': 'Java', '.kt': 'Kotlin', '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.swift': 'Swift', '.c': 'C', '.cpp': 'C++', '.h': 'C/C++ header', '.scala': 'Scala', '.sql': 'SQL', '.sh': 'Shell', '.ps1': 'PowerShell', '.vue': 'Vue', '.svelte': 'Svelte', '.dart': 'Dart' };
const MANIFESTS = ['package.json', 'pnpm-workspace.yaml', 'tsconfig.json', 'pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'Gemfile', 'composer.json', 'Makefile', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml', 'Procfile', 'serverless.yml', 'vercel.json', 'netlify.toml', 'fly.toml', 'app.yaml', 'Chart.yaml', 'main.tf', 'openapi.yaml', 'openapi.json', 'swagger.json', 'swagger.yaml'];
const LOCKS = { 'package-lock.json': 'npm', 'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn', 'bun.lockb': 'bun', 'bun.lock': 'bun', 'poetry.lock': 'poetry', 'Pipfile.lock': 'pipenv', 'Cargo.lock': 'cargo', 'go.sum': 'go', 'Gemfile.lock': 'bundler', 'composer.lock': 'composer' };
const FRAMEWORKS = { react: 'React', next: 'Next.js', vue: 'Vue', nuxt: 'Nuxt', '@angular/core': 'Angular', svelte: 'Svelte', express: 'Express', fastify: 'Fastify', '@nestjs/core': 'NestJS', koa: 'Koa', hono: 'Hono', django: 'Django', flask: 'Flask', fastapi: 'FastAPI', 'spring-boot': 'Spring Boot', rails: 'Rails', laravel: 'Laravel', electron: 'Electron', 'react-native': 'React Native' };
const TEST_FW = { jest: 'Jest', vitest: 'Vitest', mocha: 'Mocha', ava: 'AVA', '@playwright/test': 'Playwright', playwright: 'Playwright', cypress: 'Cypress', pytest: 'pytest', junit: 'JUnit', 'junit-jupiter': 'JUnit 5', testng: 'TestNG', rspec: 'RSpec', phpunit: 'PHPUnit' };
const INTEGRATIONS = { stripe: 'Stripe', 'aws-sdk': 'AWS SDK', '@aws-sdk': 'AWS SDK v3', pg: 'PostgreSQL', mysql: 'MySQL', mysql2: 'MySQL', mongoose: 'MongoDB', mongodb: 'MongoDB', redis: 'Redis', ioredis: 'Redis', kafkajs: 'Kafka', amqplib: 'RabbitMQ', prisma: 'Prisma', '@prisma/client': 'Prisma', typeorm: 'TypeORM', sequelize: 'Sequelize', knex: 'Knex', axios: 'HTTP client (axios)', 'node-fetch': 'HTTP client', '@sentry/node': 'Sentry', 'firebase-admin': 'Firebase', twilio: 'Twilio', sendgrid: 'SendGrid', '@sendgrid/mail': 'SendGrid', psycopg2: 'PostgreSQL', sqlalchemy: 'SQLAlchemy', celery: 'Celery', boto3: 'AWS SDK (boto3)', requests: 'HTTP client (requests)' };

function safeJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
function safeText(p, max = 200_000) { try { const s = readFileSync(p, 'utf8'); return s.length > max ? s.slice(0, max) : s; } catch { return ''; } }

function walk(root, { maxFiles = 20000 } = {}) {
  const files = [];
  const secrets = [];
  const stack = [root];
  while (stack.length && files.length < maxFiles) {
    const dir = stack.pop();
    let names; try { names = readdirSync(dir).sort(); } catch { continue; }
    for (const name of names) {
      const p = join(dir, name);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (!SKIP_DIR.has(name)) stack.push(p); continue; }
      const rel = relative(root, p).replace(/\\/g, '/');
      if (SECRET_NAME.test(name)) { secrets.push(rel); continue; }
      files.push(rel);
    }
  }
  return { files: files.sort(), secrets: secrets.sort(), truncated: files.length >= maxFiles };
}

// Commands a maintainer would run, discovered from manifests actually present (root + one level of packages).
export function discoverCommands(repo) {
  const root = resolve(repo);
  const cmds = [];
  const add = (kind, command, source, cwd = '.') => cmds.push({ kind, command, source, cwd });
  const dirs = ['.'];
  try { for (const n of readdirSync(root).sort()) { if (!SKIP_DIR.has(n) && !n.startsWith('.')) { try { if (statSync(join(root, n)).isDirectory() && existsSync(join(root, n, 'package.json'))) dirs.push(n); } catch { /* ignore */ } } } } catch { /* ignore */ }
  for (const d of dirs) {
    const pj = safeJson(join(root, d, 'package.json'));
    if (!pj) continue;
    const pm = existsSync(join(root, d, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(root, d, 'yarn.lock')) ? 'yarn' : (existsSync(join(root, d, 'bun.lockb')) || existsSync(join(root, d, 'bun.lock'))) ? 'bun' : 'npm';
    for (const name of Object.keys(pj.scripts ?? {}).sort()) {
      const kind = /^test|:test|^spec/.test(name) ? 'test' : /lint|eslint|format:check|prettier/.test(name) ? 'lint' : /typecheck|type-check|tsc|types/.test(name) ? 'typecheck' : /^build|:build/.test(name) ? 'build' : /^(dev|start|serve|preview)/.test(name) ? 'run' : 'script';
      add(kind, `${pm} run ${name}`, `${d === '.' ? '' : d + '/'}package.json#scripts.${name}`, d);
    }
  }
  if (existsSync(join(root, 'Makefile'))) for (const m of safeText(join(root, 'Makefile')).matchAll(/^([A-Za-z][\w-]*):(?!=)/gm)) add(/test/.test(m[1]) ? 'test' : /lint/.test(m[1]) ? 'lint' : /build/.test(m[1]) ? 'build' : 'script', `make ${m[1]}`, 'Makefile');
  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'pytest.ini')) || existsSync(join(root, 'setup.cfg'))) { if (/pytest/.test(safeText(join(root, 'pyproject.toml')) + safeText(join(root, 'requirements.txt')) + (existsSync(join(root, 'pytest.ini')) ? 'pytest' : ''))) add('test', 'python -m pytest', 'pyproject/pytest'); }
  if (existsSync(join(root, 'go.mod'))) { add('test', 'go test ./...', 'go.mod'); add('build', 'go build ./...', 'go.mod'); add('lint', 'go vet ./...', 'go.mod'); }
  if (existsSync(join(root, 'Cargo.toml'))) { add('test', 'cargo test', 'Cargo.toml'); add('build', 'cargo build', 'Cargo.toml'); add('lint', 'cargo clippy', 'Cargo.toml'); }
  if (existsSync(join(root, 'pom.xml'))) { add('test', 'mvn -q test', 'pom.xml'); add('build', 'mvn -q package -DskipTests', 'pom.xml'); }
  if (existsSync(join(root, 'build.gradle')) || existsSync(join(root, 'build.gradle.kts'))) { const gw = existsSync(join(root, 'gradlew')) ? (process.platform === 'win32' ? 'gradlew.bat' : './gradlew') : 'gradle'; add('test', `${gw} test`, 'build.gradle'); add('build', `${gw} build -x test`, 'build.gradle'); }
  if (existsSync(join(root, 'Gemfile'))) add('test', existsSync(join(root, 'spec')) ? 'bundle exec rspec' : 'bundle exec rake test', 'Gemfile');
  if (existsSync(join(root, 'composer.json'))) add('test', 'vendor/bin/phpunit', 'composer.json');
  return cmds;
}

export function dcoreExplore(_input, opts = {}) {
  const base = { module_id: 'dcore-explore' };
  if (!opts.repo) return { ...base, error: 'dcore-explore needs --repo <path> (use --repo . for the project root)', repo: null };
  const root = resolve(opts.repo);
  if (!existsSync(root) || !statSync(root).isDirectory()) return { ...base, error: `repo not found or not a directory: ${opts.repo}`, repo: opts.repo };
  const { files, secrets, truncated } = walk(root);
  const langs = {};
  for (const f of files) { const l = LANG[extname(f).toLowerCase()]; if (l) langs[l] = (langs[l] ?? 0) + 1; }
  const languages = Object.entries(langs).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([language, files]) => ({ language, files }));
  const manifests = files.filter((f) => MANIFESTS.includes(basename(f)) && f.split('/').length <= 3);
  const lockfiles = files.filter((f) => LOCKS[basename(f)] && f.split('/').length <= 2).map((f) => ({ file: f, manager: LOCKS[basename(f)] }));
  // dependency names from package.json / requirements / pyproject / pom / gradle / go.mod (literal names only)
  const deps = new Set();
  for (const f of manifests) {
    const p = join(root, f);
    if (basename(f) === 'package.json') { const pj = safeJson(p) ?? {}; for (const k of ['dependencies', 'devDependencies', 'peerDependencies']) for (const d of Object.keys(pj[k] ?? {})) deps.add(d); }
    else if (/requirements\.txt|pyproject\.toml|Pipfile|setup\.py/.test(f)) for (const m of safeText(p).matchAll(/^\s*["']?([A-Za-z][\w.-]+)/gm)) deps.add(m[1].toLowerCase());
    else if (/pom\.xml/.test(f)) for (const m of safeText(p).matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) deps.add(m[1]);
    else if (/build\.gradle/.test(f)) for (const m of safeText(p).matchAll(/['"]([\w.-]+):([\w.-]+)(?::[\w.-]+)?['"]/g)) deps.add(m[2]);
    else if (/go\.mod/.test(f)) for (const m of safeText(p).matchAll(/^\s*([\w.-]+\/[\w./-]+)\s+v/gm)) deps.add(m[1]);
  }
  const depList = [...deps];
  const match = (table) => [...new Set(depList.flatMap((d) => Object.entries(table).filter(([k]) => d === k || d.startsWith(k + '/') || (k.endsWith('-boot') && d.includes(k))).map(([, v]) => v)))].sort();
  const pj = safeJson(join(root, 'package.json')) ?? {};
  const entryCandidates = ['src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js', 'index.js', 'index.ts', 'server.js', 'app.js', 'main.go', 'cmd/main.go', 'app.py', 'main.py', 'manage.py', 'wsgi.py', 'src/main/java', 'src/App.tsx', 'src/App.jsx', 'pages/index.tsx', 'app/page.tsx'];
  const entry_points = [
    ...(pj.main ? [`package.json main: ${pj.main}`] : []),
    ...(pj.bin ? [`package.json bin: ${typeof pj.bin === 'string' ? pj.bin : Object.values(pj.bin).join(', ')}`] : []),
    ...entryCandidates.filter((c) => files.some((f) => f === c || f.startsWith(c + '/'))),
  ];
  const ci = files.filter((f) => /^\.github\/workflows\/|^\.gitlab-ci\.yml$|^Jenkinsfile$|^azure-pipelines\.yml$|^\.circleci\//.test(f));
  const test_dirs = [...new Set(files.filter((f) => /(^|\/)(test|tests|__tests__|spec|e2e)\//.test(f)).map((f) => f.split('/').slice(0, f.split('/').findIndex((s) => /^(test|tests|__tests__|spec|e2e)$/.test(s)) + 1).join('/')))].sort().slice(0, 20);
  const config = files.filter((f) => /(^|\/)(\.env\.example|\.env\.sample|config\.(json|ya?ml|toml|js|ts)|settings\.py|application\.(ya?ml|properties)|appsettings\.json)$/.test(f)).slice(0, 30);
  const project_types = [
    ...(files.includes('package.json') ? ['Node.js package'] : []), ...(manifests.some((m) => /pyproject|requirements|setup\.py|Pipfile/.test(m)) ? ['Python project'] : []),
    ...(files.includes('go.mod') ? ['Go module'] : []), ...(files.includes('Cargo.toml') ? ['Rust crate'] : []), ...(manifests.some((m) => /pom\.xml|build\.gradle/.test(m)) ? ['JVM project'] : []),
    ...(manifests.some((m) => /Dockerfile|compose/.test(m)) ? ['containerized'] : []), ...(files.some((f) => /(^|\/)SKILL\.md$/.test(f)) ? ['Claude Code skill'] : []),
  ];
  return {
    ...base, repo: opts.repo, project_types, languages, manifests, lockfiles,
    frameworks: match(FRAMEWORKS), test_frameworks: match(TEST_FW), integrations: match(INTEGRATIONS),
    commands: discoverCommands(root), entry_points, test_dirs, ci, config_files: config,
    sensitive_files_present: secrets, files_scanned: files.length,
    notes: [
      'read-only: no file was modified; sensitive files are listed by name only and never read',
      ...(truncated ? ['file walk truncated at 20000 files'] : []),
      ...(lockfiles.length === 0 && files.includes('package.json') ? ['no lockfile next to package.json: installs are not reproducible'] : []),
    ],
  };
}
