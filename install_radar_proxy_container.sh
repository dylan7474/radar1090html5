#!/bin/bash

# ==========================================
# INFRASTRUCTURE CONFIGURATION
# ==========================================
# 1. Backend Flight Data (Your Pi)
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"

# 2. Backend Audio Server (Your Pi)
AUDIO_IP="192.168.50.4"
AUDIO_PORT="8000"

# 3. AI Servers (Primary vs Backup)
# .5 is used by default. .3 is used ONLY if .5 is offline.
OLLAMA_PRIMARY="192.168.50.5"
OLLAMA_BACKUP="192.168.50.3"
OLLAMA_PORT="11434"

# Standard Settings
REPO_URL="https://github.com/dylan7474/radar1090html5.git"
SOURCE_DIR="radar1090html5" 
PROJECT_NAME="radar-docker"
# ==========================================

echo ">>> Starting Radar1090 Deployment (Primary/Backup Config)..."

# 1. CHECK ENVIRONMENT
if ! command -v git &> /dev/null; then echo "Error: git is missing."; exit 1; fi
if ! command -v docker &> /dev/null; then echo "Error: docker is missing."; exit 1; fi

# 2. GET SOURCE CODE
if [ -d "$SOURCE_DIR" ]; then
    echo ">>> Updating existing repository..."
    cd "$SOURCE_DIR" && git pull && cd ..
else
    echo ">>> Cloning repository..."
    git clone "$REPO_URL"
fi

# 3. PREPARE DEPLOYMENT FOLDER
echo ">>> Preparing Docker environment..."
mkdir -p "$PROJECT_NAME/src"
# Sync the latest code to the deployment folder
if [ -d "$SOURCE_DIR/.git" ]; then
    rsync -av --exclude='.git' "$SOURCE_DIR/" "$PROJECT_NAME/src/" > /dev/null 2>&1 || cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
else
    cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
fi

# 4. GENERATE LOAD BALANCER CONFIG (NGINX)
echo ">>> Generating Nginx Load Balancer Config..."

cat > "$PROJECT_NAME/nginx.conf" <<EOF
# Define the group of AI servers
upstream ollama_backend {
    # The 'backup' flag tells Nginx to ONLY use this server 
    # if the primary servers are unavailable.
    server $OLLAMA_PRIMARY:$OLLAMA_PORT;
    server $OLLAMA_BACKUP:$OLLAMA_PORT backup;
}

server {
    listen 80;
    server_name localhost;

    # 1. Serve the Web App (Static Files)
    location / {
        root /usr/share/nginx/html;
        index radar.html index.html;
        try_files \$uri \$uri/ =404;
    }

    # 2. Proxy Flight Data to Backend
    location /dump1090-fa/ {
        proxy_pass http://$DUMP1090_IP:$DUMP1090_PORT/dump1090-fa/;
        proxy_set_header Host \$host;
    }

    # 3. Proxy Audio to Backend
    location /airbands {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airbands;
        proxy_buffering off;
        chunked_transfer_encoding off;
    }

    # 4. Proxy AI Requests (Load Balanced)
    location /ollama/ {
        rewrite ^/ollama/(.*) /\$1 break;
        proxy_pass http://ollama_backend;
        
        # Optimization for streaming text
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 5s;
    }
}
EOF

# 5. GENERATE DOCKER COMPOSE
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
      # Mount the Source Code
      - ./src:/usr/share/nginx/html:ro
      # Mount the Config
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
EOF

# 6. DEPLOY
echo ">>> Deploying Container..."
cd "$PROJECT_NAME"

# Clean up old containers if they exist to ensure config reload
docker compose down --remove-orphans 2>/dev/null || sudo docker compose down --remove-orphans 2>/dev/null

if docker compose up -d 2>/dev/null; then
    echo "SUCCESS! Radar Gateway is active on Port 8080."
    echo "AI Config: Primary .5, Backup .3"
else
    echo "Standard start failed. Trying sudo..."
    sudo docker compose up -d
fi
