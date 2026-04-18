const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  code: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  message: { type: String, default: 'Manual save' }
}, { timestamps: true });

const snapshotSchema = new mongoose.Schema({
  time: { type: Number, required: true },       // seconds since recording start
  code: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const contributionStatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  edits: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 }
}, { _id: false });

const recordingSchema = new mongoose.Schema({
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date, default: null },
  duration: { type: Number, default: 0 },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  participantNames: [String],
  snapshots: [snapshotSchema],
  contributionStats: [contributionStatSchema]
}, { timestamps: true });

const feedbackSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  type: { type: String, enum: ['general', 'code'], default: 'general' },
  lineNumber: { type: Number },
  content: { type: String, required: true },
  rating: { type: Number, min: 0, max: 5, default: 0 }
}, { timestamps: true });

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  language: {
    type: String,
    default: 'javascript',
    enum: ['javascript', 'python', 'java', 'cpp', 'html', 'css']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  creatorName: {
    type: String,
    default: 'Unknown'
  },
  code: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  versions: [versionSchema],
  recordings: [recordingSchema],
  feedback: [feedbackSchema]
}, {
  timestamps: true   // createdAt, updatedAt
});

module.exports = mongoose.model('Room', roomSchema);
