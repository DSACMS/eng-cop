// docs/form.json is the single source for the proposal form on the site, the
// issue template that receives it, and the parser that reads issues back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { stringify } from 'yaml';
import { ROOT, ConfigError } from './sessions.mjs';

// The compiler depends on these five ids. Renaming one is a code change, not a form edit.
export const REQUIRED_FIELD_IDS = ['session-date', 'presenter', 'talk-title', 'format', 'abstract'];

export const GENERATED_HEADER =
  '# GENERATED from docs/form.json and config.yml by scripts/gen-issue-template.mjs.\n' +
  '# Do not edit by hand: CI fails if this file differs from a fresh run.\n';

/** The text a person sees (and GitHub prefills) for a format, e.g. "Lightning talk (20 min)". */
export const formatOptionLabel = (f) => `${f.label} (${f.minutes} min)`;

export function parseForm(json) {
  const validate = new Ajv().compile(JSON.parse(readFileSync(join(ROOT, 'schemas/form.schema.json'), 'utf8')));
  if (!validate(json)) {
    const e = validate.errors[0];
    throw new ConfigError(`docs/form.json${e.instancePath}: ${e.message}`);
  }
  const ids = json.fields.map((f) => f.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new ConfigError(`docs/form.json: field id "${dup}" is used twice`);
  for (const id of REQUIRED_FIELD_IDS) {
    if (!ids.includes(id)) throw new ConfigError(`docs/form.json: field "${id}" is required by the schedule compiler`);
  }
  for (const f of json.fields) {
    if (f.type === 'dropdown' && !f.optionsFrom) throw new ConfigError(`docs/form.json: dropdown "${f.id}" needs optionsFrom`);
    if (f.pattern) {
      try { new RegExp(f.pattern); } catch { throw new ConfigError(`docs/form.json: field "${f.id}" has an invalid pattern`); }
    }
  }
  return json;
}

export function loadForm(path = join(ROOT, 'docs/form.json')) {
  return parseForm(JSON.parse(readFileSync(path, 'utf8')));
}

/** The issue-form template GitHub reads, derived from form.json + the format definitions. */
export function buildTemplate(form, config) {
  const body = [];
  if (form.template.intro) body.push({ type: 'markdown', attributes: { value: form.template.intro } });
  for (const f of form.fields) {
    const attributes = { label: f.label };
    if (f.help) attributes.description = f.help;
    if (f.type === 'dropdown') attributes.options = Object.values(config.formats).map(formatOptionLabel);
    else if (f.placeholder) attributes.placeholder = f.placeholder;
    body.push({ type: f.type, id: f.id, attributes, validations: { required: f.required } });
  }
  return {
    name: form.template.name,
    description: form.template.description,
    title: form.template.titlePrefix,
    labels: form.template.labels,
    body
  };
}

export function renderTemplate(form, config) {
  return GENERATED_HEADER + stringify(buildTemplate(form, config), { lineWidth: 0, version: '1.1' });
}
