// Lists every TODO(...) placeholder still in the repository. Run before meeting one;
// it exits 1 while any value from the Build plan's "values to fill in" table is missing.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, loadConfig, loadSessions, todayIn } from './sessions.mjs';

const SKIP = new Set(['node_modules', '.git', 'test']);
const SELF = 'scripts/check-launch.mjs';
const found = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    const rel = relative(ROOT, path);
    if (rel === SELF || rel === 'package-lock.json' || /\.(png|ico)$/.test(name)) continue;
    readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
      const m = line.match(/TODO\(([A-Z_]+)\)|TODO-[A-Z_]+/);
      if (m) found.push(`${rel}:${i + 1}: ${m[0]}`);
    });
  }
}
walk(ROOT);

const config = loadConfig();
if (!config.ospoEmail) found.push('config.yml: ospoEmail is empty (OSPO_EMAIL)');
const upcoming = loadSessions(config).filter((s) => !s.cancelled && s.date >= todayIn(config.timezone));
if (upcoming.length < 3) found.push(`sessions.yml: only ${upcoming.length} upcoming sessions listed; hand-list at least the next four or five`);

if (found.length) {
  console.error(`Not ready to launch. ${found.length} item(s):\n${[...new Set(found)].map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('No placeholders left; launch checks pass.');
