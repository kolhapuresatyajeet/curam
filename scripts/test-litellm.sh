#!/usr/bin/env bash
# Tests the LiteLLM gateway for AI Scribe readiness.
# Usage: LITELLM_BASE_URL=... LITELLM_API_KEY=... ./scripts/test-litellm.sh
set -euo pipefail

BASE="${LITELLM_BASE_URL:?set LITELLM_BASE_URL (with or without trailing /v1)}"
KEY="${LITELLM_API_KEY:?set LITELLM_API_KEY}"
# Strip trailing /v1 so we can append exact paths ourselves.
BASE="${BASE%/v1}"

TRANSCRIBE_MODEL="${AI_TRANSCRIBE_MODEL:-gpt-4o-mini-transcribe}"
STRUCTURE_MODEL="${AI_STRUCTURE_MODEL:-claude-haiku-4-5}"

pass=0; fail=0
check() { # name, expected-minutes... simple reporter
  if [ "$1" -eq 0 ]; then pass=$((pass+1)); echo "✅ $2";
  else fail=$((fail+1)); echo "❌ $2"; fi
}

echo "== 1) Gateway reachable — listing models =="
MODELS=$(curl -sS -m 30 "$BASE/v1/models" -H "Authorization: Bearer $KEY" 2>&1) || true
if echo "$MODELS" | grep -q '"object": "list"\|"data"'; then
  check 0 "GET /v1/models"
  echo "$MODELS" | python3 -c '
import json,sys
data = json.load(sys.stdin)
ids = [m["id"] for m in data.get("data", [])]
print("   models available:", len(ids))
for i in sorted(ids): print("   -", i)
' 2>/dev/null || echo "$MODELS" | head -c 800
  HAS_T=$(echo "$MODELS" | grep -c "$TRANSCRIBE_MODEL" || true)
  HAS_S=$(echo "$MODELS" | grep -c "$STRUCTURE_MODEL" || true)
  [ "$HAS_T" -gt 0 ] && echo "✅ transcription model '$TRANSCRIBE_MODEL' listed" || echo "⚠️  '$TRANSCRIBE_MODEL' not in /v1/models (may still route — check name/prefix)"
  [ "$HAS_S" -gt 0 ] && echo "✅ structure model '$STRUCTURE_MODEL' listed" || echo "⚠️  '$STRUCTURE_MODEL' not in /v1/models (may still route)"
else
  check 1 "GET /v1/models — got: $(echo "$MODELS" | head -c 120)"
fi

echo "== 2) OpenAI-format chat completion (routing check) =="
CHAT=$(curl -sS -m 60 -X POST "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"'"$STRUCTURE_MODEL"'","max_tokens":10,"messages":[{"role":"user","content":"Reply with the single word: ready"}]}' 2>&1) || true
if echo "$CHAT" | grep -q '"choices"'; then
  check 0 "chat completions via $STRUCTURE_MODEL"
else
  check 1 "chat completions — got: $(echo "$CHAT" | head -c 200)"
fi

echo "== 3) Anthropic-format /v1/messages (what ai-scribe uses) =="
MSG=$(curl -sS -m 60 -X POST "$BASE/v1/messages" \
  -H "Authorization: Bearer $KEY" -H 'x-api-key: '"$KEY" -H 'Content-Type: application/json' \
  -d '{"model":"'"$STRUCTURE_MODEL"'","max_tokens":10,"messages":[{"role":"user","content":"Reply with the single word: ready"}]}' 2>&1) || true
if echo "$MSG" | grep -q '"content"'; then
  check 0 "/v1/messages via $STRUCTURE_MODEL (caching format accepted)"
else
  check 1 "/v1/messages — got: $(echo "$MSG" | head -c 200)"
fi

echo "== 4) Audio transcription endpoint (1s silence WAV) =="
# Synthesise a 1-second silent WAV with python3 stdlib.
python3 - <<'PYEOF'
import wave, struct
with wave.open('/tmp/test-audio.wav', 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(b''.join(struct.pack('<h', 0) for _ in range(16000)))
PYEOF
AUDIO=$(curl -sS -m 120 -X POST "$BASE/v1/audio/transcriptions" \
  -H "Authorization: Bearer $KEY" \
  -F "file=@/tmp/test-audio.wav" -F "model=$TRANSCRIBE_MODEL" -F "language=en" 2>&1) || true
if echo "$AUDIO" | grep -q '"text"'; then
  check 0 "audio transcriptions via $TRANSCRIBE_MODEL"
else
  check 1 "audio transcriptions — got: $(echo "$AUDIO" | head -c 200)"
fi

echo
echo "== Result: $pass passed, $fail failed =="
[ "$fail" -eq 0 ] && echo "Gateway ready for the AI Scribe. Secrets to set in Supabase:" && \
  echo "  supabase secrets set LITELLM_BASE_URL=$BASE LITELLM_API_KEY=$KEY"
exit "$fail"
