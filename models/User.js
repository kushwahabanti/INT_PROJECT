const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'instructor'],
    required: true
  },
  avatar: {
    type: String,
    default: '👤'
  }
}, {
  timestamps: true  // adds createdAt, updatedAt
});

// Hide sensitive fields when converting to JSON
userSchema.methods.toSafe = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  obj.id = obj._id.toString();
  return obj;
};

module.exports = mongoose.model('User', userSchema);
