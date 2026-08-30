#!/usr/bin/env bash

set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

start_ngrok=true
start_proxy=true
run_preflight=true
child_pids=()

usage() {
  cat <<'EOF'
Usage: pnpm dev [options]

Start the local voice-demo stack:
  - local Codex proxy on port 18765 for ConversationRelay
  - selected voice gateway on port 3001
  - ngrok tunnel for port 3001
  - Next.js dashboard on port 3000
  - a non-billable gateway preflight check

Options:
  --no-ngrok       Do not start or reuse an ngrok tunnel.
  --skip-proxy     Do not start claude-code-proxy.
  --no-preflight   Do not run the preflight check after startup.
  --help           Show this help text.
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "Missing required command: $command_name"
}

require_file() {
  local file_path="$1"
  [[ -f "$file_path" ]] || fail "Missing $file_path. Copy its matching example file and replace its placeholders."
}

start_service() {
  local service_name="$1"
  shift

  printf 'Starting %s...\n' "$service_name"
  (
    exec "$@" > >(sed -u "s/^/[$service_name] /") 2> >(sed -u "s/^/[$service_name] /" >&2)
  ) &
  child_pids+=("$!")
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempt

  for attempt in {1..80}; do
    if curl --fail --silent --show-error --max-time 1 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done

  fail "$label did not become ready at $url."
}

proxy_is_ready() {
  node -e '
    fetch("http://127.0.0.1:18765/v1/models", {
      headers: { Authorization: "Bearer local-codex-proxy-placeholder" },
    })
      .then((response) => process.exit(response.ok ? 0 : 1))
      .catch(() => process.exit(1));
  '
}

wait_for_proxy() {
  local attempt

  for attempt in {1..40}; do
    if proxy_is_ready; then
      return 0
    fi
    sleep 0.25
  done

  fail "Local Codex proxy did not become ready at http://127.0.0.1:18765."
}

validate_gateway_configuration() {
  local config_import='./src/voice-gateway/config.ts'
  local config_loader='loadVoiceGatewayConfig'
  if [[ "${voice_runtime:-conversation-relay}" == "twilio-candidate" ]]; then
    config_import='./src/voice-experiment/twilio-candidate-config.ts'
    config_loader='loadTwilioCandidateConfig'
  elif [[ "${voice_runtime:-conversation-relay}" == "telnyx-candidate" ]]; then
    config_import='./src/voice-experiment/telnyx-candidate-config.ts'
    config_loader='loadTelnyxCandidateConfig'
  fi

  if "$start_ngrok"; then
    VOICE_GATEWAY_PUBLIC_BASE_URL="https://voice-demo.invalid" \
      VOICE_CONFIG_IMPORT="$config_import" \
      VOICE_CONFIG_LOADER="$config_loader" \
      node \
      --env-file=.env.local \
      --import tsx \
      --input-type=module \
      -e 'const module = await import(process.env.VOICE_CONFIG_IMPORT); module[process.env.VOICE_CONFIG_LOADER](process.env);'
    return
  fi

  VOICE_CONFIG_IMPORT="$config_import" \
    VOICE_CONFIG_LOADER="$config_loader" \
    node \
    --env-file=.env.local \
    --import tsx \
    --input-type=module \
    -e 'if (!process.env.VOICE_GATEWAY_PUBLIC_BASE_URL) throw new Error("VOICE_GATEWAY_PUBLIC_BASE_URL is required when --no-ngrok is used."); const module = await import(process.env.VOICE_CONFIG_IMPORT); module[process.env.VOICE_CONFIG_LOADER](process.env);'
}

port_is_open() {
  local port="$1"

  node -e '
    const net = require("node:net");
    const port = Number(process.argv[1]);
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (status) => {
      socket.destroy();
      process.exit(status);
    };
    socket.once("connect", () => finish(0));
    socket.once("error", () => finish(1));
    socket.setTimeout(250, () => finish(1));
  ' "$port"
}

require_port_available() {
  local port="$1"
  local label="$2"

  if port_is_open "$port"; then
    fail "$label already uses port $port. Stop the existing process, then run pnpm dev again."
  fi
}

ngrok_inspector_is_ready() {
  node -e 'fetch("http://127.0.0.1:4040/api/tunnels").then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));'
}

ngrok_public_url() {
  node -e '
    fetch("http://127.0.0.1:4040/api/tunnels")
      .then(async (response) => {
        if (!response.ok) process.exit(1);
        const body = await response.json();
        const tunnel = body.tunnels.find((candidate) => (
          typeof candidate.public_url === "string" &&
          candidate.public_url.startsWith("https://") &&
          /:3001$/.test(candidate.config?.addr ?? "")
        ));
        if (!tunnel) process.exit(1);
        process.stdout.write(tunnel.public_url);
      })
      .catch(() => process.exit(1));
  '
}

