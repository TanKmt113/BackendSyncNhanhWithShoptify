
import sequelize from '../src/config/database';

async function cleanupIndexes() {
  try {
    const [results]: any = await sequelize.query('SHOW INDEX FROM products');
    const indexesToDrop = results
      .filter((r: any) => r.Column_name === 'nhanh_id' && r.Key_name !== 'nhanh_id') // Keep the first one, drop others
      .map((r: any) => r.Key_name);

    console.log(`Found ${indexesToDrop.length} redundant indexes to drop.`);

    for (const key of indexesToDrop) {
      console.log(`Dropping index: ${key}`);
      await sequelize.query(`ALTER TABLE products DROP INDEX ${key}`);
    }

    console.log('Cleanup complete.');
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    process.exit();
  }
}

cleanupIndexes();
