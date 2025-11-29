#!/bin/bash

# ==========================================
# INFRASTRUCTURE CONFIGURATION
# ==========================================
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"
AUDIO_IP="192.168.50.4"
AUDIO_PORT="8000"

# AI SERVERS (Primary & Backup)
# .5 is Primary. If it dies, Nginx switches to .3 automatically.
OLLAMA_PRIMARY="192.168.50.5"
OLLAMA_BACKUP="192.168.50.3"
OLLAMA_PORT="11434"

# Repo Settings
REPO_URL="https://github.com/dylan7474/radar1090html5.git"
SOURCE_DIR="radar1090html5" 
PROJECT_NAME="radar-docker"
# ==========================================

echo ">>> STARTING RADAR INSTALLATION (Virgin Build + Crash Fix)..."

# ------------------------------------------
# STEP 1: INSTALL SYSTEM PREREQUISITES
# ------------------------------------------
echo ">>> [1/7] Checking System Tools..."
if command -v apt-get &> /dev/null; then
    # Silence output for cleaner logs
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
    echo "    (This takes ~5 mins. Time for tea! ☕)"
    
    curl -sSL https://get.docker.com | sudo sh

    echo "    Enabling Docker..."
    sudo systemctl enable --now docker
    
    echo "    Adding user '$USER' to docker group..."
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
# STEP 5: GENERATE CONFIGURATION (FIXED)
# ------------------------------------------
echo ">>> [5/7] Generating Crash-Proof Config..."

# Nginx Config
# FIX: We write the upstream config inside the main file to avoid 
# the "Duplicate Upstream" crash caused by include files.
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
# STEP 6: PATCH SOURCE CODE
# ------------------------------------------
echo ">>> [6/7] Patching Code for Proxy..."
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

# Clean up old containers
if command -v docker &> /dev/null; then
    sudo docker compose down --remove-orphans 2>/dev/null
fi

# Attempt launch. 
# We use 'sg' to run as the 'docker' group immediately without logout.
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
echo " Access your Radar: http://$(hostname -I | awk '{print $1}'):8080/radar.html"
echo " Configuration: Primary AI (.5), Backup AI (.3)"
echo "========================================================"#!/bin/bash

# ==========================================
# INFRASTRUCTURE CONFIGURATION
# ==========================================
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"
AUDIO_IP="192.168.50.4"
AUDIO_PORT="8000"

# AI SERVERS (Primary & Backup)
# .5 is Primary. If it dies, Nginx switches to .3 automatically.
OLLAMA_PRIMARY="192.168.50.5"
OLLAMA_BACKUP="192.168.50.3"
OLLAMA_PORT="11434"

# Repo Settings
REPO_URL="https://github.com/dylan7474/radar1090html5.git"
SOURCE_DIR="radar1090html5" 
PROJECT_NAME="radar-docker"
# ==========================================

echo ">>> STARTING RADAR INSTALLATION (Virgin Build + Crash Fix)..."

# ------------------------------------------
# STEP 1: INSTALL SYSTEM PREREQUISITES
# ------------------------------------------
echo ">>> [1/7] Checking System Tools..."
if command -v apt-get &> /dev/null; then
    # Silence output for cleaner logs
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
    echo "    (This takes ~5 mins. Time for tea! ☕)"
    
    curl -sSL https://get.docker.com | sudo sh

    echo "    Enabling Docker..."
    sudo systemctl enable --now docker
    
    echo "    Adding user '$USER' to docker group..."
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
# STEP 5: GENERATE CONFIGURATION (FIXED)
# ------------------------------------------
echo ">>> [5/7] Generating Crash-Proof Config..."

# Nginx Config
# FIX: We write the upstream config inside the main file to avoid 
# the "Duplicate Upstream" crash caused by include files.
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
# STEP 6: PATCH SOURCE CODE
# ------------------------------------------
echo ">>> [6/7] Patching Code for Proxy..."
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

# Clean up old containers
if command -v docker &> /dev/null; then
    sudo docker compose down --remove-orphans 2>/dev/null
fi

# Attempt launch. 
# We use 'sg' to run as the 'docker' group immediately without logout.
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
echo " Access your Radar: http://$(hostname -I | awk '{print $1}'):8080/radar.html"
echo " Configuration: Primary AI (.5), Backup AI (.3)"
echo "========================================================"
