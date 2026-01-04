# Claude CLI Streaming

## Required Flags
- `--output-format stream-json` requires `--verbose` when used with `-p`
- Without `--verbose`, you get: "Error: When using --print, --output-format=stream-json requires --verbose"

## Stream JSON Format
Assistant events have nested message structure:
```json
{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}
```

Extract text via: `event.message.content[].text` (not `event.message` directly)

Result events contain the session ID:
```json
{"type":"result","session_id":"...","result":"final text"}
```
