// Serves docs/ over http for local work. With --fixture, /data/schedule.json is
// replaced by a generated schedule that shows every state. Default port 4173.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { ROOT, loadConfig, todayIn } from './sessions.mjs';
import { buildFixture } from './fixture.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' };
const useFixture = process.argv.includes('--fixture');
const portArg = process.argv.indexOf('--port');
const port = portArg === -1 ? 4173 : Number(process.argv[portArg + 1]);
const docs = join(ROOT, 'docs');

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    if (useFixture && path === '/data/schedule.json') {
      const body = JSON.stringify(buildFixture(todayIn(loadConfig().timezone)));
      res.writeHead(200, { 'content-type': TYPES['.json'] }).end(body);
      return;
    }
    const file = normalize(join(docs, path === '/' ? 'index.html' : path));
    if (!file.startsWith(docs)) throw new Error('outside docs');
    const data = await readFile(file); // read first: a missing file must not leave headers half-sent
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(data);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${port}/${useFixture ? '  (fixture data)' : ''}`);
});
