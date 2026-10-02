// Writes the issue template (.github/ISSUE_TEMPLATE/talk.yml) from docs/form.json and config.yml.
// With --check, writes nothing and exits 1 if the committed template is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ROOT, ConfigError, loadConfig } from './sessions.mjs';
import { loadForm, renderTemplate } from './form.mjs';

export const templatePath = (form) => join(ROOT, '.github/ISSUE_TEMPLATE', form.template.templateFile);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const form = loadForm();
    const path = templatePath(form);
    const fresh = renderTemplate(form, loadConfig());
    if (process.argv.includes('--check')) {
      let committed = '';
      try { committed = readFileSync(path, 'utf8'); } catch { /* missing counts as stale */ }
      if (committed !== fresh) {
        console.error(`${path.replace(`${ROOT}/`, '')} is out of date. Run "npm run gen:template" and commit the result.`);
        process.exit(1);
      }
      console.log(`${form.template.templateFile} matches docs/form.json and config.yml.`);
    } else {
      writeFileSync(path, fresh);
      console.log(`Wrote ${path.replace(`${ROOT}/`, '')}`);
    }
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
}
