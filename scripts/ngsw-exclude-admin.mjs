// Removes admin-only lazy chunks from the service worker precache (ngsw.json) after `ng build`.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('dist', 'contest-pwa', 'browser');
const ADMIN_MARKER = 'Admin dashboard'; // route title that only exists in admin.routes
const ngswPath = join(dir, 'ngsw.json');
if (!existsSync(ngswPath)) process.exit(0);

const js = readdirSync(dir).filter((f) => f.endsWith('.js') && /^(main|chunk)-/.test(f));
const src = new Map(js.map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
const deps = (f) => [...new Set([...src.get(f).matchAll(/["'`]\.\/((?:chunk|main)-[\w-]+\.js)["'`]/g)].map((m) => m[1]))];

const reach = (start, skip = new Set()) => {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || skip.has(f) || !src.has(f)) continue;
    seen.add(f);
    stack.push(...deps(f));
  }
  return seen;
};

const main = js.find((f) => f.startsWith('main-'));
const hasMarker = (f) => src.get(f).includes(ADMIN_MARKER);
// The lazy entry imported by main whose graph contains the admin routes.
const adminRoot = deps(main).find((f) => f !== main && [...reach(f, new Set([main]))].some(hasMarker));
if (!adminRoot) {
  console.warn('ngsw-exclude-admin: admin chunk not found; precache unchanged.');
  process.exit(0);
}

// Everything the contest needs: reachable from main without entering the admin entry.
const contest = reach(main, new Set([adminRoot]));
const adminOnly = [...reach(adminRoot, new Set([main]))].filter((f) => !contest.has(f));

const ngsw = JSON.parse(readFileSync(ngswPath, 'utf8'));
for (const g of ngsw.assetGroups) g.urls = g.urls.filter((u) => !adminOnly.includes(u.slice(1)));
for (const f of adminOnly) delete ngsw.hashTable[`/${f}`];
writeFileSync(ngswPath, JSON.stringify(ngsw));
console.log(`ngsw-exclude-admin: removed from precache: ${adminOnly.join(', ')}`);
