const { Client } = require('pg');

async function runMigrations() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('Connected to database');
    
    // Migration 005: Add WX_EXTREME and WIND_EXTREME
    console.log('Running migration 005: Add WX_EXTREME and WIND_EXTREME...');
    const res5 = await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'alert_type' AND e.enumlabel = 'WX_EXTREME') THEN
          ALTER TYPE alert_type ADD VALUE 'WX_EXTREME';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'alert_type' AND e.enumlabel = 'WIND_EXTREME') THEN
          ALTER TYPE alert_type ADD VALUE 'WIND_EXTREME';
        END IF;
      END$$;
    `);
    console.log('Migration 005 OK');
    
    // Migration 006: Add LIFR
    console.log('Running migration 006: Add LIFR...');
    const res6 = await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'alert_type' AND e.enumlabel = 'LIFR') THEN
          ALTER TYPE alert_type ADD VALUE 'LIFR';
        END IF;
      END$$;
    `);
    console.log('Migration 006 OK');
    
    // Verify the enum values
    const verify = await client.query(`
      SELECT e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      WHERE t.typname = 'alert_type' 
      ORDER BY e.enumsortorder;
    `);
    console.log('Current alert_type enum values:', verify.rows.map(r => r.enumlabel));
    
    console.log('All migrations completed successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
