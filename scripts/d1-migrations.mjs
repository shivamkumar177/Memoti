// npm run db:migrations — writes src/db/schema.ts's MIGRATIONS as D1 migration
// files, so the device and D1 schemas come from one list.
import { mkdirSync, writeFileSync } from 'node:fs';
import { MIGRATIONS } from '../src/db/schema.ts';

const dir = new URL('../worker/migrations/', import.meta.url);
mkdirSync(dir, { recursive: true });
MIGRATIONS.forEach((sql, i) => {
  const name = `${String(i + 1).padStart(4, '0')}_schema.sql`;
  writeFileSync(new URL(name, dir), `-- Generated from src/db/schema.ts; edit there.\n${sql.trim()}\n`);
});
console.log(`${MIGRATIONS.length} migrations written`);
