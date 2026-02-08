package server

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/MojtabaTajik/ClaudeShelf/internal/models"
	"github.com/MojtabaTajik/ClaudeShelf/internal/scanner"
)

// Server holds the HTTP server state.
type Server struct {
	port    int
	scanner *scanner.Scanner
	result  *models.ScanResult
	staticFS fs.FS
}

// New creates a new server instance.
func New(port int, sc *scanner.Scanner, staticFS fs.FS) *Server {
	return &Server{
		port:     port,
		scanner:  sc,
		staticFS: staticFS,
	}
}

// Start runs the HTTP server.
func (s *Server) Start() error {
	if err := s.refresh(); err != nil {
		return fmt.Errorf("initial scan failed: %w", err)
	}

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/files", s.handleFiles)
	mux.HandleFunc("/api/files/bulk-delete", s.handleBulkDelete)
	mux.HandleFunc("/api/files/", s.handleFileByID) // /api/files/{id}
	mux.HandleFunc("/api/rescan", s.handleRescan)
	mux.HandleFunc("/api/cleanup", s.handleCleanup)
	mux.HandleFunc("/api/categories", s.handleCategories)

	// Static files (embedded)
	mux.Handle("/", http.FileServer(http.FS(s.staticFS)))

	addr := fmt.Sprintf(":%d", s.port)
	log.Printf("ClaudeShelf running at http://localhost%s", addr)
	return http.ListenAndServe(addr, mux)
}

func (s *Server) refresh() error {
	result, err := s.scanner.Scan()
	if err != nil {
		return err
	}
	s.result = result
	return nil
}

// handleFiles returns all discovered files, with optional query params for filtering.
// GET /api/files?category=memory&search=keyword
func (s *Server) handleFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	category := r.URL.Query().Get("category")
	search := strings.ToLower(r.URL.Query().Get("search"))

	files := s.result.Files
	var filtered []models.FileEntry

	for _, f := range files {
		if category != "" && string(f.Category) != category {
			continue
		}
		if search != "" {
			if !strings.Contains(strings.ToLower(f.Name), search) &&
				!strings.Contains(strings.ToLower(f.RelPath), search) {
				continue
			}
		}
		filtered = append(filtered, f)
	}

	writeJSON(w, filtered)
}

// handleFileByID handles GET (read) and PUT (save) for a single file.
// GET /api/files/{id}
// PUT /api/files/{id}
func (s *Server) handleFileByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/files/")
	if id == "" {
		http.Error(w, "missing file id", http.StatusBadRequest)
		return
	}

	entry := s.findFile(id)
	if entry == nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.readFile(w, entry)
	case http.MethodPut:
		s.saveFile(w, r, entry)
	case http.MethodDelete:
		s.deleteFile(w, entry)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) readFile(w http.ResponseWriter, entry *models.FileEntry) {
	data, err := os.ReadFile(entry.Path)
	if err != nil {
		http.Error(w, "cannot read file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fc := models.FileContent{
		FileEntry: *entry,
		Content:   string(data),
	}
	writeJSON(w, fc)
}

func (s *Server) saveFile(w http.ResponseWriter, r *http.Request, entry *models.FileEntry) {
	if entry.ReadOnly {
		http.Error(w, "file is read-only", http.StatusForbidden)
		return
	}

	var req models.SaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := os.WriteFile(entry.Path, []byte(req.Content), 0644); err != nil {
		http.Error(w, "cannot write file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Re-read file info after save
	info, err := os.Stat(entry.Path)
	if err == nil {
		entry.Size = info.Size()
		entry.ModTime = info.ModTime()
	}

	writeJSON(w, map[string]interface{}{
		"success": true,
		"file":    entry,
	})
}

func (s *Server) deleteFile(w http.ResponseWriter, entry *models.FileEntry) {
	if entry.ReadOnly {
		http.Error(w, "file is read-only", http.StatusForbidden)
		return
	}

	if err := os.Remove(entry.Path); err != nil {
		http.Error(w, "cannot delete file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Remove from scan results
	s.removeFile(entry.ID)

	writeJSON(w, map[string]interface{}{
		"success": true,
	})
}

// handleBulkDelete deletes multiple files at once.
// POST /api/files/bulk-delete  {ids: ["id1","id2"]}
func (s *Server) handleBulkDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.BulkDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	var deleted []string
	var errors []string

	for _, id := range req.IDs {
		entry := s.findFile(id)
		if entry == nil {
			errors = append(errors, id+": not found")
			continue
		}
		if entry.ReadOnly {
			errors = append(errors, entry.Name+": read-only")
			continue
		}
		if err := os.Remove(entry.Path); err != nil {
			errors = append(errors, entry.Name+": "+err.Error())
			continue
		}
		deleted = append(deleted, id)
	}

	// Remove all deleted files from scan results
	for _, id := range deleted {
		s.removeFile(id)
	}

	writeJSON(w, map[string]interface{}{
		"deleted": len(deleted),
		"errors":  errors,
	})
}

func (s *Server) removeFile(id string) {
	files := s.result.Files
	for i := range files {
		if files[i].ID == id {
			s.result.Files = append(files[:i], files[i+1:]...)
			return
		}
	}
}

// handleRescan triggers a fresh scan.
func (s *Server) handleRescan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := s.refresh(); err != nil {
		http.Error(w, "scan failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, s.result)
}

// staleDays is the threshold after which a file is considered stale.
const staleDays = 30

// handleCleanup analyzes files and returns cleanup suggestions.
func (s *Server) handleCleanup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	now := time.Now()
	var items []models.CleanupItem
	var totalSize int64

	for _, f := range s.result.Files {
		if f.ReadOnly {
			continue
		}

		// Check for 0-byte files
		if f.Size == 0 {
			items = append(items, models.CleanupItem{
				FileEntry:   f,
				Reason:      models.ReasonEmptyFile,
				ReasonLabel: "Empty file (0 bytes)",
			})
			totalSize += f.Size
			continue
		}

		// Read content to check for empty-content patterns
		data, err := os.ReadFile(f.Path)
		if err != nil {
			continue
		}
		trimmed := strings.TrimSpace(string(data))

		if trimmed == "" || trimmed == "[]" || trimmed == "{}" || trimmed == "null" {
			label := "Empty content"
			switch trimmed {
			case "[]":
				label = "Empty array ([])"
			case "{}":
				label = "Empty object ({})"
			case "null":
				label = "Null content"
			case "":
				label = "Blank file (whitespace only)"
			}
			items = append(items, models.CleanupItem{
				FileEntry:   f,
				Reason:      models.ReasonEmptyContent,
				ReasonLabel: label,
			})
			totalSize += f.Size
			continue
		}

		// Check staleness
		days := int(now.Sub(f.ModTime).Hours() / 24)
		if days >= staleDays {
			items = append(items, models.CleanupItem{
				FileEntry:   f,
				Reason:      models.ReasonStale,
				ReasonLabel: fmt.Sprintf("Not modified in %d days", days),
				DaysSince:   days,
			})
			totalSize += f.Size
		}
	}

	writeJSON(w, models.CleanupResult{
		Items:      items,
		TotalSize:  totalSize,
		TotalCount: len(items),
	})
}

// handleCategories returns the category definitions.
func (s *Server) handleCategories(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, models.AllCategories())
}

func (s *Server) findFile(id string) *models.FileEntry {
	for i := range s.result.Files {
		if s.result.Files[i].ID == id {
			return &s.result.Files[i]
		}
	}
	return nil
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("JSON encode error: %v", err)
	}
}
