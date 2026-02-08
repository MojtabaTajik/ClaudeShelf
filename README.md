# ClaudeShelf

A local web application to browse, search, and edit Claude Code configuration files — memories, settings, todos, plans, skills, and project configs.

## Features

- **Auto-discovery** — Scans `~/.claude/` and common project directories for Claude-related files
- **Category view** — Files grouped by type: Memories, Settings, Todos, Plans, Skills, Project Config
- **Search & filter** — Real-time search across file names and paths
- **In-browser editor** — View and edit files directly, with Ctrl+S / Cmd+S save
- **Rescan** — Refresh the file list without restarting
- **Single binary** — All static assets embedded; no external dependencies
- **Cross-platform** — Runs on Linux, macOS, and Windows

## Quick Start

```bash
# Build
go build -o claudeshelf .

# Run (scans common Claude locations, serves on port 8010)
./claudeshelf

# Custom port
./claudeshelf -port 9000

# Scan a specific directory
./claudeshelf -path /path/to/directory
```

Then open `http://localhost:8010` in your browser.

## CLI Flags

| Flag    | Default | Description                                      |
|---------|---------|--------------------------------------------------|
| `-port` | `8010`  | Port for the web server                          |
| `-path` | (empty) | Directory to scan. Empty = scan common locations |

## Cross-Compile

```bash
# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o claudeshelf-mac .

# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o claudeshelf-mac-intel .

# Windows
GOOS=windows GOARCH=amd64 go build -o claudeshelf.exe .

# Linux
GOOS=linux GOARCH=amd64 go build -o claudeshelf-linux .
```

## Project Structure

```
├── main.go                  # Entry point, CLI flags
├── go.mod
├── internal/
│   ├── models/
│   │   └── models.go        # Data structures (FileEntry, Category, etc.)
│   ├── scanner/
│   │   └── scanner.go       # File discovery logic
│   └── server/
│       └── server.go        # HTTP server + REST API
└── web/
    ├── embed.go              # go:embed directive
    └── static/
        ├── index.html        # Single-page app
        ├── css/style.css     # Styling
        └── js/app.js         # Frontend logic
```

## API Endpoints

| Method | Endpoint            | Description                        |
|--------|---------------------|------------------------------------|
| GET    | `/api/files`        | List files (query: `category`, `search`) |
| GET    | `/api/files/{id}`   | Read file content                  |
| PUT    | `/api/files/{id}`   | Save file content                  |
| POST   | `/api/rescan`       | Re-scan directories                |
| GET    | `/api/categories`   | List category definitions          |

## Scanned Locations

When no `-path` is given, ClaudeShelf scans:

- `~/.claude/` — Main Claude config directory (settings, projects, plans, todos, skills)
- `~/projects/`, `~/src/`, `~/dev/`, `~/code/`, `~/workspace/`, `~/repos/` — For `CLAUDE.md` and `.claude/` directories
- `~/` — Top-level `CLAUDE.md` or `.clauderc`

## License

MIT
