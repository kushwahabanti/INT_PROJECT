# CodeCollab 🚀

A real-time collaborative code editor for students and instructors — built with Node.js, Socket.io, and MongoDB.

> Live URL: https://int-project-92ou.onrender.com

---

## Features

- 🔴 **Real-time code sync** — All users see changes instantly (<100ms)
- 🖱️ **Live cursors** — See where every participant is typing
- 💾 **Version control** — Save code snapshots with commit messages
- 🎥 **Session recording** — Full playback with timeline scrubbing
- 📊 **Contribution stats** — Per-user edit percentage tracking
- 💬 **Feedback system** — Line-level comments with star ratings (0–5)
- 💬 **Live chat** — In-room messaging
- 🌐 **Multi-language** — JavaScript, Python, Java, C++, HTML, CSS
- 🔐 **Auth** — JWT login with Student / Instructor roles

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | HTML, CSS, Vanilla JS |
| Code Editor | CodeMirror 5 |
| Real-Time | Socket.io 4.7 |
| Backend | Node.js + Express |
| Database | MongoDB + Mongoose |
| Auth | JWT + scrypt password hashing |
| Rate Limiting | express-rate-limit |

---

## Project Structure

```
codecollab/
├── server.js          # Express server + all Socket.io event handlers
├── User.js            # Mongoose user schema
├── Room.js            # Mongoose room schema (versions, recordings, feedback)
├── db.js              # MongoDB connection with retry logic
├── index.html         # Single-page frontend UI
├── css/index.css      # All styling
└── js/app.js          # All frontend logic + Socket.io client
```

---

## Getting Started

### Prerequisites
- Node.js v14+
- MongoDB (local or Atlas)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/your-username/codecollab.git
cd codecollab

# 2. Install dependencies
npm install

# 3. Create .env file
MONGODB_URI=mongodb://localhost:27017/codecollab
JWT_SECRET=your_secret_key_here
PORT=3000
NODE_ENV=development

# 4. Start MongoDB (if local)
brew services start mongodb-community    # macOS
sudo systemctl start mongod              # Linux

# 5. Start the server
npm start
```

Server starts at `http://localhost:3000`  
Demo data (5 users, 3 rooms) is auto-seeded on first run.

---

## Demo Accounts

All passwords: `password123`

| Email | Role |
|-------|------|
| sarah@codecollab.com | Instructor |
| james@codecollab.com | Instructor |
| alex@codecollab.com | Student |
| priya@codecollab.com | Student |
| marcus@codecollab.com | Student |

---

## API Reference

### Auth
```
POST  /api/register    { name, email, password, role }
POST  /api/login       { email, password }
GET   /api/me          → current user profile
```

### Rooms
```
GET    /api/rooms               → all active rooms
POST   /api/rooms               { name, language }
GET    /api/rooms/:id           → room with all data
DELETE /api/rooms/:id           → delete (creator only)
```

### Feedback & Recordings
```
POST  /api/rooms/:id/feedback       { type, content, rating, lineNumber }
GET   /api/rooms/:id/feedback
GET   /api/rooms/:id/recordings
```

All routes except auth require `Authorization: Bearer <token>` header.

---

## WebSocket Events

### Client → Server
```js
socket.emit('room:join',     { roomId, userId })
socket.emit('room:leave')
socket.emit('room:end',      { roomId })
socket.emit('code:change',   { roomId, code, userId })
socket.emit('cursor:move',   { roomId, userId, position, userName, color })
socket.emit('version:save',  { roomId, userId, message })
socket.emit('feedback:add',  { roomId, userId, type, content, rating })
socket.emit('chat:message',  { roomId, userId, message })
```

### Server → Client
```js
socket.on('room:state',          { code, participants, versions, feedback, cursors })
socket.on('code:update',         { code, userId })
socket.on('cursor:update',       { userId, position, userName, color })
socket.on('participants:update', [ ...users ])
socket.on('participant:joined',  user)
socket.on('participant:left',    user)
socket.on('version:saved',       version)
socket.on('feedback:added',      feedback)
socket.on('chat:message',        { userName, avatar, message, timestamp })
socket.on('room:ended',          { roomId })
```

---

## Database Schema

```js
// Room document
{
  name, language, createdBy, code, isActive,

  versions: [{ code, author, authorName, message, createdAt }],

  recordings: [{
    startTime, endTime, duration, participantNames,
    snapshots: [{ time, code, author }],          // for playback
    contributionStats: [{ name, edits, percentage }]
  }],

  feedback: [{ authorName, type, lineNumber, content, rating, createdAt }]
}

// User document
{ name, email, passwordHash, role, avatar }
```

---

## How It Works

**Real-time code sync:**  
`code:change` → broadcast to room instantly → debounced DB save every 3s (95% fewer writes)

**Cursor tracking:**  
Stored in server memory only (not DB). Cleared on disconnect.

**Recording:**  
Snapshots captured on every code change during a session. Contribution % = user edits / total edits.

**Auth:**  
scrypt + random salt for passwords. JWT tokens expire in 7 days.

---

## Deployment

### Backend → Render / Railway / Heroku
Set these environment variables on your platform:
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=strong_random_string
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com
```

### Frontend → Netlify / Vercel / GitHub Pages
Update `API_URL` in `js/app.js` to your backend URL, then deploy as static files.

---

## Security

- Passwords hashed with **scrypt + salt** (not bcrypt)
- JWT tokens expire in **7 days**
- **Rate limited**: 30 auth attempts per 15 minutes
- Timing-safe password comparison (prevents timing attacks)
- Input validated server-side on all routes

---

## License

MIT — free to use, modify, and distribute.
