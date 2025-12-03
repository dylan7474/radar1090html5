#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Manual Ollama selector. Points the app at a specific host and lets you pick a model
from that host's /api/tags response.
Usage: $0 [options] <host>

Options (flags override env vars):
  -m, --model NAME   Model name (optional; prompts if omitted)
  -p, --port PORT    Ollama port (default: 11434)
  -h, --help         Show this help

Environment overrides:
  OLLAMA_PORT
USAGE
}

OLLAMA_PORT="${OLLAMA_PORT:-11434}"
SELECTED_MODEL="${BENCHMARK_MODEL:-}"

HOSTS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -m|--model)
      SELECTED_MODEL="$2"; shift 2 ;;
    -p|--port)
      OLLAMA_PORT="$2"; shift 2 ;;
    --)
      shift; HOSTS+=("$@"); break ;;
    *)
      HOSTS+=("$1"); shift ;;
  esac
done

if [ "${#HOSTS[@]}" -ne 1 ]; then
  echo "❌ Provide exactly one host to configure."
  usage
  exit 1
fi

if [ -z "$SELECTED_MODEL" ] && [ -f ai-config.json ]; then
  if jq -e . >/dev/null 2>&1 < ai-config.json; then
    SELECTED_MODEL=$(jq -r '.ollamaModel // empty' ai-config.json || true)
  else
    echo "⚠️  Ignoring invalid ai-config.json (unable to parse JSON)." >&2
  fi
fi

TARGET_HOST="${HOSTS[0]}"

echo "🔎 Fetching models from http://$TARGET_HOST:$OLLAMA_PORT..."
TAGS_JSON=$(curl -s --connect-timeout 5 -m 20 "http://$TARGET_HOST:$OLLAMA_PORT/api/tags" || true)

if [ -z "$TAGS_JSON" ]; then
  echo "❌ Unable to read /api/tags from $TARGET_HOST:$OLLAMA_PORT"
  exit 1
fi

if ! printf '%s' "$TAGS_JSON" | jq -e . >/dev/null 2>&1; then
  echo "❌ /api/tags returned invalid JSON"
  exit 1
fi

mapfile -t MODELS < <(printf '%s' "$TAGS_JSON" | jq -r '.models[]? | (.name // .model // empty)' | sort -u)

if [ ${#MODELS[@]} -eq 0 ]; then
  echo "❌ No models reported by $TARGET_HOST"
  exit 1
fi

if [ -n "$SELECTED_MODEL" ]; then
  FOUND=0
  for model in "${MODELS[@]}"; do
    if [ "$model" = "$SELECTED_MODEL" ]; then
      FOUND=1
      break
    fi
  done
  if [ "$FOUND" -eq 0 ]; then
    echo "⚠️  Requested model '$SELECTED_MODEL' not found on host; ignoring override."
    SELECTED_MODEL=""
  fi
fi

if [ -z "$SELECTED_MODEL" ]; then
  echo "Available models:"
  for idx in "${!MODELS[@]}"; do
    echo "  $((idx+1)). ${MODELS[$idx]}"
  done
  read -rp "Select model [1-${#MODELS[@]}] (default 1): " selection
  selection=${selection:-1}
  if ! [[ $selection =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#MODELS[@]} ]; then
    echo "⚠️  Invalid choice; defaulting to option 1."
    selection=1
  fi
  SELECTED_MODEL=${MODELS[$((selection-1))]}
fi

cat > ai-config.json <<EOF
{
  "ollamaModel": "$SELECTED_MODEL",
  "ollamaHosts": [
    "http://$TARGET_HOST:$OLLAMA_PORT"
  ]
}
EOF

echo "✅ Saved ai-config.json with host $TARGET_HOST:$OLLAMA_PORT and model '$SELECTED_MODEL'."
