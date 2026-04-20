const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure CORS for production
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins for testing
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB Schema
const messageSchema = new mongoose.Schema({
  from: String,
  to: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
  isPrivate: Boolean
});

const Message = mongoose.model('Message', messageSchema);

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Store active users
const activeUsers = new Map();
const userSockets = new Map();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.post('/api/check-user', (req, res) => {
  const { username } = req.body;
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }
  const isTaken = activeUsers.has(username);
  res.json({ available: !isTaken });
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const messages = await Message.find({
      $or: [
        { from: user1, to: user2 },
        { from: user2, to: user1 }
      ]
    }).sort({ timestamp: 1 }).limit(100);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('user-login', (username) => {
    if (activeUsers.has(username)) {
      socket.emit('login-error', 'Username already taken');
      return;
    }
    
    activeUsers.set(username, socket.id);
    userSockets.set(socket.id, username);
    socket.join(`user-${username}`);
    
    const usersList = Array.from(activeUsers.keys());
    socket.emit('active-users', usersList);
    io.emit('user-joined', username);
    io.emit('active-users-update', usersList);
    
    console.log(`${username} logged in`);
  });

  socket.on('public-message', async (data) => {
    const { from, message } = data;
    const timestamp = new Date();
    
    const newMessage = new Message({
      from, to: 'public', message, timestamp, isPrivate: false
    });
    
    await newMessage.save();
    socket.broadcast.emit('new-message', { from, message, timestamp, isPrivate: false });
    socket.emit('message-sent', { from, message, timestamp, isPrivate: false });
  });

  socket.on('private-message', async (data) => {
    const { from, to, message } = data;
    const timestamp = new Date();
    
    const newMessage = new Message({
      from, to, message, timestamp, isPrivate: true
    });
    
    await newMessage.save();
    
    const recipientSocketId = activeUsers.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('private-message-received', {
        from, message, timestamp, isPrivate: true
      });
    }
    
    socket.emit('private-message-sent', { to, message, timestamp, isPrivate: true });
  });

  socket.on('load-history', async (data) => {
    const { user1, user2 } = data;
    const messages = await Message.find({
      $or: [
        { from: user1, to: user2 },
        { from: user2, to: user1 }
      ]
    }).sort({ timestamp: 1 }).limit(50);
    
    socket.emit('history-loaded', messages);
  });

  socket.on('disconnect', () => {
    const username = userSockets.get(socket.id);
    if (username) {
      activeUsers.delete(username);
      userSockets.delete(socket.id);
      const usersList = Array.from(activeUsers.keys());
      io.emit('user-left', username);
      io.emit('active-users-update', usersList);
      console.log(`${username} disconnected`);
    }
  });
});

// Serve frontend for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
