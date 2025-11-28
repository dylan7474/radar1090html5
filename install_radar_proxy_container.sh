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
OLLAMA_PRIMARY="192.168.50.5"
OLLAMA_BACKUP="192.168.50.3"
OLLAMA_PORT="11434"

# Repo Settings
REPO_URL="https://github.com/dylan7474/radar1090html5.git"
SOURCE_DIR="radar1090html5" 
PROJECT_NAME="radar-docker"
# ==========================================

echo ">>> STARTING VIRGIN BUILD DEPLOYMENT..."
echo ">>> This will install Docker, prerequisites, and the Radar Gateway."

# ------------------------------------------
# STEP 1: SYSTEM PREP & PREREQUISITES
# ------------------------------------------
echo ">>> [1/6] Installing Prerequisites (git, curl, rsync)..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq git curl rsync
elif command -v yum &> /dev/null; then
    sudo yum install -y -q git curl rsync
fi

# ------------------------------------------
# STEP 2: INSTALL DOCKER (The "Tea Break" Step)
# ------------------------------------------
if ! command -v docker &> /dev/null; then
    echo ">>> [2/6] Docker not found. Installing via get.docker.com..."
    echo ">>> This usually takes about 5 minutes. Go make a cup of tea! ☕"
    
    curl -sSL https://get.docker.com | sudo sh

    echo ">>> Docker installed."
    echo ">>> Starting Docker service..."
    sudo systemctl enable --now docker
    sudo systemctl is-active docker

    echo ">>> Adding user $USER to 'docker' group..."
    sudo usermod -aG docker "$USER"
    
    echo ">>> Verifying install with hello-world..."
    sudo docker run --rm hello-world
else
    echo ">>> [2/6] Docker is already installed. Skipping."
fi

# ------------------------------------------
# STEP 3: CLONE REPOSITORY
# ------------------------------------------
echo ">>> [3/6] Fetching Source Code..."
if [ -d "$SOURCE_DIR" ]; then
    echo ">>> Updating existing repo..."
    cd "$SOURCE_DIR" && git pull && cd ..
else
    git clone "$REPO_URL"
fi

# ------------------------------------------
# STEP 4: PREPARE FILES
# ------------------------------------------
echo ">>> [4/6] Preparing Deployment Directory..."
mkdir -p "$PROJECT_NAME/src"
if [ -d "$SOURCE_DIR/.git" ]; then
    rsync -av --exclude='.git' "$SOURCE_DIR/" "$PROJECT_NAME/src/" > /dev/null 2>&1 || cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
else
    cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
fi

# ------------------------------------------
# STEP 5: GENERATE CONFIGURATION
# ------------------------------------------
echo ">>> [5/6] Generating Configuration Files..."

# Nginx Config
cat > "$PROJECT_NAME/nginx.conf" <<EOF
upstream ollama_backend {
    server $OLLAMA_PRIMARY:$OLLAMA_PORT;
    server $OLLAMA_BACKUP:$OLLAMA_PORT backup;
}

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

    # 4. AI (Load Balanced)
    location /ollama/ {
        rewrite ^/ollama/(.*) /\$1 break;
        proxy_pass http://ollama_backend;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 5s;
    }
}
EOF

# Docker Compose
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
      - ./src:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
EOF

# ------------------------------------------
# STEP 6: LAUNCH
# ------------------------------------------
echo ">>> [6/6] Launching Containers..."
cd "$PROJECT_NAME"

# Clean up any old instances
sudo docker compose down --remove-orphans 2>/dev/null

# Attempt to start. 
# NOTE: Even though we added the user to the group, the current shell session 
# doesn't know that yet. We use 'sg' to execute as the new group, or fallback to sudo.
if sg docker -c "docker compose up -d" 2>/dev/null; then
    echo ">>> Success! Started as user '$USER' (via new group permissions)."
else
    echo ">>> Group refresh pending. Starting via sudo for this session..."
    sudo docker compose up -d
fi

echo ""
echo "========================================================"
echo " 🚀 DEPLOYMENT COMPLETE"
echo "========================================================"
echo " Access your Radar: http://$(hostname -I | awk '{print $1}'):8080/radar.html"
echo ""
echo " NOTE: You have been added to the 'docker' group."
echo " To run docker commands without 'sudo' in the future,"
echo " please LOG OUT and LOG BACK IN (or run: newgrp docker)."
echo "========================================================"
