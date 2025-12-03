#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Manual benchmark runner for Ollama hosts.
Usage: $0 <host1> [host2 ...]

Environment overrides:
  BENCHMARK_MODEL   Model name to test. Defaults to ai-config.json -> llama3.2:1b.
  OLLAMA_PORT       Port for Ollama (default: 11434).
  SAMPLES           Number of timed requests per host (default: 3).
  TIMEOUT           Per-request timeout in seconds (default: 8).
USAGE
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

if [ "$#" -lt 1 ]; then
  echo "❌ Provide at least one host to benchmark."
  usage
  exit 1
fi

OLLAMA_PORT="${OLLAMA_PORT:-11434}"
SAMPLES="${SAMPLES:-3}"
TIMEOUT="${TIMEOUT:-8}"

if [ -z "${BENCHMARK_MODEL:-}" ] && [ -f ai-config.json ]; then
  BENCHMARK_MODEL=$(jq -r '.ollamaModel // empty' ai-config.json)
fi
BENCHMARK_MODEL="${BENCHMARK_MODEL:-llama3.2:1b}"

run_benchmark() {
    BENCH_RESULT=""
    BENCH_ERROR=""
    BENCH_ERROR_CODE=""

    ip="$1"
    prompt="$2"
    samples="${3:-3}"
    timeout="${4:-8}"

    PROMPT_JSON=$(printf '%s' "$prompt" | jq -Rs .)
    JSON_DATA=$(printf '{"model":"%s","prompt":%s,"stream":false}' "$BENCHMARK_MODEL" "$PROMPT_JSON")
    curl -s -o /dev/null --connect-timeout 3 -m 12 -H "Content-Type: application/json" -X POST "http://$ip:$OLLAMA_PORT/api/generate" -d "$JSON_DATA" 2>/tmp/bench_warmup_"$ip".log || true

    TIMES=""
    COMPLETED=0

    i=1
    while [ "$i" -le "$samples" ]; do
        BODY_FILE="/tmp/bench_body_${ip}_${i}.txt"
        ERR_FILE="/tmp/bench_err_${ip}_${i}.txt"
        rm -f "$BODY_FILE" "$ERR_FILE"

        RESPONSE=$(curl -s -o "$BODY_FILE" -w "%{time_total}:%{http_code}" --connect-timeout 3 -m "$timeout" \
            -H "Content-Type: application/json" -X POST "http://$ip:$OLLAMA_PORT/api/generate" -d "$JSON_DATA" 2>"$ERR_FILE" || true)

        TIME=$(echo "$RESPONSE" | cut -d: -f1)
        CODE=$(echo "$RESPONSE" | cut -d: -f2)
        CODE=${CODE:-000}

        if [ "$CODE" = "200" ]; then
            TIMES="$TIMES $TIME"
            COMPLETED=$((COMPLETED + 1))
        else
            if [ -f "$BODY_FILE" ]; then
                DIAG_BODY=$(head -c 200 "$BODY_FILE" | tr '\n' ' ')
            else
                DIAG_BODY=""
            fi
            if [ -f "$ERR_FILE" ]; then
                DIAG_ERR=$(cat "$ERR_FILE" | tr '\n' ' ')
            else
                DIAG_ERR=""
            fi

            if [ -n "$DIAG_ERR" ]; then
                BENCH_ERROR="HTTP $CODE - curl error: $DIAG_ERR"
            elif [ -n "$DIAG_BODY" ]; then
                BENCH_ERROR="HTTP $CODE - response: $DIAG_BODY"
            else
                BENCH_ERROR="HTTP $CODE - no response body"
            fi
            BENCH_ERROR_CODE="$CODE"
        fi

        i=$((i + 1))
    done

    if [ "$COMPLETED" -eq 0 ]; then
        BENCH_RESULT=""
        return 1
    fi

    BENCH_RESULT=$(echo "$TIMES" | awk '{sum=0; count=0; for(i=1;i<=NF;i++){if($i ~ /^[0-9.]+$/){sum+=$i; count++}} if(count>0){printf "%.3f", sum/count}}')
    return 0
}

function has_model() {
  MODEL_PRESENT=$(printf '%s' "$1" | jq -r --arg MODEL "$BENCHMARK_MODEL" '.models[]? | (.name // .model // .) | select(. == $MODEL)' | head -n1)
  [ -n "$MODEL_PRESENT" ]
}

total_success=0

echo "Using model '$BENCHMARK_MODEL' on port $OLLAMA_PORT (samples: $SAMPLES, timeout: $TIMEOUTs)"
for host in "$@"; do
  echo "------------------------------------------------"
  echo "Benchmarking $host..."

  HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 -m 4 "http://$host:$OLLAMA_PORT/api/version")
  if [ "$HEALTH_CODE" != "200" ]; then
    echo "  ❌ Health check failed (HTTP $HEALTH_CODE)"
    continue
  fi

  TAGS_JSON=$(curl -s --connect-timeout 2 -m 8 "http://$host:$OLLAMA_PORT/api/tags" || true)
  if [ -z "$TAGS_JSON" ]; then
    echo "  ❌ Unable to read /api/tags"
    continue
  fi

  if ! printf '%s' "$TAGS_JSON" | jq -e . >/dev/null 2>&1; then
    echo "  ❌ /api/tags returned invalid JSON"
    continue
  fi

  if ! has_model "$TAGS_JSON"; then
    echo "  ❌ Required model '$BENCHMARK_MODEL' missing on host"
    echo "$TAGS_JSON" | jq -r '.models[]? | "    - " + (.name // .model // .)' || true
    continue
  fi

  run_benchmark "$host" "Benchmark latency for radar copilots" "$SAMPLES" "$TIMEOUT"
  RESULT="$BENCH_RESULT"

  if [ -z "$RESULT" ]; then
    SOFT_CODES="000 408 425 429 500 502 503 504"
    if echo " $SOFT_CODES " | grep -q " ${BENCH_ERROR_CODE:-000} "; then
      echo "  ⚠️  Benchmark incomplete (${BENCH_ERROR:-unknown error}); host left eligible with fallback latency."
      total_success=$((total_success + 1))
    else
      echo "  ❌ Benchmark failed (${BENCH_ERROR:-no response captured})"
    fi
    continue
  fi

  echo "  ⚡ Average latency: ${RESULT}s"
  total_success=$((total_success + 1))
done

after_hosts=$((total_success))
if [ "$after_hosts" -eq 0 ]; then
  echo "No hosts completed benchmarking successfully."
  exit 1
fi

echo "✅ Completed benchmarking for $after_hosts host(s)."
