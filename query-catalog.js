#!/usr/bin/env node

let exec;

async function ensureExec() {
  if (exec) return exec;
  ({ exec } = await import('node:child_process'));
  return exec;
}

async function queryDatabase(sqlQuery) {
  const execFn = await ensureExec();
  return new Promise((resolve, reject) => {
    const command = `cd /Users/justus/Documents/Interior-AI/interior-ai && npx prisma db execute --stdin`;
    const child = execFn(command, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
    child.stdin.write(sqlQuery);
    child.stdin.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     DATABASE BROWSER (Alternative to Prisma Studio)        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('📋 Catalog Tables:\n');

    // Show ModelAsset data
    console.log('1️⃣  ModelAsset Records:');
    const modelAssets = await queryDatabase('SELECT id, slug, status FROM "ModelAsset" LIMIT 5;');
    console.log(modelAssets || '   (No records yet)\n');

    // Show CatalogItem data
    console.log('2️⃣  CatalogItem Records:');
    const catalogItems = await queryDatabase('SELECT id, slug, title, category FROM "CatalogItem" LIMIT 5;');
    console.log(catalogItems || '   (No records yet)\n');

    // Show CommerceMapping data
    console.log('3️⃣  CommerceMapping Records:');
    const commerce = await queryDatabase('SELECT id, mappingType FROM "CommerceMapping" LIMIT 5;');
    console.log(commerce || '   (No records yet)\n');

    // Table counts
    console.log('📊 Table Statistics:');
    const tableStats = await queryDatabase(`
      SELECT 
        (SELECT COUNT(*) FROM "ModelAsset") as model_assets,
        (SELECT COUNT(*) FROM "CatalogItem") as catalog_items,
        (SELECT COUNT(*) FROM "CommerceMapping") as commerce_mappings;
    `);
    console.log(tableStats);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
