#!/bin/bash

# ==========================================
# INFRASTRUCTURE CONFIGURATION
# ==========================================
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"
AUDIO_IP="192.168.50.4"
AUDIO_PORT="8000"

# AI SETTINGS (Auto-Discovery)
OLLAMA_PORT="11434"
SCAN_NET="192.168.50.0/24"

# Repo Settings
REPO_URL="https://github.com/dylan7474/radar1090html5.git"
SOURCE_DIR="radar1090html5" 
PROJECT_NAME="radar-docker"
# ==========================================

echo ">>> STARTING ULTIMATE RADAR DEPLOYMENT..."
echo "   - Mode: Docker Proxy + Auto-Discovery"
echo "   - Target: Virgin Build (will install dependencies)"

# ------------------------------------------
# STEP 1: SYSTEM PREP & PREREQUISITES
# ------------------------------------------
echo ">>> [1/7] Installing Prerequisites (git, curl, rsync)..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq git curl rsync
elif command -v yum &> /dev/null; then
    sudo yum install -y -q git curl rsync
fi

# ------------------------------------------
# STEP 2: INSTALL DOCKER
# ------------------------------------------
if ! command -v docker &> /dev/null; then
    echo ">>> [2/7] Docker not found. Installing via get.docker.com..."
    echo ">>> This usually takes about 5 minutes. Go make a cup of tea! ☕"
    
    curl -sSL https://get.docker.com | sudo sh

    echo ">>> Docker installed. Enabling service..."
    sudo systemctl enable --now docker
    
    echo ">>> Adding user $USER to 'docker' group..."
    sudo usermod -aG docker "$USER"
else
    echo ">>> [2/7] Docker is already installed. Skipping."
fi

# ------------------------------------------
# STEP 3: CLONE REPOSITORY
# ------------------------------------------
echo ">>> [3/7] Fetching Source Code..."
if [ -d "$SOURCE_DIR" ]; then
    echo ">>> Updating existing repo..."
    cd "$SOURCE_DIR" && git pull && cd ..
else
    git clone "$REPO_URL"
fi

# ------------------------------------------
# STEP 4: PREPARE FILES
# ------------------------------------------
echo ">>> [4/7] Preparing Deployment Directory..."
mkdir -p "$PROJECT_NAME/src"
if [ -d "$SOURCE_DIR/.git" ]; then
    rsync -av --exclude='.git' "$SOURCE_DIR/" "$PROJECT_NAME/src/" > /dev/null 2>&1 || cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
else
    cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
fi

# ------------------------------------------
# STEP 5: CREATE AUTO-DISCOVERY BOOT SCRIPT
# ------------------------------------------
echo ">>> [5/7] Creating Auto-Discovery Boot Logic..."
cat > "$PROJECT_NAME/boot.sh" <<EOF
#!/bin/sh
echo "------------------------------------------------"
echo "🔍 STARTING OLLAMA NETWORK DISCOVERY..."
echo "------------------------------------------------"

# Install scanner inside container
apk add --no-cache nmap > /dev/null 2>&1

# Scan network
FOUND_IPS=\$(nmap -p $OLLAMA_PORT --open $SCAN_NET -oG - | grep "/open/" | awk '{print \$2}')

# Write Nginx Config
UPSTREAM_FILE="/etc/nginx/conf.d/ollama_upstreams.conf"
echo "upstream ollama_backend {" > \$UPSTREAM_FILE

COUNT=0
for ip in \$FOUND_IPS; do
    echo "✅ Found Ollama Server: \$ip"
    echo "    server \$ip:$OLLAMA_PORT;" >> \$UPSTREAM_FILE
    COUNT=\$((COUNT+1))
done

if [ "\$COUNT" -eq "0" ]; then
    echo "⚠️  NO OLLAMA SERVERS FOUND! Defaulting to localhost."
    echo "    server 127.0.0.1:$OLLAMA_PORT;" >> \$UPSTREAM_FILE
fi

