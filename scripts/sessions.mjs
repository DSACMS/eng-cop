// Loads config.yml and sessions.yml, validates them, and expands each session's
// layout into slots. Run directly (`npm run validate`) to check both files.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv';
// `yaml`, not `js-yaml`: js-yaml turns unquoted dates into Date objects (timezone bugs).
import { parseDocument, LineCounter } from 'yaml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SESSION_MINUTES = 60;

export class ConfigError extends Error {}

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const ajv = new Ajv({ allErrors: true });
const validators = {};
function validatorFor(name) {
  return (validators[name] ??= ajv.compile(readJson(`schemas/${name}.schema.json`)));
}

// ---------- YAML with line numbers ----------

function parseYaml(text, file) {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });
  if (doc.errors.length) {
    const e = doc.errors[0];
    const line = e.linePos?.[0]?.line ?? 1;
    throw new ConfigError(`${file}:${line}: ${e.message.split('\n')[0]}`);
  }
  return { doc, lc, data: doc.toJS() ?? {} };
}

function lineAt({ doc, lc }, path) {
  const p = [...path];
  let node;
  while (p.length && !(node = doc.getIn(p, true))) p.pop();
  node ??= doc.contents;
  return lc.linePos(node?.range?.[0] ?? 0).line;
}

const toPath = (ptr) => ptr.split('/').slice(1).map((s) => (/^\d+$/.test(s) ? Number(s) : s));

function schemaCheck(parsed, schemaName, file) {
  const validate = validatorFor(schemaName);
  if (validate(parsed.data)) return;
  const e = validate.errors[0];
  const path = toPath(e.instancePath);
  let what;
  if (e.keyword === 'additionalProperties') {
    path.push(e.params.additionalProperty);
    what = `unknown key "${e.params.additionalProperty}"`;
  } else if (e.keyword === 'required') {
    what = `missing required key "${e.params.missingProperty}"`;
  } else {
    const where = path.length ? `"${path.join('.')}" ` : '';
    what = `${where}${e.message}`;
  }
  throw new ConfigError(`${file}:${lineAt(parsed, path)}: ${what}`);
}

// ---------- Dates ----------

export function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ---------- config.yml ----------

export function parseConfig(text, file = 'config.yml') {
  const parsed = parseYaml(text, file);
  schemaCheck(parsed, 'config', file);
  const c = parsed.data;
  const fail = (path, msg) => { throw new ConfigError(`${file}:${lineAt(parsed, path)}: ${msg}`); };

  try { new Intl.DateTimeFormat('en-US', { timeZone: c.timezone }); }
  catch { fail(['timezone'], `"${c.timezone}" is not a known timezone`); }

  if (!c.layouts.default) fail(['layouts'], 'a layout named "default" is required');
  const room = SESSION_MINUTES - c.roundRobinMinutes;
  for (const [name, formats] of Object.entries(c.layouts)) {
    let total = 0;
    formats.forEach((f, i) => {
      if (!c.formats[f]) fail(['layouts', name, i], `layout "${name}" uses unknown format "${f}"`);
      total += c.formats[f].minutes;
    });
    if (total > room) {
      fail(['layouts', name], `layout "${name}" needs ${total} minutes of talks but only ${room} fit after the ${c.roundRobinMinutes}-minute round robin`);
    }
  }
  return c;
}

/** Round robin, one slot per talk, then open discussion for any time left over. */
export function expandLayout(config, layoutName) {
  const slots = [{ kind: 'round-robin', from: 0, to: config.roundRobinMinutes, label: 'Round robin' }];
  let cursor = config.roundRobinMinutes;
  for (const format of config.layouts[layoutName]) {
    const to = cursor + config.formats[format].minutes;
    slots.push({ kind: 'talk', format, from: cursor, to, state: 'open' });
    cursor = to;
  }
  if (cursor < SESSION_MINUTES) {
    slots.push({ kind: 'discussion', from: cursor, to: SESSION_MINUTES, label: 'Open discussion' });
  }
  return slots;
}

// ---------- sessions.yml ----------

export function parseSessions(text, config, file = 'sessions.yml') {
  const parsed = parseYaml(text, file);
  schemaCheck(parsed, 'sessions', file);
  const fail = (path, msg) => { throw new ConfigError(`${file}:${lineAt(parsed, path)}: ${msg}`); };

  const seen = new Set();
  const out = parsed.data.sessions.map((s, i) => {
    if (!isRealDate(s.date)) fail(['sessions', i, 'date'], `"${s.date}" is not a real calendar date`);
    if (seen.has(s.date)) fail(['sessions', i, 'date'], `${s.date} is listed twice`);
    seen.add(s.date);
    if (s.cancelled) return { date: s.date, cancelled: s.cancelled };
    const layout = s.layout ?? 'default';
    if (!config.layouts[layout]) {
      fail(['sessions', i, 'layout'], `unknown layout "${layout}" (known: ${Object.keys(config.layouts).join(', ')})`);
    }
    return { date: s.date, layout, slots: expandLayout(config, layout) };
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- File loaders ----------

export function loadConfig(path = join(ROOT, 'config.yml')) {
  return parseConfig(readFileSync(path, 'utf8'), 'config.yml');
}

export function loadSessions(config, path = join(ROOT, 'sessions.yml')) {
  return parseSessions(readFileSync(path, 'utf8'), config, 'sessions.yml');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const config = loadConfig();
    const sessions = loadSessions(config);
    const cancelled = sessions.filter((s) => s.cancelled).length;
    console.log(`config.yml and sessions.yml are valid: ${sessions.length} sessions (${cancelled} cancelled).`);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(process.env.GITHUB_ACTIONS ? `::error::${err.message}` : err.message);
    process.exit(1);
  }
}