cleanup() {
  local exit_status=$?
  local pid

  trap - EXIT INT TERM

  if ((${#child_pids[@]} > 0)); then
    printf '\nStopping local development services...\n'
    for pid in "${child_pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
    done
    for pid in "${child_pids[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi

  exit "$exit_status"
}

while (($# > 0)); do
  case "$1" in
    --)
      ;;
    --no-ngrok)
      start_ngrok=false
      ;;
    --skip-proxy)
      start_proxy=false
      ;;
    --no-preflight)
      run_preflight=false
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown option: $1"
      ;;
  esac
  shift
done

require_command pnpm
require_command curl
require_command node
require_file .env.local
require_file .voice-preflight.env

voice_runtime="$(node --env-file=.env.local --import tsx --input-type=module -e '
  const { loadVoiceRuntimeSelection } = await import("./src/voice-experiment/runtime-switch.ts");
  process.stdout.write(loadVoiceRuntimeSelection(process.env));
')"
# Node preserves inherited variables over --env-file. Export the canonical value
# so validation and the watched gateway always select the same runtime.
export VOICE_RUNTIME="$voice_runtime"
if [[ "$voice_runtime" == "telnyx-candidate" ]]; then
  start_proxy=false
fi

if "$start_proxy"; then
  require_command claude-code-proxy
fi

if "$start_ngrok"; then
  require_command ngrok
fi

require_port_available 3001 "A voice gateway"
require_port_available 3000 "A dashboard"
validate_gateway_configuration

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if "$start_ngrok"; then
  if public_base_url="$(ngrok_public_url 2>/dev/null)"; then
    printf 'Reusing ngrok tunnel: %s\n' "$public_base_url"
  else
    if ngrok_inspector_is_ready; then
      fail "ngrok is already running, but it does not forward port 3001. Stop it, then run pnpm dev again."
    fi

    start_service ngrok ngrok http 3001

    public_base_url=""
    for _ in {1..40}; do
      if public_base_url="$(ngrok_public_url 2>/dev/null)"; then
        break
      fi
      sleep 0.25
    done
    [[ -n "$public_base_url" ]] || fail "ngrok did not create an HTTPS tunnel for port 3001."
  fi

  # Node preserves an inherited variable over --env-file. This keeps the
  # running gateway and preflight check aligned with ngrok's current URL.
  export VOICE_GATEWAY_PUBLIC_BASE_URL="$public_base_url"
fi

if "$start_proxy"; then
  if proxy_is_ready; then
    printf 'Reusing local Codex proxy on port 18765.\n'
  else
    require_port_available 18765 "A local Codex proxy"
    start_service proxy env CCP_CODEX_RESPONSES_API=1 claude-code-proxy serve --no-monitor --port 18765
    wait_for_proxy
  fi
fi

if [[ "$voice_runtime" == "telnyx-candidate" ]]; then
  printf 'Synchronizing the Telnyx candidate assistant...\n'
  telnyx_sync_output="$(
    node --env-file=.env.local --import tsx scripts/provision-telnyx-candidate.mts --apply
  )"
  printf '%s\n' "$telnyx_sync_output"
  telnyx_assistant_version=""
  while IFS= read -r line; do
    case "$line" in
      TELNYX_AI_ASSISTANT_VERSION_ID=*)
        telnyx_assistant_version="${line#TELNYX_AI_ASSISTANT_VERSION_ID=}"
        ;;
    esac
  done <<< "$telnyx_sync_output"
  [[ -n "$telnyx_assistant_version" ]] || fail "Telnyx assistant synchronization returned no version ID."
  export TELNYX_AI_ASSISTANT_VERSION_ID="$telnyx_assistant_version"
fi

start_service gateway pnpm voice:dev
wait_for_http "http://127.0.0.1:3001/health" "Voice gateway"

start_service dashboard env NODE_OPTIONS="--max-old-space-size=512" pnpm exec next dev
wait_for_http "http://127.0.0.1:3000/dashboard" "Dashboard"

if "$run_preflight"; then
  printf 'Running voice-demo preflight...\n'
  if [[ "$voice_runtime" == "twilio-candidate" || "$voice_runtime" == "telnyx-candidate" ]]; then
    node --env-file=.env.local --input-type=module -e '
      const base = (process.env.VOICE_GATEWAY_INTERNAL_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
      const response = await fetch(`${base}/internal/preflight`, {
        headers: { "x-voice-gateway-secret": process.env.VOICE_GATEWAY_INTERNAL_SECRET },
      });
      if (!response.ok) process.exit(1);
    '
  else
    pnpm voice:preflight
  fi
fi

printf '\nLocal demo is ready. Open http://localhost:3000/dashboard\n'
printf 'Press Ctrl+C to stop the services started by this script.\n'

wait -n "${child_pids[@]}"