echo "}" >> \$UPSTREAM_FILE
echo "------------------------------------------------"
echo "🚀 DISCOVERY COMPLETE. Found \$COUNT servers."
echo "   Starting Nginx..."
echo "------------------------------------------------"
nginx -g "daemon off;"
EOF
chmod +x "$PROJECT_NAME/boot.sh"

# ------------------------------------------
# STEP 6: GENERATE CONFIGURATION
# ------------------------------------------
echo ">>> [6/7] Generating Configuration Files..."

# Nginx Template
cat > "$PROJECT_NAME/nginx.conf" <<EOF
include /etc/nginx/conf.d/ollama_upstreams.conf;

server {
    listen 80;
    server_name localhost;

    # Web App
    location / {
        root /usr/share/nginx/html;
        index radar.html index.html;
        try_files \$uri \$uri/ =404;
    }

    # Flight Data
    location /dump1090-fa/ {
        proxy_pass http://$DUMP1090_IP:$DUMP1090_PORT/dump1090-fa/;
        proxy_set_header Host \$host;
    }

    # Audio
    location /airbands {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airbands;
        proxy_buffering off;
        chunked_transfer_encoding off;
    }

    # AI (Auto-Discovered)
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
      - ./boot.sh:/boot.sh:ro
    entrypoint: ["/bin/sh", "/boot.sh"]
EOF

# Patch Code (Apply Relative Paths)
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

# Cleanup old
sudo docker compose down --remove-orphans 2>/dev/null

# Attempt launch with group refresh or sudo fallback
if sg docker -c "docker compose up -d" 2>/dev/null; then
    echo ">>> Success! Started via 'docker' group."
else
    echo ">>> Starting via sudo..."
    sudo docker compose up -d
fi

echo ""
echo "========================================================"
echo " 🚀 DEPLOYMENT COMPLETE"
echo "========================================================"
echo " Access your Radar: http://$(hostname -I | awk '{print $1}'):8080/radar.html"
echo " Discovery: The container is scanning $SCAN_NET for AI..."
echo "========================================================"#!/bin/bash

# ==========================================
# INFRASTRUCTURE CONFIGURATION
# ==========================================
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"
AUDIO_IP="192.168.50.4"
AUDIO_PORT="8000"

# AI SETTINGS (Auto-Discovery)
OLLAMA_PORT="11434"
SCAN_NET="192.168.50.0/24"

# Repo Settings
REPO_URL="https://github.com/dylan7474/radar1090html5.git"
SOURCE_DIR="radar1090html5" 
PROJECT_NAME="radar-docker"
# ==========================================

echo ">>> STARTING ULTIMATE RADAR DEPLOYMENT..."
echo "   - Mode: Docker Proxy + Auto-Discovery"
echo "   - Target: Virgin Build (will install dependencies)"

# ------------------------------------------
# STEP 1: SYSTEM PREP & PREREQUISITES
# ------------------------------------------
echo ">>> [1/7] Installing Prerequisites (git, curl, rsync)..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq git curl rsync
elif command -v yum &> /dev/null; then
    sudo yum install -y -q git curl rsync
fi

# ------------------------------------------
# STEP 2: INSTALL DOCKER
# ------------------------------------------
if ! command -v docker &> /dev/null; then
    echo ">>> [2/7] Docker not found. Installing via get.docker.com..."
    echo ">>> This usually takes about 5 minutes. Go make a cup of tea! ☕"
    
    curl -sSL https://get.docker.com | sudo sh

    echo ">>> Docker installed. Enabling service..."
    sudo systemctl enable --now docker
    
    echo ">>> Adding user $USER to 'docker' group..."
    sudo usermod -aG docker "$USER"
else
    echo ">>> [2/7] Docker is already installed. Skipping."
fi

# ------------------------------------------
# STEP 3: CLONE REPOSITORY
# ------------------------------------------
echo ">>> [3/7] Fetching Source Code..."
if [ -d "$SOURCE_DIR" ]; then
    echo ">>> Updating existing repo..."
    cd "$SOURCE_DIR" && git pull && cd ..
else
    git clone "$REPO_URL"
fi

# ------------------------------------------
# STEP 4: PREPARE FILES
# ------------------------------------------
echo ">>> [4/7] Preparing Deployment Directory..."
mkdir -p "$PROJECT_NAME/src"
if [ -d "$SOURCE_DIR/.git" ]; then
    rsync -av --exclude='.git' "$SOURCE_DIR/" "$PROJECT_NAME/src/" > /dev/null 2>&1 || cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
else
    cp -r "$SOURCE_DIR/"* "$PROJECT_NAME/src/"
fi

# ------------------------------------------
# STEP 5: CREATE AUTO-DISCOVERY BOOT SCRIPT
# ------------------------------------------
echo ">>> [5/7] Creating Auto-Discovery Boot Logic..."
cat > "$PROJECT_NAME/boot.sh" <<EOF
#!/bin/sh
echo "------------------------------------------------"
echo "🔍 STARTING OLLAMA NETWORK DISCOVERY..."
echo "------------------------------------------------"

# Install scanner inside container
apk add --no-cache nmap > /dev/null 2>&1

# Scan network
FOUND_IPS=\$(nmap -p $OLLAMA_PORT --open $SCAN_NET -oG - | grep "/open/" | awk '{print \$2}')

# Write Nginx Config
UPSTREAM_FILE="/etc/nginx/conf.d/ollama_upstreams.conf"
echo "upstream ollama_backend {" > \$UPSTREAM_FILE

COUNT=0
for ip in \$FOUND_IPS; do
    echo "✅ Found Ollama Server: \$ip"
    echo "    server \$ip:$OLLAMA_PORT;" >> \$UPSTREAM_FILE
    COUNT=\$((COUNT+1))
done

if [ "\$COUNT" -eq "0" ]; then
    echo "⚠️  NO OLLAMA SERVERS FOUND! Defaulting to localhost."
    echo "    server 127.0.0.1:$OLLAMA_PORT;" >> \$UPSTREAM_FILE
fi

echo "}" >> \$UPSTREAM_FILE
echo "------------------------------------------------"
echo "🚀 DISCOVERY COMPLETE. Found \$COUNT servers."
echo "   Starting Nginx..."
echo "------------------------------------------------"
nginx -g "daemon off;"
EOF
chmod +x "$PROJECT_NAME/boot.sh"

# ------------------------------------------
# STEP 6: GENERATE CONFIGURATION
# ------------------------------------------
echo ">>> [6/7] Generating Configuration Files..."

# Nginx Template
cat > "$PROJECT_NAME/nginx.conf" <<EOF
include /etc/nginx/conf.d/ollama_upstreams.conf;

server {
    listen 80;
    server_name localhost;

    # Web App
    location / {
        root /usr/share/nginx/html;
        index radar.html index.html;
        try_files \$uri \$uri/ =404;
    }

    # Flight Data
    location /dump1090-fa/ {
        proxy_pass http://$DUMP1090_IP:$DUMP1090_PORT/dump1090-fa/;
        proxy_set_header Host \$host;
    }

    # Audio
    location /airbands {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airbands;
        proxy_buffering off;
        chunked_transfer_encoding off;
    }

    # AI (Auto-Discovered)
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
      - ./boot.sh:/boot.sh:ro
    entrypoint: ["/bin/sh", "/boot.sh"]
EOF

# Patch Code (Apply Relative Paths)
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

# Cleanup old
sudo docker compose down --remove-orphans 2>/dev/null

# Attempt launch with group refresh or sudo fallback
if sg docker -c "docker compose up -d" 2>/dev/null; then
    echo ">>> Success! Started via 'docker' group."
else
    echo ">>> Starting via sudo..."
    sudo docker compose up -d
fi

echo ""
echo "========================================================"
echo " 🚀 DEPLOYMENT COMPLETE"
echo "========================================================"
echo " Access your Radar: http://$(hostname -I | awk '{print $1}'):8080/radar.html"
echo " Discovery: The container is scanning $SCAN_NET for AI..."
echo "========================================================"
