#!/usr/bin/env node

/**
 * Database Table Verification Script
 * Checks if all Prisma models are created in the database
 */

const fs = require('fs');
const path = require('path');

async function verifyTables() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Database Table Verification                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Import Prisma client
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    console.log('📋 Checking Database Tables...\n');

    // List of expected models from schema.prisma
    const expectedModels = [
      'Design',
      'ShopifyOrder',
      'ProductClick',
      'ConversionEvent',
      'User',
      'Account',
      'Session',
      'VerificationToken',
      'AiDesignNotes',
      'ModelAsset',       // ✅ Catalog
      'CommerceMapping',  // ✅ Catalog
      'CatalogItem',      // ✅ Catalog
    ];

    const catalogModels = ['ModelAsset', 'CommerceMapping', 'CatalogItem'];

    // Try to query each model
    const results = {};
    let allSuccess = true;

    for (const model of expectedModels) {
      try {
        const isCatalog = catalogModels.includes(model);
        const icon = isCatalog ? '✅' : '📦';
        
        // Use different query approach based on model type
        if (model === 'ModelAsset' || model === 'CommerceMapping' || model === 'CatalogItem') {
          // Catalog models
          const count = await prisma[model[0].toLowerCase() + model.slice(1)].count();
          results[model] = { success: true, count, catalog: true };
          console.log(`${icon} ${model.padEnd(20)} ✓ Table exists (${count} records)`);
        } else {
          // Other models - just check if we can count
          const modelKey = model[0].toLowerCase() + model.slice(1);
          try {
            const count = await prisma[modelKey].count();
            results[model] = { success: true, count, catalog: false };
            console.log(`${icon} ${model.padEnd(20)} ✓ Table exists (${count} records)`);
          } catch (err) {
            throw err;
          }
        }
      } catch (error) {
        allSuccess = false;
        results[model] = { success: false, error: error.message };
        console.log(`❌ ${model.padEnd(20)} ✗ Error: ${error.message.substring(0, 50)}`);
      }
    }

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                      SUMMARY                               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const tableCount = Object.keys(results).length;
    const successCount = Object.values(results).filter(r => r.success).length;

    console.log(`📊 Tables Status: ${successCount}/${tableCount} tables verified\n`);

    // Group results
    console.log('🔧 Core Tables:');
    ['Design', 'ShopifyOrder', 'ProductClick', 'ConversionEvent', 'User', 'Account', 'Session', 'VerificationToken', 'AiDesignNotes'].forEach(model => {
      const result = results[model];
      const status = result.success ? '✓' : '✗';
      console.log(`  ${status} ${model}`);
    });

    console.log('\n📦 Catalog Tables (NEW):');
    catalogModels.forEach(model => {
      const result = results[model];
      const status = result.success ? '✓' : '✗';
      const recordCount = result.success ? ` (${result.count} records)` : '';
      console.log(`  ${status} ${model}${recordCount}`);
    });

    // Check catalog tables specifically
    if (results['ModelAsset'].success && results['CommerceMapping'].success && results['CatalogItem'].success) {
      console.log('\n✅ All catalog tables are ready for use!');
    } else {
      console.log('\n⚠️  Some catalog tables have issues. Please run: npx prisma db push');
    }

    await prisma.$disconnect();
    process.exit(allSuccess ? 0 : 1);
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyTables();
