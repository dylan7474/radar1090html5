#!/bin/bash

# ==========================================
# INFRASTRUCTURE CONFIGURATION
# ==========================================
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"
AUDIO_IP="192.168.50.4"
AUDIO_PORT="8000"

# --- [CHANGE THIS PORT HERE] ---
# The port you want to use to access the website
GATEWAY_PORT="8090"

# AI DISCOVERY SETTINGS
OLLAMA_PORT="11434"
SCAN_NET="192.168.50.0/24"
CHECK_INTERVAL="600" # 10 Minutes

# Repo Settings
REPO_URL="https://github.com/dylan7474/radar1090html5.git"
SOURCE_DIR="radar1090html5" 
PROJECT_NAME="radar-docker"
# ==========================================

echo ">>> STARTING SMART RADAR DEPLOYMENT"
echo ">>> Target Port: $GATEWAY_PORT"

# ------------------------------------------
# STEP 1: INSTALL SYSTEM PREREQUISITES
# ------------------------------------------
echo ">>> [1/7] Checking System Tools..."
if command -v apt-get &> /dev/null; then
    if ! command -v git &> /dev/null || ! command -v curl &> /dev/null; then
        echo "    Installing git, curl, rsync..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq git curl rsync
    fi
elif command -v yum &> /dev/null; then
    if ! command -v git &> /dev/null; then
        sudo yum install -y -q git curl rsync
    fi
fi

# ------------------------------------------
# STEP 2: INSTALL DOCKER (If missing)
# ------------------------------------------
if ! command -v docker &> /dev/null; then
    echo ">>> [2/7] Docker not found. Installing..."
    echo "    (This takes ~5 mins. Go make a cup of tea! ☕)"
    
    curl -sSL https://get.docker.com | sudo sh

    echo "    Enabling Docker..."
    sudo systemctl enable --now docker
    sudo usermod -aG docker "$USER"
else
    echo ">>> [2/7] Docker is already installed. Skipping."
fi

# ------------------------------------------
# STEP 3: GET SOURCE CODE
# ------------------------------------------
echo ">>> [3/7] Fetching Source Code..."
if [ -d "$SOURCE_DIR" ]; then
    echo "    Updating existing repo..."
    cd "$SOURCE_DIR" && git pull && cd ..
else
    git clone "$REPO_URL"
fi

# ------------------------------------------
# STEP 4: PREPARE FOLDERS
# ------------------------------------------
echo ">>> [4/7] Preparing Deployment Directory..."
mkdir -p "$PROJECT_NAME/src"
if [ -d "$SOURCE_DIR/.git" ]; then
    rsync -av --exclude='.git' "$SOURCE_DIR/" "$PROJECT_NAME/src/" > /dev/null 2>&1 || cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
else
    cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
fi

# ------------------------------------------
# STEP 5: CREATE "SMART" BOOT SCRIPT
# ------------------------------------------
echo ">>> [5/7] Creating Watchdog Boot Script..."

cat > "$PROJECT_NAME/boot.sh" <<EOF
#!/bin/sh

# Configuration Function
run_scan_and_config() {
    echo "------------------------------------------------"
    echo "🔍 WATCHDOG: Scanning for AI Servers..."
    
    RAW_IPS=\$(nmap -p $OLLAMA_PORT --open $SCAN_NET -oG - | grep "/open/" | awk '{print \$2}')

    if [ -z "\$RAW_IPS" ]; then
        echo "⚠️  No servers found. Defaulting to localhost."
        echo "upstream ollama_backend { server 127.0.0.1:$OLLAMA_PORT; }" > /etc/nginx/ollama_upstreams.conf
        return
    fi

    echo "⏱️  Benchmarking speed..."
    rm -f /tmp/servers.txt
    touch /tmp/servers.txt

    for ip in \$RAW_IPS; do
        TIME=\$(curl -o /dev/null -s -w '%{time_total}' --connect-timeout 2 -m 5 "http://\$ip:$OLLAMA_PORT/api/tags")
        
        if [ -z "\$TIME" ] || [ "\$TIME" = "0.000" ]; then
            echo "   ❌ \$ip - Unreachable"
        else
            echo "   ⚡ \$ip - \$TIMEs"
            echo "\$TIME \$ip" >> /tmp/servers.txt
        fi
    done

    SORTED_SERVERS=\$(sort -n /tmp/servers.txt | awk '{print \$2}')

    UPSTREAM_FILE="/etc/nginx/ollama_upstreams.conf"
    TEMP_CONFIG="/tmp/ollama_upstreams.tmp"
    
    echo "upstream ollama_backend {" > \$TEMP_CONFIG
    IS_FIRST=1
    for ip in \$SORTED_SERVERS; do
        if [ "\$IS_FIRST" -eq "1" ]; then
            echo "   🏆 PRIMARY: \$ip"
            echo "    server \$ip:$OLLAMA_PORT;" >> \$TEMP_CONFIG
            IS_FIRST=0
        else
            echo "   🥈 BACKUP:  \$ip"
            echo "    server \$ip:$OLLAMA_PORT backup;" >> \$TEMP_CONFIG
        fi
    done
    echo "}" >> \$TEMP_CONFIG

    mv \$TEMP_CONFIG \$UPSTREAM_FILE
    
    if pgrep nginx > /dev/null; then
        echo "🔄 Reloading Nginx Configuration..."
        nginx -s reload
    fi
    echo "------------------------------------------------"
}

