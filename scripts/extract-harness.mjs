/**
 * Split the Host module source into a harness module that exports named helpers,
 * so the bundled test scripts never depend on Chinese literals surviving a
 * Windows text round-trip. This is test-only scaffolding.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? process.cwd();
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const body = source
  .replace(/^import[\s\S]*?from 'node:url';\n/m, '')
  .replace(/^const localRequire[\s\S]*?credentialKey = null; }\n/m, '')
  .replace(/^export const Config[\s\S]*?^\n/m, '')
  .replace(/^export const inject[\s\S]*?^\n/m, '')
  .replace(/^export const name[\s\S]*?^\n/m, '')
  .replace(/^export function apply[\s\S]*$/m, '');
const harness = [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "import os from 'node:os';",
  "import { execFile, execFileSync } from 'node:child_process';",
  "import { createRequire } from 'node:module';",
  "import { fileURLToPath } from 'node:url';",
  "const localRequire = createRequire(import.meta.url);",
  'let credentialKey = null;',
  body,
  'export { taskXml, runtimeConfig, readState, writeState, atomicWrite, ensureRunner, sealBytes,',
  '  taskNameFor, accountConfigPath, sealedPath, logPathFor, inWindow, minutes, clock,',
  '  STATE_DIR, STATE_FILE, CONFIG_DIR, LOG_DIR, TASK_PREFIX };',
  '',
].join('\n');
process.stdout.write(harness);
