// Global variables
let socket;
let currentUser = null;
let currentChatWith = null; // null for public chat, username for private chat
let messagesCache = new Map(); // Cache messages for different chats

// DOM Elements
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const loginError = document.getElementById('loginError');

// Check if we're on login page or chat page
if (loginForm) {
    // Login page logic
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        
        if (!username) {
            showError('Please enter a username');
            return;
        }
        
        // Check if username is available
        try {
            const response = await fetch('http://localhost:3000/api/check-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username })
            });
            
            const data = await response.json();
            
            if (data.available) {
                // Store username and redirect to chat
                localStorage.setItem('chatUsername', username);
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

// Chat page logic
if (document.getElementById('messagesContainer')) {
    // Initialize chat
    initChat();
    
    async function initChat() {
        // Get current user from localStorage
        currentUser = localStorage.getItem('chatUsername');
        
        if (!currentUser) {
            window.location.href = 'index.html';
            return;
        }
        
        // Display username
        document.getElementById('currentUsername').textContent = currentUser.charAt(0).toUpperCase();
        document.getElementById('usernameDisplay').textContent = currentUser;
        
        // Connect to WebSocket
        connectSocket();
        
        // Setup event listeners
        setupEventListeners();
    }
    
    function connectSocket() {
        socket = io('http://localhost:3000', {
            withCredentials: true
        });
        
        socket.on('connect', () => {
            console.log('Connected to server');
            updateConnectionStatus(true);
            
            // Send user login
            socket.emit('user-login', currentUser);
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
        
        // Handle active users list
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
        
        // Handle public messages
        socket.on('new-message', (message) => {
            if (currentChatWith === null) {
                displayMessage(message, false);
            }
            // Cache message for public chat
            cacheMessage('public', message);
        });
        
        socket.on('message-sent', (message) => {
            if (currentChatWith === null) {
                displayMessage(message, true);
            }
        });
        
        // Handle private messages
        socket.on('private-message-received', (message) => {
            if (currentChatWith === message.from) {
                displayMessage(message, false);
            } else {
                // Show notification
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
            // Public message
            socket.emit('public-message', {
                from: currentUser,
                message: message
            });
        } else {
            // Private message
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
                const userDiv = document.createElement('div');
                userDiv.className = 'user-item';
                if (currentChatWith === username) {
                    userDiv.classList.add('active');
                }
                userDiv.innerHTML = `
                    <span class="user-name">${username}</span>
                    <span class="user-status"></span>
                `;
                userDiv.addEventListener('click', () => startPrivateChat(username));
                usersListDiv.appendChild(userDiv);
            }
        });
        
        // Add public chat option
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
        usersListDiv.insertBefore(publicDiv, usersListDiv.firstChild);
    }
    
    function startPrivateChat(username) {
        if (currentChatWith === username) return;
        
        currentChatWith = username;
        document.getElementById('chatTitle').textContent = `Private Chat with ${username}`;
        document.getElementById('inputHint').textContent = `Private message to ${username}`;
        
        // Clear messages
        clearMessages();
        
        // Load cached messages or fetch from server
        if (messagesCache.has(username)) {
            const cachedMessages = messagesCache.get(username);
            cachedMessages.forEach(msg => {
                const isSent = msg.from === currentUser;
                displayMessage(msg, isSent);
            });
            scrollToBottom();
        } else {
            // Load from server
            socket.emit('load-history', {
                user1: currentUser,
                user2: username
            });
        }
        
        // Update active user highlight
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
        
        // Clear messages
        clearMessages();
        
        // Load cached public messages
        if (messagesCache.has('public')) {
            const cachedMessages = messagesCache.get('public');
            cachedMessages.forEach(msg => {
                const isSent = msg.from === currentUser;
                displayMessage(msg, isSent);
            });
            scrollToBottom();
        }
        
        // Update active user highlight
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
                ${!isSent ? `<div class="message-sender">${message.from}</div>` : ''}
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
        
        // Keep only last 100 messages per chat
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
        // Simple notification - can be enhanced
        if (Notification.permission === 'granted') {
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
    
    // Auto-resize textarea
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
    }
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
