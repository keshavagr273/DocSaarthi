#!/usr/bin/env node
/**
 * Applies packages/database/prisma/sql/001_vector_and_search_indexes.sql.
 *
 * Prisma cannot model pgvector's `vector` type, so the embedding column and
 * the search indexes live in raw SQL and are applied by this script. It is
 * idempotent — run it after every `prisma migrate deploy` / `prisma db push`.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const SQL_FILE = path.join(
  __dirname,
  '..',
  'packages',
  'database',
  'prisma',
  'sql',
  '001_vector_and_search_indexes.sql',
);

/**
 * Split on semicolons at end-of-statement. The file contains no functions,
 * dollar-quoted bodies or string literals with semicolons, so this is safe.
 */
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const statements = splitStatements(sql);
  const prisma = new PrismaClient();

  try {
    for (const statement of statements) {
      const label = statement.replace(/\s+/g, ' ').slice(0, 80);
      process.stdout.write(`→ ${label}...\n`);
      await prisma.$executeRawUnsafe(statement);
    }
    console.log(`\n✅ Applied ${statements.length} statements. Search schema is ready.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ Failed to apply search schema:', err.message ?? err);
  process.exit(1);
});
