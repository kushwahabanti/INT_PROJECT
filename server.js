require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const User = require('./models/User');
const Room = require('./models/Room');

// ─── Validate Critical Config ────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set in environment variables. Exiting.');
  process.exit(1);
}

const cors = require('cors');

const app = express();
const server = http.createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || false;
const corsOptions = CORS_ORIGIN
  ? { origin: CORS_ORIGIN, credentials: true }
  : { origin: true, credentials: false };

const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ['GET', 'POST'],
    credentials: corsOptions.credentials
  },
  maxHttpBufferSize: 5e6
});

// ─── CORS for HTTP requests ──────────────────────────────────────
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'docs')));

// ─── Rate Limiting ───────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// ─── In-Memory Runtime State ─────────────────────────────────────
const runtime = {
  participants: new Map(),
  cursors: new Map()
};

const saveBuffer = new Map();

// ─── Helpers ─────────────────────────────────────────────────────
const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derivedKey = await scryptAsync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey);
}

const avatarsByRole = {
  student: ['👨‍💻', '👩‍💻', '🧑‍💻', '👨‍🎓', '👩‍🎓', '🧑‍🎓'],
  instructor: ['👩‍🏫', '👨‍🏫', '🧑‍🏫', '👨‍🔬', '👩‍🔬']
};

function randomAvatar(role) {
  const set = avatarsByRole[role] || avatarsByRole.student;
  return set[Math.floor(Math.random() * set.length)];
}

function getTemplateCode(language) {
  const templates = {
    javascript: '// Start coding here...\n\nfunction main() {\n  console.log("Hello, World!");\n}\n\nmain();\n',
    python: '# Start coding here...\n\ndef main():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    main()\n',
    java: '// Start coding here...\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
    cpp: '// Start coding here...\n\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n',
    html: '<!-- Start coding here... -->\n\n<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <title>My Page</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>\n',
    css: '/* Start styling here... */\n\nbody {\n    margin: 0;\n    padding: 0;\n    font-family: sans-serif;\n}\n',
  };
  return templates[language] || templates.javascript;
}

function getParticipants(roomId) {
  const map = runtime.participants.get(roomId);
  return map ? Array.from(map.values()) : [];
}

