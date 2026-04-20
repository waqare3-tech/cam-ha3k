const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);

// Dynamic CORS origin based on environment
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5500',
  'http://localhost:3000',
  'https://*.onrender.com',
  'https://*.vercel.app'
];

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"]
  },
  // Important for Render deployment
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });
}

// Store active users
const activeUsers = new Map();
const userSockets = new Map();

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// REST API Routes
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
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/messages/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const messages = await Message.find({
      $or: [
        { from: username },
        { to: username }
      ]
    }).sort({ timestamp: -1 }).limit(100);
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching user messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/check-user', (req, res) => {
  const { username } = req.body;
  
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }
  
  const isTaken = activeUsers.has(username);
  res.json({ available: !isTaken });
});

// WebSocket Events
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
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
    
    console.log(`${username} logged in. Active users: ${usersList.length}`);
  });
  
  socket.on('public-message', async (data) => {
    const { from, message } = data;
    const timestamp = new Date();
    
    const newMessage = new Message({
      from,
      to: 'public',
      message,
      timestamp,
      isPrivate: false
    });
    
    try {
      await newMessage.save();
      socket.broadcast.emit('new-message', {
        from,
        message,
        timestamp,
        isPrivate: false
      });
      socket.emit('message-sent', {
        from,
        message,
        timestamp,
        isPrivate: false
      });
    } catch (error) {
      console.error('Error saving public message:', error);
      socket.emit('message-error', 'Failed to send message');
    }
  });
  
  socket.on('private-message', async (data) => {
    const { from, to, message } = data;
    const timestamp = new Date();
    
    const newMessage = new Message({
      from,
      to,
      message,
      timestamp,
      isPrivate: true
    });
    
    try {
      await newMessage.save();
      
      const recipientSocketId = activeUsers.get(to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('private-message-received', {
          from,
          message,
          timestamp,
          isPrivate: true
        });
      }
      
      socket.emit('private-message-sent', {
        to,
        message,
        timestamp,
        isPrivate: true
      });
    } catch (error) {
      console.error('Error saving private message:', error);
      socket.emit('message-error', 'Failed to send private message');
    }
  });
  
  socket.on('load-history', async (data) => {
    const { user1, user2 } = data;
    
    try {
      const messages = await Message.find({
        $or: [
          { from: user1, to: user2 },
          { from: user2, to: user1 }
        ]
      }).sort({ timestamp: 1 }).limit(50);
      
      socket.emit('history-loaded', messages);
    } catch (error) {
      console.error('Error loading history:', error);
      socket.emit('message-error', 'Failed to load chat history');
    }
  });
  
  socket.on('disconnect', () => {
    const username = userSockets.get(socket.id);
    
    if (username) {
      activeUsers.delete(username);
      userSockets.delete(socket.id);
      
      const usersList = Array.from(activeUsers.keys());
      io.emit('user-left', username);
      io.emit('active-users-update', usersList);
      
      console.log(`${username} disconnected. Active users: ${usersList.length}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
