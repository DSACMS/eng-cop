import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ROOT, ConfigError } from '../scripts/sessions.mjs';
import { parseForm, buildTemplate, renderTemplate, formatOptionLabel, REQUIRED_FIELD_IDS, RESERVED_FIELD_IDS } from '../scripts/form.mjs';
import { parseIssueBody, formatKeyFromLabel } from '../scripts/parse-issue.mjs';
import { config, form, body } from './helpers.mjs';

const committed = readFileSync(`${ROOT}/.github/ISSUE_TEMPLATE/${form.template.templateFile}`, 'utf8');

test('the committed talk.yml is exactly what the generator produces (CI drift check)', () => {
  assert.equal(committed, renderTemplate(form, config));
});

test('template field ids equal form.json ids, in order', () => {
  const tpl = parse(committed);
  const ids = tpl.body.filter((b) => b.id).map((b) => b.id);
  assert.deepEqual(ids, form.fields.map((f) => f.id));
  assert.deepEqual(ids, REQUIRED_FIELD_IDS);
});

test('the title field is talk-title, never "title", and the template applies the talk label', () => {
  assert.ok(form.fields.some((f) => f.id === 'talk-title'));
  assert.ok(!form.fields.some((f) => f.id === 'title'));
  const tpl = parse(committed);
  assert.deepEqual(tpl.labels, ['talk']);
  assert.ok(!tpl.labels.includes('approved'), 'approved must never arrive with the form');
  assert.equal(tpl.title, '[Talk] ');
});

test('format options come from config.yml, so a new format is one edit', () => {
  const more = { ...config, formats: { ...config.formats, panel: { label: 'Panel', minutes: 40 } } };
  const opts = buildTemplate(form, more).body.find((b) => b.id === 'talk-format').attributes.options;
  assert.ok(opts.includes('Panel (40 min)'));
});

test('the generated YAML survives a YAML 1.1 reader (GitHub): no date-looking scalars', () => {
  const tpl = parse(committed, { version: '1.1' });
  assert.equal(typeof tpl.body.find((b) => b.id === 'session-date').attributes.placeholder, 'string');
});

test('parseForm rejects duplicate ids, a missing compiler field, and a dropdown without a source', () => {
  const clone = () => JSON.parse(JSON.stringify(form));
  const dup = clone(); dup.fields.push({ ...dup.fields[0] });
  assert.throws(() => parseForm(dup), ConfigError);
  const miss = clone(); miss.fields = miss.fields.filter((f) => f.id !== 'talk-format');
  assert.throws(() => parseForm(miss), /"talk-format" is required/);
  const dd = clone(); delete dd.fields.find((f) => f.id === 'talk-format').optionsFrom;
  assert.throws(() => parseForm(dd), ConfigError);
});

test('parseIssueBody reads every field back, including multi-line abstracts and empty answers', () => {
  const { fields, missing } = parseIssueBody(body({ abstract: 'Line one.\n\nLine two.' }), form);
  assert.deepEqual(missing, []);
  assert.equal(fields.presenter, 'j-okafor');
  assert.equal(fields.abstract, 'Line one.\n\nLine two.');
  assert.equal(parseIssueBody(body(), form).fields.abstract, '', '_No response_ becomes empty');
});

test('parseIssueBody tolerates CRLF and reports missing fields', () => {
  const crlf = body().replace(/\n/g, '\r\n');
  assert.equal(parseIssueBody(crlf, form).fields['talk-title'], 'Load-testing a FHIR endpoint');
  const partial = parseIssueBody('### Session date\n\n2026-10-08', form);
  assert.deepEqual(partial.missing, ['presenter', 'talk-title', 'talk-format', 'abstract']);
  assert.deepEqual(parseIssueBody(undefined, form).missing.length, 5);
});

test('formatKeyFromLabel round-trips every format', () => {
  for (const [key, f] of Object.entries(config.formats)) assert.equal(formatKeyFromLabel(formatOptionLabel(f), config), key);
  assert.equal(formatKeyFromLabel('Keynote (90 min)', config), null);
});

test('no field id is a name GitHub or Rails treats specially (the "format" id caused HTTP 406 on /issues/new)', () => {
  for (const f of form.fields) assert.ok(!RESERVED_FIELD_IDS.includes(f.id), `${f.id} is reserved`);
  const bad = JSON.parse(JSON.stringify(form));
  bad.fields.find((f) => f.id === 'talk-format').id = 'format';
  assert.throws(() => parseForm(bad), /reserved/);
});
