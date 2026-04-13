
const sequelize = require('./src/config/database').default;

async function checkIndexes() {
  try {
    const [results] = await sequelize.query('SHOW INDEX FROM products');
    console.log('Indexes for products table:');
    console.table(results.map(r => ({
      Column: r.Column_name,
      Key_name: r.Key_name,
      Unique: !r.Non_unique
    })));
    console.log('Total index count:', results.length);
  } catch (err) {
    console.error('Error checking indexes:', err);
  } finally {
    process.exit();
  }
}

checkIndexes();