// ─── Auth Middleware ─────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Seed Demo Data ──────────────────────────────────────────────
async function seedDemoData() {
  const demoAccounts = [
    { name: 'Dr. Sarah Chen',    email: 'sarah@codecollab.com',  password: 'password123', role: 'instructor', avatar: '👩‍🏫' },
    { name: 'Prof. James Miller', email: 'james@codecollab.com',  password: 'password123', role: 'instructor', avatar: '👨‍🏫' },
    { name: 'Alex Rivera',        email: 'alex@codecollab.com',   password: 'password123', role: 'student',    avatar: '👨‍💻' },
    { name: 'Priya Sharma',       email: 'priya@codecollab.com',  password: 'password123', role: 'student',    avatar: '👩‍💻' },
    { name: 'Marcus Johnson',     email: 'marcus@codecollab.com', password: 'password123', role: 'student',    avatar: '🧑‍💻' },
  ];

  for (const acc of demoAccounts) {
    const exists = await User.findOne({ email: acc.email });
    if (!exists) {
      await User.create({
        name: acc.name,
        email: acc.email,
        passwordHash: await hashPassword(acc.password),
        role: acc.role,
        avatar: acc.avatar
      });
    }
  }

  // Create demo rooms if none exist
  const roomCount = await Room.countDocuments();
  if (roomCount === 0) {
    const sarah = await User.findOne({ email: 'sarah@codecollab.com' });
    const james = await User.findOne({ email: 'james@codecollab.com' });

    if (sarah && james) {
      await Room.create([
        {
          name: 'Algorithm Challenge #1',
          language: 'javascript',
          createdBy: sarah._id,
          creatorName: sarah.name,
          code: '// Welcome to Algorithm Challenge #1\n// Task: Implement a function to find the longest palindromic substring\n\nfunction longestPalindrome(s) {\n  // Your code here\n  \n}\n\n// Test cases\nconsole.log(longestPalindrome("babad")); // "bab" or "aba"\nconsole.log(longestPalindrome("cbbd"));  // "bb"\n',
          isActive: true,
          versions: [
            { code: '// Initial template', author: sarah._id, authorName: sarah.name, message: 'Initial template created' }
          ]
        },
        {
          name: 'Python Data Structures Lab',
          language: 'python',
          createdBy: james._id,
          creatorName: james.name,
          code: '# Python Data Structures Lab\n# Implement a Binary Search Tree\n\nclass Node:\n    def __init__(self, value):\n        self.value = value\n        self.left = None\n        self.right = None\n\nclass BST:\n    def __init__(self):\n        self.root = None\n    \n    def insert(self, value):\n        # Implement insertion\n        pass\n    \n    def search(self, value):\n        # Implement search\n        pass\n\n# Test your implementation\ntree = BST()\nfor val in [5, 3, 7, 1, 4, 6, 8]:\n    tree.insert(val)\n',
          isActive: true
        },
        {
          name: 'Web API Design Workshop',
          language: 'javascript',
          createdBy: sarah._id,
          creatorName: sarah.name,
          code: '// Web API Design Workshop\nconst express = require("express");\nconst app = express();\napp.use(express.json());\n\nlet todos = [];\nlet nextId = 1;\n\napp.get("/api/todos", (req, res) => {\n  res.json(todos);\n});\n\n// TODO: Add POST, PUT, DELETE endpoints\n\napp.listen(3001, () => console.log("API running"));\n',
          isActive: false,
          feedback: [
            { author: sarah._id, authorName: sarah.name, content: 'Great teamwork! Clean API structure.', rating: 4 },
            { author: sarah._id, authorName: sarah.name, content: 'Consider adding pagination for GET.', rating: 5, type: 'code' }
          ]
        }
      ]);
    }
  }

  console.log('  📦 Demo data seeded');
}

// ═══════════════════════════════════════════════════════════════
//  REST API Routes
// ═══════════════════════════════════════════════════════════════

// Register
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!['student', 'instructor'].includes(role)) {
      return res.status(400).json({ error: 'Role must be student or instructor' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await hashPassword(password),
      role,
      avatar: randomAvatar(role)
    });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: user.toSafe() });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Support both legacy SHA-256 and new scrypt hashes
    let isValid = false;
    if (user.passwordHash.includes(':')) {
      isValid = await verifyPassword(password, user.passwordHash);
    } else {
      // Legacy SHA-256 check — migrate on successful login
      const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
      if (user.passwordHash === legacyHash) {
        isValid = true;
        user.passwordHash = await hashPassword(password);
        await user.save();
      }
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: user.toSafe() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user by id (protected)
app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.toSafe());
  } catch (err) {
    res.status(400).json({ error: 'Invalid user ID' });
  }
});

