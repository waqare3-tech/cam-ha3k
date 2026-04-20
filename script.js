// Global variables
let socket;
let currentUser = null;
let currentChatWith = null;
let messagesCache = new Map();

// Get server URL based on environment
const getServerUrl = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  // For Render deployment
  return window.location.origin;
};

const SERVER_URL = getServerUrl();

// DOM Elements
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const loginError = document.getElementById('loginError');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    
    if (!username) {
      showError('Please enter a username');
      return;
    }
    
    try {
      const response = await fetch(`${SERVER_URL}/api/check-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username })
      });
      
      const data = await response.json();
      
      if (data.available) {
        localStorage.setItem('chatUsername', username);
        localStorage.setItem('serverUrl', SERVER_URL);
        window.location.href = 'chat.html';
      } else {
        showError('Username already taken. Please choose another one.');
      }
    } catch (error) {
      console.error('Error checking username:', error);
      showError('Failed to connect to server. Please try again.');
    }
  });
  
  function showError(message) {
    loginError.textContent = message;
    setTimeout(() => {
      loginError.textContent = '';
    }, 3000);
  }
}

if (document.getElementById('messagesContainer')) {
  initChat();
  
  async function initChat() {
    currentUser = localStorage.getItem('chatUsername');
    const serverUrl = localStorage.getItem('serverUrl') || SERVER_URL;
    
    if (!currentUser) {
      window.location.href = 'index.html';
      return;
    }
    
    document.getElementById('currentUsername').textContent = currentUser.charAt(0).toUpperCase();
    document.getElementById('usernameDisplay').textContent = currentUser;
    
    connectSocket(serverUrl);
    setupEventListeners();
  }
  
  function connectSocket(serverUrl) {
    socket = io(serverUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
      console.log('Connected to server');
      updateConnectionStatus(true);
      socket.emit('user-login', currentUser);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      updateConnectionStatus(false);
      showTemporaryMessage('Connection lost. Reconnecting...', 'error');
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      updateConnectionStatus(false);
    });
    
    socket.on('login-error', (error) => {
      console.error('Login error:', error);
      alert(error);
      logout();
    });
    
    socket.on('active-users', (users) => {
      updateOnlineUsers(users);
    });
    
    socket.on('active-users-update', (users) => {
      updateOnlineUsers(users);
    });
    
    socket.on('user-joined', (username) => {
      addSystemMessage(`${username} joined the chat`);
    });
    
    socket.on('user-left', (username) => {
      addSystemMessage(`${username} left the chat`);
    });
    
    socket.on('new-message', (message) => {
      if (currentChatWith === null) {
        displayMessage(message, false);
      }
      cacheMessage('public', message);
    });
    
    socket.on('message-sent', (message) => {
      if (currentChatWith === null) {
        displayMessage(message, true);
      }
    });
    
    socket.on('private-message-received', (message) => {
      if (currentChatWith === message.from) {
        displayMessage(message, false);
      } else {
        showNotification(`New message from ${message.from}`);
      }
      cacheMessage(message.from, message);
    });
    
    socket.on('private-message-sent', (message) => {
      if (currentChatWith === message.to) {
        displayMessage(message, true);
      }
    });
    
    socket.on('history-loaded', (messages) => {
      messages.forEach(msg => {
        const isSent = msg.from === currentUser;
        displayMessage(msg, isSent);
      });
      scrollToBottom();
    });
    
    socket.on('message-error', (error) => {
      console.error('Message error:', error);
      showTemporaryMessage(error, 'error');
    });
  }
  
  function setupEventListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const logoutBtn = document.getElementById('logoutBtn');
    
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    logoutBtn.addEventListener('click', logout);
  }
  
  function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    if (currentChatWith === null) {
      socket.emit('public-message', {
        from: currentUser,
        message: message
      });
    } else {
      socket.emit('private-message', {
        from: currentUser,
        to: currentChatWith,
        message: message
      });
    }
    
    messageInput.value = '';
    messageInput.style.height = 'auto';
  }
  
  function updateOnlineUsers(users) {
    const usersListDiv = document.getElementById('onlineUsers');
    const userCountSpan = document.getElementById('userCount');
    
    userCountSpan.textContent = users.length;
    usersListDiv.innerHTML = '';
    
    users.forEach(username => {
      if (username !== currentUser) {
        const userDiv = createUserElement(username);
        usersListDiv.appendChild(userDiv);
      }
    });
    
    const publicDiv = createPublicChatElement();
    usersListDiv.insertBefore(publicDiv, usersListDiv.firstChild);
  }
  
  function createUserElement(username) {
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    if (currentChatWith === username) {
      userDiv.classList.add('active');
    }
    userDiv.innerHTML = `
      <span class="user-name">${escapeHtml(username)}</span>
      <span class="user-status"></span>
    `;
    userDiv.addEventListener('click', () => startPrivateChat(username));
    return userDiv;
  }
  
  function createPublicChatElement() {
    const publicDiv = document.createElement('div');
    publicDiv.className = 'user-item';
    if (currentChatWith === null) {
      publicDiv.classList.add('active');
    }
    publicDiv.innerHTML = `
      <span class="user-name">🌐 Public Chat</span>
      <span class="user-status"></span>
    `;
    publicDiv.addEventListener('click', () => startPublicChat());
    return publicDiv;
  }
  
  function startPrivateChat(username) {
    if (currentChatWith === username) return;
    
    currentChatWith = username;
    document.getElementById('chatTitle').textContent = `Private Chat with ${username}`;
    document.getElementById('inputHint').textContent = `Private message to ${username}`;
    
    clearMessages();
    
    if (messagesCache.has(username)) {
      const cachedMessages = messagesCache.get(username);
      cachedMessages.forEach(msg => {
        const isSent = msg.from === currentUser;
        displayMessage(msg, isSent);
      });
      scrollToBottom();
    } else {
      socket.emit('load-history', {
        user1: currentUser,
        user2: username
      });
    }
    
    document.querySelectorAll('.user-item').forEach(item => {
      item.classList.remove('active');
      if (item.textContent.includes(username)) {
        item.classList.add('active');
      }
    });
  }
  
  function startPublicChat() {
    if (currentChatWith === null) return;
    
    currentChatWith = null;
    document.getElementById('chatTitle').textContent = 'Public Chat';
    document.getElementById('inputHint').textContent = 'Public chat - everyone can see';
    
    clearMessages();
    
    if (messagesCache.has('public')) {
      const cachedMessages = messagesCache.get('public');
      cachedMessages.forEach(msg => {
        const isSent = msg.from === currentUser;
        displayMessage(msg, isSent);
      });
      scrollToBottom();
    }
    
    document.querySelectorAll('.user-item').forEach(item => {
      item.classList.remove('active');
      if (item.textContent.includes('Public Chat')) {
        item.classList.add('active');
      }
    });
  }
  
  function displayMessage(message, isSent) {
    const messagesList = document.getElementById('messagesList');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
      <div class="message-content">
        ${!isSent ? `<div class="message-sender">${escapeHtml(message.from)}</div>` : ''}
        <div class="message-text">${escapeHtml(message.message)}</div>
        <div class="message-time">${time}</div>
        ${message.isPrivate ? '<span class="private-badge">Private</span>' : ''}
      </div>
    `;
    
    messagesList.appendChild(messageDiv);
    scrollToBottom();
  }
  
  function addSystemMessage(text) {
    const messagesList = document.getElementById('messagesList');
    const systemDiv = document.createElement('div');
    systemDiv.className = 'message received';
    systemDiv.innerHTML = `
      <div class="message-content" style="background: #f0f0f0; text-align: center; font-style: italic;">
        <div class="message-text" style="color: #666;">${escapeHtml(text)}</div>
      </div>
    `;
    messagesList.appendChild(systemDiv);
    scrollToBottom();
  }
  
  function cacheMessage(chatId, message) {
    if (!messagesCache.has(chatId)) {
      messagesCache.set(chatId, []);
    }
    const messages = messagesCache.get(chatId);
    messages.push(message);
    
    if (messages.length > 100) {
      messages.shift();
    }
  }
  
  function clearMessages() {
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';
  }
  
  function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
  }
  
  function updateConnectionStatus(connected) {
    const statusSpan = document.querySelector('.chat-status span');
    const statusDot = document.querySelector('.status-dot');
    
    if (connected) {
      statusSpan.textContent = 'Connected';
      statusDot.style.background = '#2ecc71';
    } else {
      statusSpan.textContent = 'Disconnected';
      statusDot.style.background = '#e74c3c';
    }
  }
  
  function showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('New Message', { body: message });
    }
  }
  
  function showTemporaryMessage(message, type) {
    const hint = document.getElementById('inputHint');
    const originalText = hint.textContent;
    hint.textContent = message;
    hint.style.color = type === 'error' ? '#e74c3c' : '#2ecc71';
    
    setTimeout(() => {
      hint.textContent = originalText;
      hint.style.color = '#999';
    }, 3000);
  }
  
  function logout() {
    localStorage.removeItem('chatUsername');
    localStorage.removeItem('serverUrl');
    if (socket) {
      socket.disconnect();
    }
    window.location.href = 'index.html';
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  const messageInput = document.getElementById('messageInput');
  if (messageInput) {
    messageInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }
  
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
