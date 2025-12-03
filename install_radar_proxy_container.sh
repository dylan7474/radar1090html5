#!/bin/bash
set -euo pipefail

# ==========================================
# 🔐 CONFIGURATION
# ==========================================
if [ "$#" -ne 1 ]; then
    echo "❌ Error: You must provide a password."
    echo "Usage: sudo ./deploy_all_v22.sh 'YourPasswordHere'"
    exit 1
fi
RAW_PASS="$1"

# --- NETWORK ---
DUMP1090_IP="192.168.50.100"
DUMP1090_PORT="8080"
AUDIO_IP="127.0.0.1"
AUDIO_PORT="8000"
OLLAMA_PORT="11434"
SCAN_NET="192.168.50.0/24"
CHECK_INTERVAL="600"
BENCHMARK_MODEL="llama3.2:1b"

# --- SYSTEM ---
GATEWAY_PORT="80" 
AIRBAND_REPO="https://github.com/szpajder/RTLSDR-Airband.git"
AIRBAND_DIR="rtl_airband"
RUNTIME_DIR="radar-runtime"

# --- SANITIZATION ---
SYSTEMD_SAFE_PASS=${RAW_PASS//$/$$}
SED_SAFE_PASS=$(echo "$RAW_PASS" | sed 's/|/\\|/g' | sed 's/&/\\&/g')
CURRENT_USER=${SUDO_USER:-$USER}
CURRENT_GROUP=$(id -gn $CURRENT_USER)
CURRENT_IP=$(hostname -I | awk '{print $1}')

# ==========================================
# 🔄 HELPER
# ==========================================
function run_with_retry() {
    local n=1; local max=5; local delay=5
    while true; do
        "$@" && break || {
            if [[ $n -lt $max ]]; then
                ((n++))
                echo "⚠️ Command failed. Retrying in $delay sec..."
                sleep $delay;
            else
                echo "❌ Command failed after $max attempts."
                return 1
            fi
        }
    done
}

echo ">>> STARTING DEPLOYMENT V22 (Clean Repo Version)"
echo ">>> Host IP: $CURRENT_IP"

# ==========================================
# PHASE 1: PREPARATION
# ==========================================
echo ">>> [1/7] Preparing System..."

if [ ! -f "radar.html" ]; then
    echo "❌ Error: radar.html not found in current directory."
    exit 1
fi

sudo systemctl stop lighttpd apache2 nginx 2>/dev/null || true
sudo systemctl disable lighttpd apache2 nginx 2>/dev/null || true
[ -f /etc/apt/sources.list.d/docker.list ] && sudo rm /etc/apt/sources.list.d/docker.list

run_with_retry sudo apt-get update -qq

if ! command -v docker &> /dev/null; then
    echo "    Installing Docker..."
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    [ -f /etc/apt/keyrings/docker.asc ] && sudo rm /etc/apt/keyrings/docker.asc
    run_with_retry curl -fsSL https://download.docker.com/linux/raspbian/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/raspbian bookworm stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    run_with_retry sudo apt-get update -qq
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable --now docker
    sudo usermod -aG docker "$CURRENT_USER"
fi

sudo apt-get install -y -qq git build-essential cmake libmp3lame-dev libshout3-dev \
  libasound2-dev ffmpeg rtl-sdr pkg-config jq icecast2 netcat-openbsd nmap \
  libconfig++-dev librtlsdr-dev libfftw3-dev liquidsoap curl zram-tools bc

# ==========================================
# PHASE 1.25: OLLAMA MODEL SELECTION
# ==========================================
echo ">>> [2/7] Selecting a shared Ollama model..."

declare -a OLLAMA_HOSTS=()
declare -a SHARED_MODELS=()
SELECTED_MODEL="$BENCHMARK_MODEL"

SCAN_RESULTS=$(nmap -p $OLLAMA_PORT --open $SCAN_NET -oG - 2>/dev/null | grep "/open/" | awk '{print $2}')

if [ -z "$SCAN_RESULTS" ]; then
    echo "⚠️  No Ollama hosts detected on $SCAN_NET. Falling back to localhost and default model $BENCHMARK_MODEL."
else
    for ip in $SCAN_RESULTS; do
        echo "   🔎 Checking $ip for available models..."
        TAGS_JSON=$(curl -s --connect-timeout 2 -m 8 "http://$ip:$OLLAMA_PORT/api/tags" || true)
        if [ -z "$TAGS_JSON" ]; then
            echo "   ❌ $ip - Unable to read /api/tags"
            continue
        fi

        MODELS=$(echo "$TAGS_JSON" | jq -r '.models[]? | (.name // .model // empty)' | sort -u)
        if [ -z "$MODELS" ]; then
            echo "   ⚠️  $ip - No models reported; skipping host."
            continue
        fi

        OLLAMA_HOSTS+=("$ip")

        if [ ${#SHARED_MODELS[@]} -eq 0 ]; then
            mapfile -t SHARED_MODELS <<<"$MODELS"
        else
            declare -a NEXT_SHARED=()
            while IFS= read -r model; do
                for shared in "${SHARED_MODELS[@]}"; do
                    if [ "$model" = "$shared" ]; then
                        NEXT_SHARED+=("$model")
                        break
                    fi
                done
            done <<<"$MODELS"
            SHARED_MODELS=($(printf "%s\n" "${NEXT_SHARED[@]}" | sort -u))
        fi
    done

    if [ ${#OLLAMA_HOSTS[@]} -gt 0 ] && [ ${#SHARED_MODELS[@]} -eq 0 ]; then
        echo "❌ No shared models found across reachable hosts (${OLLAMA_HOSTS[*]}). Ensure each Ollama instance provides a common model and rerun."
        exit 1
    fi

    if [ ${#SHARED_MODELS[@]} -gt 0 ]; then
        echo "✅ Shared models across ${#OLLAMA_HOSTS[@]} host(s):"
        for idx in "${!SHARED_MODELS[@]}"; do
            echo "    $((idx+1)). ${SHARED_MODELS[$idx]}"
        done

        read -rp "Select model [1-${#SHARED_MODELS[@]}] (default 1): " selection
        selection=${selection:-1}

        if ! [[ $selection =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#SHARED_MODELS[@]} ]; then
            echo "⚠️  Invalid choice; defaulting to option 1."
            selection=1
        fi

        SELECTED_MODEL=${SHARED_MODELS[$((selection-1))]}
        echo "   🎯 Using model: $SELECTED_MODEL"
    fi
fi

BENCHMARK_MODEL="$SELECTED_MODEL"

HOST_JSON=""
if [ ${#OLLAMA_HOSTS[@]} -gt 0 ]; then
    for host in "${OLLAMA_HOSTS[@]}"; do
        HOST_JSON+=$'    "http://'"$host"':'"$OLLAMA_PORT"$'"\n'
    done
    HOST_JSON=${HOST_JSON%$'\n'}
fi

cat > ai-config.json <<EOF
{
  "ollamaModel": "$BENCHMARK_MODEL",
  "ollamaHosts": [
$HOST_JSON
  ]
}
EOF


# ==========================================
# PHASE 1.5: ZRAM
# ==========================================
echo ">>> [3/7] Optimizing Memory..."
if systemctl is-active --quiet dphys-swapfile; then
    sudo systemctl stop dphys-swapfile
    sudo systemctl disable dphys-swapfile
    sudo rm -f /var/swap
fi

# Reset ZRAM to clear locks
sudo systemctl stop zramswap 2>/dev/null || true
sudo swapoff /dev/zram0 2>/dev/null || true
sudo modprobe -r zram 2>/dev/null || true

sudo tee /etc/default/zramswap > /dev/null <<EOF
ALGO=lz4
PERCENT=60
EOF

sudo modprobe zram
echo "vm.swappiness=100" | sudo tee /etc/sysctl.d/99-zram.conf > /dev/null
sudo sysctl -p /etc/sysctl.d/99-zram.conf > /dev/null
sudo systemctl restart zramswap

# ==========================================
# PHASE 2: AUDIO
# ==========================================
echo ">>> [4/7] Configuring Icecast..."
if ! grep -q "<source-password>$SED_SAFE_PASS</source-password>" /etc/icecast2/icecast.xml; then
    sudo sed -i "s|<source-password>.*</source-password>|<source-password>$SED_SAFE_PASS</source-password>|" /etc/icecast2/icecast.xml
    sudo sed -i "s|<relay-password>.*</relay-password>|<relay-password>$SED_SAFE_PASS</relay-password>|" /etc/icecast2/icecast.xml
    sudo sed -i "s|<admin-password>.*</admin-password>|<admin-password>$SED_SAFE_PASS</admin-password>|" /etc/icecast2/icecast.xml
fi
sudo sed -i "s|<hostname>.*</hostname>|<hostname>$CURRENT_IP</hostname>|" /etc/icecast2/icecast.xml
sudo systemctl restart icecast2

if ! command -v rtl_airband &> /dev/null; then
    if [ ! -d "$AIRBAND_DIR" ]; then run_with_retry git clone "$AIRBAND_REPO" "$AIRBAND_DIR"; else cd "$AIRBAND_DIR" && git pull && cd ..; fi
    sudo chown -R "$CURRENT_USER":"$CURRENT_GROUP" "$AIRBAND_DIR"
    cd "$AIRBAND_DIR" && mkdir -p build && cd build && make clean || true
    cmake .. -DWITH_WBFM=ON -DWITH_SSBD=ON -DNFM=ON && make -j$(nproc) && sudo make install
    cd ../.. 
fi

sudo tee /usr/local/etc/rtl_airband.conf >/dev/null <<EOF
devices: ({
    type = "rtlsdr"; index = 0; gain = 37; correction = 56; mode = "scan"; scan_delay = 0.10; hold_time = 8.0;
    channels: ({
        modulation = "am"; bandwidth = 12000; squelch_snr_threshold = 3; freqs = ( 124375000, 118850000 );
        outputs: ({ type = "icecast"; server = "127.0.0.1"; port = 8000; mountpoint = "airbands"; username = "source"; password = "$RAW_PASS"; format = "mp3"; bitrate = 32; mono = true; name = "Teesside ATC"; genre = "ATC"; });
    });
});
EOF

sudo tee /etc/systemd/system/rtl_airband.service >/dev/null <<EOF
[Unit]
Description=RTLSDR-Airband Scanner
After=icecast2.service
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
After=rtl_airband.service
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

# ==========================================
# PHASE 3: RUNTIME CONFIG
# ==========================================
echo ">>> [5/7] Configuring Runtime..."
mkdir -p "$RUNTIME_DIR"

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
    rm -f /tmp/servers.txt /tmp/healthy_hosts.txt
    touch /tmp/servers.txt /tmp/healthy_hosts.txt

    for ip in \$RAW_IPS; do
        HEALTH_CODE=\$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 -m 4 "http://\$ip:$OLLAMA_PORT/api/version")

        if [ "\$HEALTH_CODE" != "200" ]; then
            echo "   ❌ \$ip - Health check failed (HTTP \$HEALTH_CODE)"
            continue
        fi

        TAGS_JSON=\$(curl -s --connect-timeout 2 -m 8 "http://\$ip:$OLLAMA_PORT/api/tags" || true)
        if [ -z "\$TAGS_JSON" ]; then
            echo "   ❌ \$ip - Unable to read /api/tags"
            continue
        fi

        MODEL_PRESENT=\$(echo "\$TAGS_JSON" | jq -r --arg MODEL "$BENCHMARK_MODEL" '.models[]? | (.name // .model // .) | select(. == \$MODEL)' | head -n1)
        if [ -z "\$MODEL_PRESENT" ]; then
            echo "   ❌ \$ip - Required model '$BENCHMARK_MODEL' missing; skipping host."
            continue
        fi

        echo "   ✅ \$ip - Ollama reachable with $BENCHMARK_MODEL"
        echo "\$ip" >> /tmp/healthy_hosts.txt

        # Use double quotes for JSON to allow variable expansion
        JSON_DATA="{\"model\": \"$BENCHMARK_MODEL\", \"prompt\": \"1\", \"stream\": false}"

        # Capture response body and curl error output for better diagnostics when benchmarks fail
        BENCH_BODY="/tmp/bench_body_\$ip.txt"
        BENCH_ERR="/tmp/bench_err_\$ip.txt"
        rm -f "\$BENCH_BODY" "\$BENCH_ERR"

        RESPONSE=\$(curl -s -o "\$BENCH_BODY" -w "%{time_total}:%{http_code}" --connect-timeout 2 -m 5 \
                   -X POST "http://\$ip:$OLLAMA_PORT/api/generate" -d "\$JSON_DATA" 2>"\$BENCH_ERR" || true)

        TIME=\$(echo "\$RESPONSE" | cut -d: -f1)
        CODE=\$(echo "\$RESPONSE" | cut -d: -f2)
        CODE=\${CODE:-000}

        if [ "\$CODE" = "404" ]; then
            echo "   ⚠️  \$ip - Benchmark model '$BENCHMARK_MODEL' missing (HTTP 404). Skipping latency ranking."
            continue
        fi

        if [ "\$CODE" != "200" ]; then
            DIAG_BODY=\$(head -c 200 "\$BENCH_BODY" | tr '\n' ' ')
            DIAG_ERR=\$(cat "\$BENCH_ERR" | tr '\n' ' ')

            if [ -n "\$DIAG_ERR" ]; then
                DIAG_SUMMARY="curl error: \$DIAG_ERR"
            elif [ -n "\$DIAG_BODY" ]; then
                DIAG_SUMMARY="response: \$DIAG_BODY"
            else
                DIAG_SUMMARY="no response body"
            fi

            SOFT_CODES="000 408 425 429 500 502 503 504"
            if echo " \$SOFT_CODES " | grep -q " \$CODE "; then
                echo "   ⚠️  \$ip - Benchmark incomplete (HTTP \$CODE) - \$DIAG_SUMMARY. Using fallback latency to keep host eligible."
                echo "9999 \$ip" >> /tmp/servers.txt
            else
                echo "   ❌ \$ip - Benchmark failed (HTTP \$CODE) - \$DIAG_SUMMARY"
            fi
        else
            echo "   ⚡ \$ip - \${TIME}s"
            echo "\$TIME \$ip" >> /tmp/servers.txt
        fi
    done

    SORTED_SERVERS=\$(sort -n /tmp/servers.txt | awk '{print \$2}')

    BENCHMARKED_HOSTS=\$(awk '{print \$2}' /tmp/servers.txt)
    HEALTHY_HOSTS=\$(cat /tmp/healthy_hosts.txt)

    if [ -z "\$SORTED_SERVERS" ]; then
        if [ -n "\$HEALTHY_HOSTS" ]; then
            echo "⚠️  No benchmarks succeeded; using healthy hosts without ranking."
            SORTED_SERVERS="\$HEALTHY_HOSTS"
        else
            echo "⚠️  No reachable Ollama servers detected; using raw scan results."
            SORTED_SERVERS="\$RAW_IPS"
        fi
    else
        # Append healthy-but-unbenchmarked hosts as backups so they remain eligible.
        for ip in \$HEALTHY_HOSTS; do
            if ! echo " \$BENCHMARKED_HOSTS " | grep -q " \$ip "; then
                echo "   ➕ \$ip - Healthy but no benchmark result; adding as backup."
                SORTED_SERVERS="\$SORTED_SERVERS \$ip"
            fi
        done
    fi

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
    if pgrep nginx > /dev/null; then nginx -s reload; fi
}

apk add --no-cache nmap curl jq > /dev/null 2>&1
run_scan_and_config
( while true; do sleep $CHECK_INTERVAL; run_scan_and_config; done ) &
echo "🚀 Starting Nginx Gateway..."
nginx -g "daemon off;"
EOF
chmod +x "$RUNTIME_DIR/boot.sh"

# ==========================================
# PHASE 4: NGINX & DOCKER
# ==========================================
echo ">>> [6/7] Generating Nginx & Docker Config..."

cat > "$RUNTIME_DIR/nginx.conf" <<EOF
include /etc/nginx/ollama_upstreams.conf;
server {
    listen $GATEWAY_PORT; 
    server_name localhost;
    
    # 🛑 PRODUCTION: LOGS DISABLED
    access_log off;
    error_log /dev/null crit;
    
    location / { root /usr/share/nginx/html; index radar.html index.html; }
    location ~ /\.git { deny all; }
    location ~ \.sh$  { deny all; }

    location /dump1090-fa/ {
        proxy_pass http://$DUMP1090_IP:$DUMP1090_PORT/dump1090-fa/;
        proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr;
    }
    location /airbands {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airbands; proxy_buffering off;
    }
    location /airband_clean {
        proxy_pass http://$AUDIO_IP:$AUDIO_PORT/airband_clean; proxy_buffering off;
    }
    location /ollama/ {
        rewrite ^/ollama/(.*) /\$1 break;
        proxy_pass http://ollama_backend;
        proxy_read_timeout 300s; proxy_connect_timeout 5s; proxy_buffering off;
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
    logging:
      driver: "json-file"
      options: { max-size: "10m", max-file: "1" }
    volumes:
      - ../:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./boot.sh:/boot.sh:ro
    entrypoint: ["/bin/sh", "/boot.sh"]
EOF

# Note: We NO LONGER patch JS/HTML files here.
# We assume the source code has been updated to use relative paths.

# ==========================================
# PHASE 5: LAUNCH
# ==========================================
echo ">>> [7/7] Launching Container..."
cd "$RUNTIME_DIR"
if command -v docker &> /dev/null; then sudo docker compose down --remove-orphans 2>/dev/null; sudo docker compose up -d; fi

echo ""
echo "========================================================"
echo " 🚀 SYSTEM ONLINE (Clean Repo Mode)"
echo "========================================================"
echo " 🌍 Gateway:   http://$CURRENT_IP/"
echo " 🛡️  Security:  Logs Disabled + ZRAM Enabled"
echo " 🤖 Benchmark: $BENCHMARK_MODEL"
echo "========================================================"