// Update user avatar (protected)
app.put('/api/users/avatar', authMiddleware, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error: 'Avatar data required' });

    const user = await User.findByIdAndUpdate(req.userId, { avatar }, { returnDocument: 'after' });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user.toSafe());
  } catch (err) {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Image is too large. Please select a smaller file (under 10MB).' });
    }
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all rooms (protected)
app.get('/api/rooms', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 }).limit(100);
    const result = rooms.map(r => ({
      id: r._id.toString(),
      name: r.name,
      language: r.language,
      createdBy: r.createdBy.toString(),
      creatorName: r.creatorName,
      createdAt: r.createdAt,
      participantCount: getParticipants(r._id.toString()).length,
      isActive: r.isActive,
      versionCount: r.versions.length,
      recordingCount: r.recordings.length,
      feedbackCount: r.feedback.length
    }));
    res.json(result);
  } catch (err) {
    console.error('Get rooms error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get room details (protected)
app.get('/api/rooms/:id', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const participants = getParticipants(room._id.toString());
    const cursorsMap = runtime.cursors.get(room._id.toString());
    const cursors = cursorsMap ? Array.from(cursorsMap.entries()).map(([uid, c]) => ({ userId: uid, ...c })) : [];

    res.json({
      id: room._id.toString(),
      name: room.name,
      language: room.language,
      createdBy: room.createdBy.toString(),
      creatorName: room.creatorName,
      createdAt: room.createdAt,
      code: room.code,
      isActive: room.isActive,
      versions: room.versions,
      recordings: room.recordings,
      feedback: room.feedback,
      participants,
      cursors
    });
  } catch (err) {
    res.status(400).json({ error: 'Invalid room ID' });
  }
});

// Create a room (protected)
app.post('/api/rooms', authMiddleware, async (req, res) => {
  try {
    const { name, language } = req.body;

    if (!name || name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({ error: 'Room name must be 2-80 characters' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const room = await Room.create({
      name: name.trim(),
      language: language || 'javascript',
      createdBy: req.userId,
      creatorName: user.name,
      code: getTemplateCode(language || 'javascript'),
      isActive: true
    });

    io.emit('room:created', {
      id: room._id.toString(),
      name: room.name,
      language: room.language,
      createdBy: req.userId,
      isActive: true
    });

    res.json({ id: room._id.toString(), name: room.name });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a room (protected — creator can delete own room, instructor can delete any)
app.delete('/api/rooms/:id', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isCreator = room.createdBy.toString() === req.userId;
    const isInstructor = user.role === 'instructor';
    if (!isCreator && !isInstructor) {
      return res.status(403).json({ error: 'You can only delete rooms you created' });
    }

    // Clean up runtime state
    const roomId = room._id.toString();
    runtime.participants.delete(roomId);
    runtime.cursors.delete(roomId);
    if (saveBuffer.has(roomId)) {
      clearTimeout(saveBuffer.get(roomId));
      saveBuffer.delete(roomId);
    }

    // Kick everyone out of the room
    io.to(roomId).emit('room:deleted', { roomId });

    await Room.findByIdAndDelete(req.params.id);

    // Notify all clients to refresh their room lists
    io.emit('rooms:update');

    res.json({ message: 'Room deleted successfully' });
  } catch (err) {
    console.error('Delete room error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get room versions
app.get('/api/rooms/:id/versions', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).select('versions');
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room.versions);
  } catch (err) {
    res.status(400).json({ error: 'Invalid room ID' });
  }
});

// Get room recordings
app.get('/api/rooms/:id/recordings', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).select('recordings');
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room.recordings);
  } catch (err) {
    res.status(400).json({ error: 'Invalid room ID' });
  }
});

// Get room feedback
app.get('/api/rooms/:id/feedback', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).select('feedback');
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room.feedback);
  } catch (err) {
    res.status(400).json({ error: 'Invalid room ID' });
  }
});

// Add feedback (protected)
app.post('/api/rooms/:id/feedback', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { content, type, lineNumber, rating } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Feedback content is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const fb = {
      author: req.userId,
      authorName: user.name,
      type: type || 'general',
      lineNumber,
      content: content.trim(),
      rating: Math.min(5, Math.max(0, rating || 0))
    };

    room.feedback.push(fb);
    await room.save();

    const saved = room.feedback[room.feedback.length - 1];
    io.to(req.params.id).emit('feedback:new', saved);
    res.json(saved);
  } catch (err) {
    console.error('Add feedback error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get contribution stats (optimized — no N+1)
app.get('/api/rooms/:id/contributions', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).select('versions');
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Collect unique author IDs
    const authorIds = [...new Set(room.versions.map(v => v.author.toString()))];
    const users = await User.find({ _id: { $in: authorIds } }).select('name avatar');
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });

    const contributions = {};
    for (const v of room.versions) {
      const key = v.author.toString();
      if (!contributions[key]) {
        const user = userMap[key];
        contributions[key] = { name: v.authorName, commits: 0, avatar: user?.avatar || '👤' };
      }
      contributions[key].commits++;
    }
    res.json(contributions);
  } catch (err) {
    res.status(400).json({ error: 'Invalid room ID' });
  }
});

