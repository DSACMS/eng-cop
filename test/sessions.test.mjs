import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOT, ConfigError, parseConfig, parseSessions, loadConfig, loadSessions, todayIn, isRealDate
} from '../scripts/sessions.mjs';

const configText = readFileSync(`${ROOT}/config.yml`, 'utf8');
const config = loadConfig();

const sum = (slots) => slots.reduce((n, s) => n + (s.to - s.from), 0);
const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof ConfigError && pattern.test(e.message));

test('the committed files give five sessions in date order', () => {
  const sessions = loadSessions(config);
  assert.equal(sessions.length, 5);
  assert.deepEqual(sessions.map((s) => s.date), [...sessions.map((s) => s.date)].sort());
});

test('unquoted dates stay strings (no Date objects)', () => {
  const [s] = parseSessions('sessions:\n  - date: 2026-10-08\n', config);
  assert.equal(typeof s.date, 'string');
  assert.equal(s.date, '2026-10-08');
});

test('every non-cancelled session adds up to exactly 60 minutes, for all four layouts', () => {
  const text = ['default', 'lightning', 'presentation', 'full']
    .map((l, i) => `  - date: 2026-10-${String(10 + i).padStart(2, '0')}\n    layout: ${l}`)
    .join('\n');
  const sessions = parseSessions(`sessions:\n${text}\n`, config);
  assert.equal(sessions.length, 4);
  for (const s of sessions) assert.equal(sum(s.slots), 60, s.layout);
  assert.equal(sessions[0].slots[0].kind, 'round-robin');
});

test('layouts expand to round robin, talk slots, then open discussion for leftovers', () => {
  const kinds = (layout) => parseSessions(`sessions:\n  - date: 2026-10-08\n    layout: ${layout}\n`, config)[0].slots
    .map((s) => (s.kind === 'talk' ? s.format : s.kind));
  assert.deepEqual(kinds('default'), ['round-robin', 'lightning', 'presentation']);
  assert.deepEqual(kinds('lightning'), ['round-robin', 'lightning', 'discussion']);
  assert.deepEqual(kinds('presentation'), ['round-robin', 'presentation', 'discussion']);
  assert.deepEqual(kinds('full'), ['round-robin', 'full']);
});

test('talk slots start open', () => {
  const [s] = parseSessions('sessions:\n  - date: 2026-10-08\n', config);
  assert.deepEqual(s.slots.filter((x) => x.kind === 'talk').map((x) => x.state), ['open', 'open']);
});

test('a cancelled date carries its reason and no slots', () => {
  const [s] = parseSessions('sessions:\n  - date: 2026-10-08\n    cancelled: CMS all-hands\n', config);
  assert.deepEqual(s, { date: '2026-10-08', cancelled: 'CMS all-hands' });
});

test('sessions are returned in date order even when listed out of order', () => {
  const out = parseSessions('sessions:\n  - date: 2026-11-01\n  - date: 2026-10-01\n', config);
  assert.deepEqual(out.map((s) => s.date), ['2026-10-01', '2026-11-01']);
});

test('an unknown key fails and names the line', () => {
  fails(() => parseSessions('sessions:\n  - date: 2026-10-08\n    layuot: full\n', config), /^sessions\.yml:3: unknown key "layuot"/);
});

test('an unknown layout fails and names the line', () => {
  fails(() => parseSessions('sessions:\n  - date: 2026-10-08\n  - date: 2026-10-22\n    layout: huge\n', config), /^sessions\.yml:4: unknown layout "huge"/);
});

test('a date that is not a real calendar date fails and names the line', () => {
  fails(() => parseSessions('sessions:\n  - date: 2026-10-08\n  - date: 2026-02-30\n', config), /^sessions\.yml:3: "2026-02-30" is not a real calendar date/);
});

test('a malformed date fails', () => {
  fails(() => parseSessions('sessions:\n  - date: next friday\n', config), /^sessions\.yml:2:/);
});

test('a date listed twice fails', () => {
  fails(() => parseSessions('sessions:\n  - date: 2026-10-08\n  - date: 2026-10-08\n', config), /^sessions\.yml:3: 2026-10-08 is listed twice/);
});

test('broken YAML fails with a line number, not a half-built schedule', () => {
  fails(() => parseSessions('sessions:\n  - date: 2026-10-08\n   layout: [oops\n', config), /^sessions\.yml:\d+:/);
});

test('a layout whose talks exceed the time after the round robin fails and names the line', () => {
  const bad = configText.replace('default:      [lightning, presentation]', 'default:      [lightning, presentation, lightning]');
  fails(() => parseConfig(bad), /^config\.yml:\d+: layout "default" needs 70 minutes of talks but only 50 fit/);
});

test('a layout naming an unknown format fails', () => {
  const bad = configText.replace('full:         [full]', 'full:         [keynote]');
  fails(() => parseConfig(bad), /^config\.yml:\d+: layout "full" uses unknown format "keynote"/);
});

test('config requires a default layout and a real timezone', () => {
  fails(() => parseConfig(configText.replace('timezone: America/New_York', 'timezone: Mars/Olympus')), /not a known timezone/);
  fails(() => parseConfig(configText.replace('  default:      [lightning, presentation]\n', '')), /"default" is required/);
});

test('config rejects unknown keys', () => {
  fails(() => parseConfig(`${configText}\nextra: 1\n`), /^config\.yml:\d+: unknown key "extra"/);
});

test('isRealDate and todayIn', () => {
  assert.ok(isRealDate('2028-02-29'));
  assert.ok(!isRealDate('2026-02-29'));
  assert.ok(!isRealDate('2026-13-01'));
  // 03:00 UTC on the 9th is still the 8th in New York.
  assert.equal(todayIn('America/New_York', new Date('2026-10-09T03:00:00Z')), '2026-10-08');
  assert.equal(todayIn('UTC', new Date('2026-10-09T03:00:00Z')), '2026-10-09');
});
