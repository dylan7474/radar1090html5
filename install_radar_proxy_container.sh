#!/bin/bash

# ==========================================
# CONFIGURATION
# ==========================================
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"
AUDIO_IP="192.168.50.4"
AUDIO_PORT="8000"

# AI SETTINGS
# We only need the port and the network range to scan
OLLAMA_PORT="11434"
SCAN_NET="192.168.50.0/24"

# Standard Config
REPO_URL="https://github.com/dylan7474/radar1090html5.git"
SOURCE_DIR="radar1090html5" 
PROJECT_NAME="radar-docker"
# ==========================================

echo ">>> Starting Radar1090 Deployment (Auto-Discovery Edition)..."

# --- [GIT & DOWNLOAD] ---
if ! command -v git &> /dev/null; then echo "Error: git is missing."; exit 1; fi
if ! command -v docker &> /dev/null; then echo "Error: docker is missing."; exit 1; fi

if [ -d "$SOURCE_DIR" ]; then
    echo ">>> Updating existing repo..."
    cd "$SOURCE_DIR" && git pull && cd ..
else
    echo ">>> Cloning repository..."
    git clone "$REPO_URL"
fi

# --- [PREPARE FOLDERS] ---
mkdir -p "$PROJECT_NAME/src"
if [ -d "$SOURCE_DIR/.git" ]; then
    rsync -av --exclude='.git' "$SOURCE_DIR/" "$PROJECT_NAME/src/" > /dev/null 2>&1 || cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
else
    cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
fi

# --- [CREATE BOOT SCRIPT] ---
# This script runs INSIDE the container every time it starts.
echo ">>> Creating Auto-Discovery Boot Script..."
cat > "$PROJECT_NAME/boot.sh" <<EOF
#!/bin/sh

echo "------------------------------------------------"
echo "🔍 STARTING OLLAMA NETWORK DISCOVERY..."
echo "------------------------------------------------"

# 1. Install Nmap (Network Scanner) cleanly
# We redirect output to /dev/null to keep logs clean
apk add --no-cache nmap > /dev/null 2>&1

# 2. Scan the network for port $OLLAMA_PORT
# -oG - : Output in grepable format
# grep "/open/" : Find lines where the port is explicitly open
# awk : Extract just the IP address
FOUND_IPS=\$(nmap -p $OLLAMA_PORT --open $SCAN_NET -oG - | grep "/open/" | awk '{print \$2}')

# 3. Build the Nginx Upstream Config
UPSTREAM_FILE="/etc/nginx/conf.d/ollama_upstreams.conf"
echo "upstream ollama_backend {" > \$UPSTREAM_FILE

COUNT=0
for ip in \$FOUND_IPS; do
    echo "✅ Found Ollama Server: \$ip"
    echo "    server \$ip:$OLLAMA_PORT;" >> \$UPSTREAM_FILE
    COUNT=\$((COUNT+1))
done

# If no servers found, add a dummy one to prevent Nginx crash (or 127.0.0.1)
if [ "\$COUNT" -eq "0" ]; then
    echo "⚠️  NO OLLAMA SERVERS FOUND! Defaulting to localhost (will likely fail 502)."
    echo "    server 127.0.0.1:$OLLAMA_PORT;" >> \$UPSTREAM_FILE
fi

echo "}" >> \$UPSTREAM_FILE
echo "------------------------------------------------"
echo "🚀 DISCOVERY COMPLETE. Found \$COUNT servers."
echo "   Starting Nginx..."
echo "------------------------------------------------"

# 4. Start Nginx
nginx -g "daemon off;"
EOF

chmod +x "$PROJECT_NAME/boot.sh"

# --- [GENERATE NGINX TEMPLATE] ---
echo ">>> Generating Nginx Template..."
cat > "$PROJECT_NAME/nginx.conf" <<EOF
# Include the dynamically generated upstream file
include /etc/nginx/conf.d/ollama_upstreams.conf;

server {
    listen 80;
    server_name localhost;

    # 1. Web App
    location / {
        root /usr/share/nginx/html;
        index radar.html index.html;
        try_files \$uri \$uri/ =404;
    }

    # 2. Flight Data
    location /dump1090-fa/ {
        proxy_pass http://$DUMP1090_IP:$DUMP1090_PORT/dump1090-fa/;
        proxy_set_header Host \$host;
    }

    # 3. Audio
    location /airbands {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airbands;
        proxy_buffering off;
        chunked_transfer_encoding off;
    }

    # 4. AI (Uses Dynamic Backend)
    location /ollama/ {
        rewrite ^/ollama/(.*) /\$1 break;
        proxy_pass http://ollama_backend;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 5s;
    }
}
EOF

# --- [GENERATE DOCKER COMPOSE] ---
echo ">>> Generating Docker Compose..."
cat > "$PROJECT_NAME/docker-compose.yml" <<EOF
version: '3.8'
services:
  radar-gateway:
    image: nginx:alpine
    container_name: radar1090-gateway
    restart: always
    ports:
      - "8080:80"
    volumes:
      # Website Files
      - ./src:/usr/share/nginx/html:ro
      # Nginx Main Config
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      # The Boot Script
      - ./boot.sh:/boot.sh:ro
    # Override startup command to run our scanner first
    entrypoint: ["/bin/sh", "/boot.sh"]
EOF

# --- [PATCH SOURCE CODE] ---
echo ">>> Patching source code..."
sed -i 's|const AUDIO_STREAM_URL = .*;|const AUDIO_STREAM_URL = "/airbands";|g' "$PROJECT_NAME/src/app.js"
sed -i "s|const DUMP1090_HOST = .*;|const DUMP1090_HOST = window.location.hostname;|g" "$PROJECT_NAME/src/app.js"
sed -i "s|const DUMP1090_PORT = .*;|const DUMP1090_PORT = window.location.port \|\| (window.location.protocol === 'https:' ? 443 : 80);|g" "$PROJECT_NAME/src/app.js"
sed -i "s|const DUMP1090_PROTOCOL = .*;|const DUMP1090_PROTOCOL = window.location.protocol.replace(':', '');|g" "$PROJECT_NAME/src/app.js"
sed -i 's|dump1090Base: "http.*",|dump1090Base: "/dump1090-fa/data",|g' "$PROJECT_NAME/src/radar.html"
sed -i 's|ollamaUrl: defaultOllamaUrl,|ollamaUrl: window.location.origin + "/ollama",|g' "$PROJECT_NAME/src/radar.html"

# --- [DEPLOY] ---
echo ">>> Deploying..."
cd "$PROJECT_NAME"
docker compose down --remove-orphans 2>/dev/null || sudo docker compose down --remove-orphans 2>/dev/null

if docker compose up -d 2>/dev/null; then
    echo "SUCCESS! Gateway is scanning for AI servers..."
    echo "Check the logs to see what it found: docker logs radar1090-gateway"
else
    echo "Retrying with sudo..."
    sudo docker compose up -d
    echo "Check the logs: sudo docker logs radar1090-gateway"
fi
