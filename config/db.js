const mongoose = require('mongoose');

async function connectDB(retries = 5, delay = 3000) {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ MONGODB_URI not found");
    process.exit(1);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri);
      console.log(`✅ MongoDB connected`);
      return true;
    } catch (err) {
      console.error(`❌ MongoDB attempt ${attempt}/${retries}: ${err.message}`);
      if (attempt === retries) process.exit(1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

module.exports = connectDB;