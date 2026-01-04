# Discord Gateway Events

## MESSAGE_CREATE Limitations

- `MESSAGE_CREATE` events don't include channel `name` or `topic`
- Only `channel_id` is available in the event payload
- Fetch channel info via `rest.getChannel(channelId)` to get name/topic

## Project Directory Handling

- Always create project directory before running Claude CLI
- Use `fs.makeDirectory(path, { recursive: true })` with error catching
- Channel names are sanitized for filesystem use (lowercase, no special chars)
