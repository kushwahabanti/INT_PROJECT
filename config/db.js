const mongoose = require('mongoose');

async function connectDB(retries = 5, delay = 3000) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codecollab';

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri);
      console.log(`  ✅ MongoDB connected: ${mongoose.connection.host}`);
      return true;
    } catch (err) {
      console.error(`  ❌ MongoDB connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) {
        console.error('     Make sure MongoDB is running or set MONGODB_URI in .env');
        process.exit(1);
      }
      console.log(`     Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

module.exports = connectDB;