// Aggregated recordings endpoint (avoids N+1 from client)
app.get('/api/recordings', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find().select('name language recordings').sort({ createdAt: -1 }).limit(100);
    const allRecordings = [];
    rooms.forEach(room => {
      room.recordings.forEach(rec => {
        allRecordings.push({
          ...rec.toObject(),
          roomName: room.name,
          roomId: room._id.toString(),
          language: room.language
        });
      });
    });
    res.json(allRecordings);
  } catch (err) {
    console.error('Get recordings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user by token
app.get('/api/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ token, user: user.toSafe() });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// // Run Code - Secured via Piston API
// app.post('/api/run', authMiddleware, async (req, res) => {
//   const { code, language } = req.body;
//   if (!code) return res.status(400).json({ error: 'No code provided' });

//   // Quick fix - simple execution for demo
//   if (language === 'javascript') {
//     try {
//       let output = '';
//       const log = console.log;
//       console.log = (...args) => { output += args.join(' ') + '\n'; };
      
//       eval(code);
      
//       console.log = log;
//       return res.json({ output: output || 'Code executed successfully', error: '' });
//     } catch (err) {
//       return res.json({ output: '', error: err.message });
//     }
//   }
  
//   if (language === 'python') {
//     return res.json({ 
//       output: '', 
//       error: 'Python execution not available in demo mode. Feature works with external API.' 
//     });
//   }

//   res.status(400).json({ error: 'Language not supported' });
// });




app.post('/api/run', authMiddleware, async (req, res) => {
  const { code, language } = req.body;

  // Input validation
  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  if (code.length > 50000) {
    return res.status(413).json({ error: 'Code too large (limit 50KB)' });
  }

  // HTML/CSS preview
  if (language === 'html' || language === 'css') {
    return res.json({
      output: code,
      error: '',
      type: 'preview'
    });
  }

  const langMap = {
    javascript: { language: "nodejs", versionIndex: "4" },
    python: { language: "python3", versionIndex: "3" },
    java: { language: "java", versionIndex: "4" },
    cpp: { language: "cpp17", versionIndex: "0" },
    c: { language: "c", versionIndex: "5" }
  };

  if (!langMap[language]) {
    return res.status(400).json({ error: 'Language not supported' });
  }

  if (!process.env.JDOODLE_CLIENT_ID || !process.env.JDOODLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'JDoodle API not configured' });
  }

  let timeout;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch("https://api.jdoodle.com/v1/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        clientId: process.env.JDOODLE_CLIENT_ID,
        clientSecret: process.env.JDOODLE_CLIENT_SECRET,
        script: code,
        ...langMap[language]
      })
    });

    // 🔒 Safe parse (no crash)
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    // ❗ HTTP error handling
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({ error: 'JDoodle auth failed' });
      }
      if (response.status === 429) {
        return res.status(503).json({ error: 'JDoodle quota exceeded' });
      }
      return res.status(502).json({ error: 'Execution failed (upstream)' });
    }

    // ❗ 200 but error inside body
    if (data.error) {
      return res.status(502).json({ error: data.error });
    }

    return res.json({
      output: data.output || '',
      error: ''
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Execution timeout' });
    }

    console.error(err);
    return res.status(502).json({ error: 'Execution service unavailable' });

  } finally {
    // ✅ no memory leak
    if (timeout) clearTimeout(timeout);
  }
});
// ═══════════════════════════════════════════════════════════════
//  Socket.io Real-Time Events (with JWT auth)
// ═══════════════════════════════════════════════════════════════

