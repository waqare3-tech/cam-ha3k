const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Store messages in memory (for demo - use Redis in production)
const messages = [];
const activeUsers = new Set();

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
mongoose.connect(process.env.MONGODB_URI);

// API Routes
app.post('/api/login', (req, res) => {
  const { username } = req.body;
  if (activeUsers.has(username)) {
    return res.status(400).json({ error: 'Username taken' });
  }
  activeUsers.add(username);
  res.json({ success: true, username });
});

app.post('/api/logout', (req, res) => {
  const { username } = req.body;
  activeUsers.delete(username);
  res.json({ success: true });
});

app.get('/api/users', (req, res) => {
  res.json(Array.from(activeUsers));
});

app.post('/api/messages', async (req, res) => {
  const { from, to, message, isPrivate } = req.body;
  const newMessage = new Message({
    from, to, message, timestamp: new Date(), isPrivate
  });
  await newMessage.save();
  res.json(newMessage);
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  const chatMessages = await Message.find({
    $or: [
      { from: user1, to: user2 },
      { from: user2, to: user1 }
    ]
  }).sort({ timestamp: 1 }).limit(100);
  res.json(chatMessages);
});

app.get('/api/poll', async (req, res) => {
  const { lastTimestamp } = req.query;
  const newMessages = await Message.find({
    timestamp: { $gt: new Date(parseInt(lastTimestamp)) }
  }).limit(50);
  res.json(newMessages);
});

module.exports = app;
