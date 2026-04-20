const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5500",
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5500",
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// Store active users and their socket IDs
const activeUsers = new Map(); // username -> socket.id
const userSockets = new Map(); // socket.id -> username

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// REST API Routes

// Get chat history between two users
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

// Get all messages for a user
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

// Check if username exists
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
  
  // Handle user login
  socket.on('user-login', (username) => {
    // Check if username is already taken
    if (activeUsers.has(username)) {
      socket.emit('login-error', 'Username already taken');
      return;
    }
    
    // Store user info
    activeUsers.set(username, socket.id);
    userSockets.set(socket.id, username);
    
    // Join user to their personal room for private messages
    socket.join(`user-${username}`);
    
    // Send current active users to the new user
    const usersList = Array.from(activeUsers.keys());
    socket.emit('active-users', usersList);
    
    // Broadcast updated users list to all connected clients
    io.emit('user-joined', username);
    io.emit('active-users-update', usersList);
    
    console.log(`${username} logged in. Active users: ${usersList.length}`);
  });
  
  // Handle public message
  socket.on('public-message', async (data) => {
    const { from, message } = data;
    const timestamp = new Date();
    
    // Save to database
    const newMessage = new Message({
      from,
      to: 'public',
      message,
      timestamp,
      isPrivate: false
    });
    
    try {
      await newMessage.save();
      
      // Broadcast to all users except sender
      socket.broadcast.emit('new-message', {
        from,
        message,
        timestamp,
        isPrivate: false
      });
      
      // Send confirmation to sender
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
  
  // Handle private message
  socket.on('private-message', async (data) => {
    const { from, to, message } = data;
    const timestamp = new Date();
    
    // Save to database
    const newMessage = new Message({
      from,
      to,
      message,
      timestamp,
      isPrivate: true
    });
    
    try {
      await newMessage.save();
      
      // Send to recipient if online
      const recipientSocketId = activeUsers.get(to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('private-message-received', {
          from,
          message,
          timestamp,
          isPrivate: true
        });
      }
      
      // Send confirmation to sender
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
  
  // Load chat history
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
  
  // Handle user disconnect
  socket.on('disconnect', () => {
    const username = userSockets.get(socket.id);
    
    if (username) {
      activeUsers.delete(username);
      userSockets.delete(socket.id);
      
      // Broadcast updated users list
      const usersList = Array.from(activeUsers.keys());
      io.emit('user-left', username);
      io.emit('active-users-update', usersList);
      
      console.log(`${username} disconnected. Active users: ${usersList.length}`);
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