// Socket authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    // Allow connection but mark as unauthenticated
    socket.authenticated = false;
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (user) {
      socket.userId = user._id.toString();
      socket.userData = user.toSafe();
      socket.authenticated = true;
    }
    next();
  } catch (err) {
    next();
  }
});

io.on('connection', (socket) => {
  let currentUser = null;
  let currentRoomId = null;

  socket.on('user:identify', async (userId) => {
    try {
      const user = await User.findById(userId);
      if (user) {
        currentUser = user.toSafe();
        socket.emit('user:identified', currentUser);
      }
    } catch (err) { /* ignore invalid id */ }
  });

  socket.on('room:join', async ({ roomId, userId }) => {
    try {
      const room = await Room.findById(roomId);
      const user = await User.findById(userId);
      if (!room || !user) return;

      currentRoomId = roomId;
      currentUser = user.toSafe();
      socket.join(roomId);

      // Track participant in runtime
      if (!runtime.participants.has(roomId)) {
        runtime.participants.set(roomId, new Map());
      }
      runtime.participants.get(roomId).set(userId, {
        id: userId,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        joinedAt: new Date().toISOString(),
        socketId: socket.id
      });

      // Start recording if room is active and no active recording
      const activeRec = room.recordings.find(r => !r.endTime);
      if (room.isActive && !activeRec) {
        room.recordings.push({
          startTime: new Date(),
          participants: [user._id],
          participantNames: [user.name],
          snapshots: [{ time: 0, code: room.code, author: user._id }],
          contributionStats: []
        });
        await room.save();
      } else if (activeRec) {
        const uidStr = user._id.toString();
        if (!activeRec.participants.some(p => p.toString() === uidStr)) {
          activeRec.participants.push(user._id);
          activeRec.participantNames.push(user.name);
          await room.save();
        }
      }

      // Initialize cursors map
      if (!runtime.cursors.has(roomId)) {
        runtime.cursors.set(roomId, new Map());
      }

      const participants = getParticipants(roomId);
      const cursorsMap = runtime.cursors.get(roomId);
      const cursors = cursorsMap ? Array.from(cursorsMap.entries()).map(([uid, c]) => ({ userId: uid, ...c })) : [];

      // Send state to joining user
      socket.emit('room:state', {
        code: room.code,
        participants,
        versions: room.versions,
        feedback: room.feedback,
        cursors
      });

      // Notify others
      socket.to(roomId).emit('participant:joined', {
        id: userId,
        name: user.name,
        role: user.role,
        avatar: user.avatar
      });

      io.to(roomId).emit('participants:update', participants);
    } catch (err) {
      console.error('room:join error:', err);
    }
  });

  socket.on('room:leave', () => {
    if (currentRoomId && currentUser) {
      socket.leave(currentRoomId);
      const pMap = runtime.participants.get(currentRoomId);
      if (pMap) {
        pMap.delete(currentUser.id);
        if (pMap.size === 0) runtime.participants.delete(currentRoomId);
      }
      const cMap = runtime.cursors.get(currentRoomId);
      if (cMap) cMap.delete(currentUser.id);

      io.to(currentRoomId).emit('participant:left', { id: currentUser.id, name: currentUser.name });
      io.to(currentRoomId).emit('participants:update', getParticipants(currentRoomId));

      currentRoomId = null;
    }
  });

  socket.on('code:change', async ({ roomId, code, userId }) => {
    try {
      socket.to(roomId).emit('code:update', { code, userId });

      if (saveBuffer.has(roomId)) {
        clearTimeout(saveBuffer.get(roomId));
      }

      const timer = setTimeout(async () => {
        try {
          // Fetch latest code to avoid stale writes
          const latestRoom = await Room.findById(roomId);
          if (!latestRoom) return;

          latestRoom.code = code;

          const activeRec = latestRoom.recordings.find(r => !r.endTime);
          if (activeRec) {
            const elapsed = Math.floor((Date.now() - new Date(activeRec.startTime).getTime()) / 1000);
            activeRec.snapshots.push({ time: elapsed, code, author: userId });

            let stat = activeRec.contributionStats.find(s => s.userId?.toString() === userId);
            if (!stat) {
              const user = await User.findById(userId);
              activeRec.contributionStats.push({
                userId,
                name: user?.name || 'Unknown',
                edits: 1,
                percentage: 0
              });
            } else {
              stat.edits++;
            }

            const totalEdits = activeRec.contributionStats.reduce((s, c) => s + c.edits, 0);
            activeRec.contributionStats.forEach(c => {
              c.percentage = Math.round((c.edits / totalEdits) * 100);
            });
          }

          await latestRoom.save();
        } catch (e) {
          console.error('Debounced save error:', e);
        }
        saveBuffer.delete(roomId);
      }, 3000);

      saveBuffer.set(roomId, timer);
    } catch (err) {
      console.error('code:change error:', err);
    }
  });

  socket.on('cursor:move', ({ roomId, userId, position, userName, color }) => {
    if (!runtime.cursors.has(roomId)) {
      runtime.cursors.set(roomId, new Map());
    }
    runtime.cursors.get(roomId).set(userId, { position, userName, color });
    socket.to(roomId).emit('cursor:update', { userId, position, userName, color });
  });

  socket.on('version:save', async ({ roomId, userId, message }) => {
    try {
      const room = await Room.findById(roomId);
      const user = await User.findById(userId);
      if (!room || !user) return;

      const version = {
        code: room.code,
        author: user._id,
        authorName: user.name,
        message: message || 'Manual save'
      };

      room.versions.push(version);
      await room.save();

      const saved = room.versions[room.versions.length - 1];
      io.to(roomId).emit('version:saved', {
        _id: saved._id,
        code: saved.code,
        author: saved.author,
        authorName: saved.authorName,
        message: saved.message,
        createdAt: saved.createdAt,
        id: saved._id.toString(),
        timestamp: saved.createdAt
      });
    } catch (err) {
      console.error('version:save error:', err);
    }
  });

  socket.on('room:end', async ({ roomId }) => {
    try {
      const room = await Room.findById(roomId);
      if (!room) return;

      room.isActive = false;

      const activeRec = room.recordings.find(r => !r.endTime);
      if (activeRec) {
        activeRec.endTime = new Date();
        activeRec.duration = Math.floor(
          (activeRec.endTime.getTime() - new Date(activeRec.startTime).getTime()) / 1000
        );
      }

      await room.save();

      io.to(roomId).emit('room:ended', { roomId });
      io.emit('rooms:update');
    } catch (err) {
      console.error('room:end error:', err);
    }
  });

  socket.on('chat:message', async ({ roomId, userId, message }) => {
    try {
      const user = await User.findById(userId);
      if (!user) return;
      io.to(roomId).emit('chat:message', {
        id: crypto.randomUUID(),
        userId,
        userName: user.name,
        avatar: user.avatar,
        message,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('chat:message error:', err);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomId && currentUser) {
      const pMap = runtime.participants.get(currentRoomId);
      if (pMap) {
        pMap.delete(currentUser.id);
        if (pMap.size === 0) {
          runtime.participants.delete(currentRoomId);
        }
      }
      const cMap = runtime.cursors.get(currentRoomId);
      if (cMap) {
        cMap.delete(currentUser.id);
      }

      io.to(currentRoomId).emit('participant:left', { id: currentUser.id, name: currentUser.name });
      io.to(currentRoomId).emit('participants:update', getParticipants(currentRoomId));
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  Start Server
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  await seedDemoData();

  server.listen(PORT, () => {
    console.log(`  🚀 CodeCollab Server running on http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});