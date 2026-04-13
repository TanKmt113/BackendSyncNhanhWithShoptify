
import sequelize from '../src/config/database';

async function checkIndexes() {
  try {
    const [results]: any = await sequelize.query('SHOW INDEX FROM products');
    console.log('Indexes for products table:');
    results.forEach((r: any) => {
      console.log(`- Column: ${r.Column_name}, Key: ${r.Key_name}, Unique: ${!r.Non_unique}`);
    });
    console.log('Total index count:', results.length);
  } catch (err) {
    console.error('Error checking indexes:', err);
  } finally {
    process.exit();
  }
}

checkIndexes();
