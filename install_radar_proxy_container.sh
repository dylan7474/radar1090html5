#!/bin/bash
set -euo pipefail

# ==========================================
# 🔐 ARGUMENT CHECK: PASSWORD & MODEL
# ==========================================
DEFAULT_MODEL="gemma3:270m"

if [ "$#" -lt 1 ]; then
    echo "❌ Error: You must provide at least a password."
    echo "Usage: sudo ./deploy_all_v17.sh 'Password' ['optional:model-name']"
    echo "Example: sudo ./deploy_all_v17.sh 'secret123' 'deepseek-r1:1.5b'"
    exit 1
fi

RAW_PASS="$1"
# Use the second argument if provided, otherwise use default
BENCHMARK_MODEL="${2:-$DEFAULT_MODEL}"

# ==========================================
# 🛠️ CONFIGURATION VARIABLES
# ==========================================

# --- REMOTE RADAR SETTINGS ---
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"

# --- LOCAL AUDIO SETTINGS ---
AUDIO_IP="127.0.0.1"
AUDIO_PORT="8000"

# --- AI DISCOVERY SETTINGS ---
OLLAMA_PORT="11434"
SCAN_NET="192.168.50.0/24"
CHECK_INTERVAL="600"

# --- SYSTEM SETTINGS ---
GATEWAY_PORT="80" 
ICECAST_PASS="$RAW_PASS"
AIRBAND_REPO="https://github.com/szpajder/RTLSDR-Airband.git"
AIRBAND_DIR="rtl_airband"

# Deployment Config Folder
RUNTIME_DIR="radar-runtime"