# --- MAIN STARTUP ---
apk add --no-cache nmap curl > /dev/null 2>&1
run_scan_and_config

(
  while true; do
    sleep $CHECK_INTERVAL
    run_scan_and_config
  done
) &

echo "🚀 Starting Nginx Gateway..."
nginx -g "daemon off;"
EOF
chmod +x "$PROJECT_NAME/boot.sh"

# ------------------------------------------
# STEP 6: GENERATE CONFIGURATION
# ------------------------------------------
echo ">>> [6/7] Generating Nginx & Docker Config..."

# Nginx Template
cat > "$PROJECT_NAME/nginx.conf" <<EOF
include /etc/nginx/ollama_upstreams.conf;

server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index radar.html index.html;
        try_files \$uri \$uri/ =404;
    }

    location /dump1090-fa/ {
        proxy_pass http://$DUMP1090_IP:$DUMP1090_PORT/dump1090-fa/;
        proxy_set_header Host \$host;
    }

    location /airbands {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airbands;
        proxy_buffering off;
        chunked_transfer_encoding off;
    }

    location /ollama/ {
        rewrite ^/ollama/(.*) /\$1 break;
        proxy_pass http://ollama_backend;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 5s;
    }
}
EOF

# Docker Compose (Updated with GATEWAY_PORT variable)
cat > "$PROJECT_NAME/docker-compose.yml" <<EOF
version: '3.8'
services:
  radar-gateway:
    image: nginx:alpine
    container_name: radar1090-gateway
    restart: always
    ports:
      - "$GATEWAY_PORT:80"
    volumes:
      - ./src:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./boot.sh:/boot.sh:ro
    entrypoint: ["/bin/sh", "/boot.sh"]
EOF

# Patch Code
sed -i 's|const AUDIO_STREAM_URL = .*;|const AUDIO_STREAM_URL = "/airbands";|g' "$PROJECT_NAME/src/app.js"
sed -i "s|const DUMP1090_HOST = .*;|const DUMP1090_HOST = window.location.hostname;|g" "$PROJECT_NAME/src/app.js"
sed -i "s|const DUMP1090_PORT = .*;|const DUMP1090_PORT = window.location.port \|\| (window.location.protocol === 'https:' ? 443 : 80);|g" "$PROJECT_NAME/src/app.js"
sed -i "s|const DUMP1090_PROTOCOL = .*;|const DUMP1090_PROTOCOL = window.location.protocol.replace(':', '');|g" "$PROJECT_NAME/src/app.js"
sed -i 's|dump1090Base: "http.*",|dump1090Base: "/dump1090-fa/data",|g' "$PROJECT_NAME/src/radar.html"
sed -i 's|ollamaUrl: defaultOllamaUrl,|ollamaUrl: window.location.origin + "/ollama",|g' "$PROJECT_NAME/src/radar.html"

# ------------------------------------------
# STEP 7: LAUNCH
# ------------------------------------------
echo ">>> [7/7] Launching Containers..."
cd "$PROJECT_NAME"

if command -v docker &> /dev/null; then
    sudo docker compose down --remove-orphans 2>/dev/null
fi

if sg docker -c "docker compose up -d" 2>/dev/null; then
    echo ">>> Success! Started via 'docker' group."
else
    echo ">>> Group refresh pending. Starting via sudo..."
    sudo docker compose up -d
fi

echo ""
echo "========================================================"
echo " 🚀 DEPLOYMENT COMPLETE"
echo "========================================================"
echo " Access your Radar: http://$(hostname -I | awk '{print $1}'):$GATEWAY_PORT/radar.html"
echo "========================================================"