# --- Sanitization ---
SYSTEMD_SAFE_PASS=${RAW_PASS//$/$$}
SED_SAFE_PASS=$(echo "$RAW_PASS" | sed 's/|/\\|/g' | sed 's/&/\\&/g')
CURRENT_USER=${SUDO_USER:-$USER}
CURRENT_GROUP=$(id -gn $CURRENT_USER)
CURRENT_IP=$(hostname -I | awk '{print $1}')

# ==========================================
# 🔄 HELPER FUNCTIONS
# ==========================================
function run_with_retry() {
    local n=1
    local max=5
    local delay=5
    while true; do
        "$@" && break || {
            if [[ $n -lt $max ]]; then
                ((n++))
                echo "⚠️ Command failed. Retrying in $delay sec (Attempt $n/$max)..."
                sleep $delay;
            else
                echo "❌ Command failed after $max attempts."
                return 1
            fi
        }
    done
}

echo ">>> STARTING MASTER DEPLOYMENT (V17 - Custom Model Argument)"
echo ">>> Host IP: $CURRENT_IP"
echo ">>> Target Model: $BENCHMARK_MODEL"

# ==========================================
# PHASE 1: PREPARATION & DEPENDENCIES
# ==========================================
echo ">>> [1/7] Preparing System..."

if [ ! -f "radar.html" ]; then
    echo "❌ Error: radar.html not found!"
    echo "   Please run this script from inside the 'radar1090html5' repository."
    exit 1
fi

sudo systemctl stop lighttpd apache2 nginx 2>/dev/null || true
sudo systemctl disable lighttpd apache2 nginx 2>/dev/null || true

if [ -f /etc/apt/sources.list.d/docker.list ]; then
    sudo rm /etc/apt/sources.list.d/docker.list
fi

run_with_retry sudo apt-get update -qq

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "    Docker not found. Installing manually..."
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    if [ -f /etc/apt/keyrings/docker.asc ]; then sudo rm /etc/apt/keyrings/docker.asc; fi
    run_with_retry curl -fsSL https://download.docker.com/linux/raspbian/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/raspbian bookworm stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    run_with_retry sudo apt-get update -qq
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker
    sudo usermod -aG docker "$CURRENT_USER"
else
    echo "    ✅ Docker is already installed."
fi

# Install Tools (including zram-tools)
sudo apt-get install -y -qq \
  git build-essential cmake libmp3lame-dev libshout3-dev \
  libasound2-dev ffmpeg rtl-sdr pkg-config jq \
  icecast2 netcat-openbsd libconfig++-dev librtlsdr-dev libfftw3-dev liquidsoap curl \
  zram-tools bc

echo "✅ Dependencies Installed."

# ==========================================
# PHASE 1.5: SWAP & ZRAM CONFIGURATION
# ==========================================
echo ">>> [2/7] Optimizing Memory (ZRAM)..."

# 1. Disable slow SD card swap
if systemctl is-active --quiet dphys-swapfile; then
    echo "    🚫 Disabling slow SD card swap..."
    sudo systemctl stop dphys-swapfile
    sudo systemctl disable dphys-swapfile
    sudo rm -f /var/swap
fi

# 2. FORCE RESET ZRAM
echo "    ♻️  Resetting ZRAM to clear locks..."
sudo systemctl stop zramswap 2>/dev/null || true
sudo swapoff /dev/zram0 2>/dev/null || true
sudo modprobe -r zram 2>/dev/null || true

# 3. Write Config
echo "    ⚡ Writing ZRAM Config..."
sudo tee /etc/default/zramswap > /dev/null <<EOF
ALGO=lz4
PERCENT=60
EOF

# 4. Load Module & Tune
sudo modprobe zram
echo "vm.swappiness=100" | sudo tee /etc/sysctl.d/99-zram.conf > /dev/null
sudo sysctl -p /etc/sysctl.d/99-zram.conf > /dev/null

# 5. Start Service
echo "    🚀 Starting ZRAM Service..."
sudo systemctl restart zramswap

if systemctl is-active --quiet zramswap; then
    echo "    ✅ ZRAM Active."
else
    echo "    ⚠️ ZRAM Failed to start. Checking status..."
    sudo systemctl status zramswap --no-pager
fi

# ==========================================
# PHASE 2: CONFIGURE ICECAST & AUDIO
# ==========================================
echo ">>> [3/7] Configuring Icecast..."

if ! grep -q "<source-password>$SED_SAFE_PASS</source-password>" /etc/icecast2/icecast.xml; then
    sudo sed -i "s|<source-password>.*</source-password>|<source-password>$SED_SAFE_PASS</source-password>|" /etc/icecast2/icecast.xml
    sudo sed -i "s|<relay-password>.*</relay-password>|<relay-password>$SED_SAFE_PASS</relay-password>|" /etc/icecast2/icecast.xml
    sudo sed -i "s|<admin-password>.*</admin-password>|<admin-password>$SED_SAFE_PASS</admin-password>|" /etc/icecast2/icecast.xml
fi

sudo sed -i "s|<hostname>.*</hostname>|<hostname>$CURRENT_IP</hostname>|" /etc/icecast2/icecast.xml
sudo systemctl restart icecast2

if ! command -v rtl_airband &> /dev/null; then
    echo "    Building rtl_airband..."
    if [ ! -d "$AIRBAND_DIR" ]; then
        run_with_retry git clone "$AIRBAND_REPO" "$AIRBAND_DIR"
    else
        cd "$AIRBAND_DIR" && git pull && cd ..
    fi
    sudo chown -R "$CURRENT_USER":"$CURRENT_GROUP" "$AIRBAND_DIR"
    cd "$AIRBAND_DIR"
    mkdir -p build && cd build
    make clean || true
    cmake .. -DWITH_WBFM=ON -DWITH_SSBD=ON -DNFM=ON
    make -j$(nproc)
    sudo make install
    cd ../.. 
fi

echo "    Writing rtl_airband config..."
sudo tee /usr/local/etc/rtl_airband.conf >/dev/null <<EOF
devices: (
  {
    type = "rtlsdr";
    index = 0;
    gain = 37;
    correction = 56;
    mode = "scan";
    scan_delay = 0.10;
    hold_time = 8.0;
    channels: (
      {
        modulation = "am";
        bandwidth = 12000;
        squelch_snr_threshold = 3;
        freqs = ( 124375000, 118850000 );
        outputs: (
          {
            type = "icecast";
            server = "127.0.0.1";
            port = 8000;
            mountpoint = "airbands";
            username = "source";
            password = "$RAW_PASS";
            format = "mp3";
            bitrate = 32;
            mono = true;
            name = "Teesside ATC (Raw)";
            genre = "ATC";
          }
        );
      }
    );
  }
);
EOF

echo "    Setting up Systemd Services..."
sudo tee /etc/systemd/system/rtl_airband.service >/dev/null <<EOF
[Unit]
Description=RTLSDR-Airband Scanner
After=icecast2.service
Requires=icecast2.service
[Service]
ExecStart=/usr/local/bin/rtl_airband -F -e -c /usr/local/etc/rtl_airband.conf
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/ffmpeg_airband.service >/dev/null <<EOF
[Unit]
Description=FFmpeg Stream Cleaner
After=rtl_airband.service icecast2.service
[Service]
ExecStartPre=/bin/sleep 10
ExecStart=/usr/bin/ffmpeg -re -i http://127.0.0.1:8000/airbands -c:a libmp3lame -b:a 48k -ar 22050 -ac 2 -f mp3 -content_type audio/mpeg 'icecast://source:${SYSTEMD_SAFE_PASS}@127.0.0.1:8000/airband_clean'
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable rtl_airband ffmpeg_airband
sudo systemctl restart rtl_airband ffmpeg_airband
echo "✅ Audio System Deployed."

# ==========================================
# PHASE 3: CONFIGURE RUNTIME ENVIRONMENT
# ==========================================
echo ">>> [4/7] Configuring Runtime..."

mkdir -p "$RUNTIME_DIR"

echo "    Creating Watchdog in $RUNTIME_DIR..."
# Note: We inject $BENCHMARK_MODEL (from command line argument) into the script here
cat > "$RUNTIME_DIR/boot.sh" <<EOF
#!/bin/sh

run_scan_and_config() {
    echo "------------------------------------------------"
    echo "🔍 WATCHDOG: Scanning for AI Servers on $SCAN_NET..."
    
    RAW_IPS=\$(nmap -p $OLLAMA_PORT --open $SCAN_NET -oG - | grep "/open/" | awk '{print \$2}')

    if [ -z "\$RAW_IPS" ]; then
        echo "⚠️  No servers found. Defaulting to localhost."
        echo "upstream ollama_backend { server 127.0.0.1:$OLLAMA_PORT; }" > /etc/nginx/ollama_upstreams.conf
        return
    fi

    echo "⏱️  Running 'Sprint' Benchmark ($BENCHMARK_MODEL)..."
    rm -f /tmp/servers.txt
    touch /tmp/servers.txt

    for ip in \$RAW_IPS; do
        JSON_DATA='{"model": "$BENCHMARK_MODEL", "prompt": "1", "stream": false}'
        TIME=\$(curl -o /dev/null -s -w '%{time_total}' \\
             --connect-timeout 2 -m 5 \\
             -X POST "http://\$ip:$OLLAMA_PORT/api/generate" \\
             -d "\$JSON_DATA")
        
        if [ -z "\$TIME" ] || [ "\$TIME" = "0.000" ]; then
            echo "   ❌ \$ip - Failed Benchmark (Missing model?)"
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
            echo "   🏆 PRIMARY: \$ip (Fastest)"
            echo "    server \$ip:$OLLAMA_PORT;" >> \$TEMP_CONFIG
            IS_FIRST=0
        else
            echo "   🥈 BACKUP:  \$ip"
            echo "    server \$ip:$OLLAMA_PORT backup;" >> \$TEMP_CONFIG
        fi
    done
    echo "}" >> \$TEMP_CONFIG

    mv \$TEMP_CONFIG \$UPSTREAM_FILE
    if pgrep nginx > /dev/null; then nginx -s reload; fi
}

apk add --no-cache nmap curl > /dev/null 2>&1
run_scan_and_config
( while true; do sleep $CHECK_INTERVAL; run_scan_and_config; done ) &

echo "🚀 Starting Nginx Gateway..."
nginx -g "daemon off;"
EOF
chmod +x "$RUNTIME_DIR/boot.sh"

# ==========================================
# PHASE 4: NGINX & DOCKER COMPOSE
# ==========================================
echo ">>> [5/7] Generating Nginx & Docker Config..."

cat > "$RUNTIME_DIR/nginx.conf" <<EOF
include /etc/nginx/ollama_upstreams.conf;

server {
    listen $GATEWAY_PORT; 
    server_name localhost;
    
    # 🛑 MEMORY SAVER
    access_log off;
    error_log /dev/null crit;
    
    location / {
        root /usr/share/nginx/html;
        index radar.html index.html;
    }

    location ~ /\.git { deny all; }
    location ~ \.sh$  { deny all; }

    location /dump1090-fa/ {
        proxy_pass http://$DUMP1090_IP:$DUMP1090_PORT/dump1090-fa/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /airbands {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airbands;
        proxy_buffering off;
    }
    location /airband_clean {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airband_clean;
        proxy_buffering off;
    }

    location /ollama/ {
        rewrite ^/ollama/(.*) /\$1 break;
        proxy_pass http://ollama_backend;
        proxy_read_timeout 300s;
        proxy_connect_timeout 5s;
        proxy_buffering off;
    }
}
EOF

cat > "$RUNTIME_DIR/docker-compose.yml" <<EOF
version: '3.8'
services:
  radar-gateway:
    image: nginx:alpine
    container_name: radar1090-gateway
    restart: always
    network_mode: "host"
    
    # 🛑 MEMORY SAVER
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "1"

    volumes:
      - ../:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./boot.sh:/boot.sh:ro
    entrypoint: ["/bin/sh", "/boot.sh"]
EOF

# Patch JS Files
sed -i 's|const AUDIO_STREAM_URL = .*;|const AUDIO_STREAM_URL = "/airbands";|g' "app.js"
sed -i 's|dump1090Base: "http.*",|dump1090Base: "/dump1090-fa/data",|g' "radar.html"
sed -i 's|ollamaUrl: defaultOllamaUrl,|ollamaUrl: window.location.origin + "/ollama",|g' "radar.html"

# ==========================================
# PHASE 5: LAUNCH
# ==========================================
echo ">>> [6/7] Launching Container..."
cd "$RUNTIME_DIR"

if command -v docker &> /dev/null; then
    sudo docker compose down --remove-orphans 2>/dev/null
    sudo docker compose up -d
fi

echo ""
echo "========================================================"
echo " 🚀 SYSTEM FULLY OPERATIONAL (Custom Model Support)"
echo "========================================================"
echo " 🌍 Gateway: http://$CURRENT_IP/"
echo " ⚡ Benchmark: Testing with $BENCHMARK_MODEL"
echo "========================================================"
