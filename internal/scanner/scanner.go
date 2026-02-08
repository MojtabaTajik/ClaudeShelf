package scanner

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/MojtabaTajik/ClaudeShelf/internal/models"
)

// Scanner discovers Claude-related files on the filesystem.
type Scanner struct {
	rootPath string
}

// New creates a scanner. If rootPath is empty, it scans well-known locations.
func New(rootPath string) *Scanner {
	return &Scanner{rootPath: rootPath}
}

// Scan discovers all Claude-related files and returns a ScanResult.
func (s *Scanner) Scan() (*models.ScanResult, error) {
	var files []models.FileEntry
	globalSeen := make(map[string]bool)

	paths := s.searchPaths()
	for _, p := range paths {
		found, err := s.scanPath(p, globalSeen)
		if err != nil {
			continue // skip inaccessible paths
		}
		files = append(files, found...)
	}

	return &models.ScanResult{
		RootPath:   s.rootPath,
		Files:      files,
		ScannedAt:  time.Now(),
		Categories: models.AllCategories(),
	}, nil
}

// searchPaths returns the list of directories to scan.
func (s *Scanner) searchPaths() []string {
	if s.rootPath != "" {
		return []string{s.rootPath}
	}

	var paths []string
	home := homeDir()

	// Primary Claude config directory
	paths = append(paths, filepath.Join(home, ".claude"))

	// Common project locations where CLAUDE.md might exist
	projectDirs := []string{
		filepath.Join(home, "projects"),
		filepath.Join(home, "src"),
		filepath.Join(home, "dev"),
		filepath.Join(home, "code"),
		filepath.Join(home, "workspace"),
		filepath.Join(home, "repos"),
		home, // scan home dir itself for CLAUDE.md
	}

	for _, d := range projectDirs {
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			paths = append(paths, d)
		}
	}

	return paths
}

// scanPath scans a single directory for Claude-related files.
func (s *Scanner) scanPath(root string, seen map[string]bool) ([]models.FileEntry, error) {
	var files []models.FileEntry

	// Determine if this is the ~/.claude directory itself
	isClaudeDir := strings.HasSuffix(root, ".claude") || strings.HasSuffix(root, ".claude/")

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip inaccessible
		}

		// Skip hidden dirs (except .claude), node_modules, .git, etc.
		if info.IsDir() {
			base := info.Name()
			if base == ".git" || base == "node_modules" || base == ".venv" || base == "__pycache__" {
				return filepath.SkipDir
			}
			// If scanning a broad directory, only descend into .claude dirs or one level
			if !isClaudeDir && base != ".claude" && strings.HasPrefix(base, ".") && base != "." {
				return filepath.SkipDir
			}
			return nil
		}

		// Limit depth for non-.claude directories to avoid deep scanning
		if !isClaudeDir && !strings.Contains(path, ".claude") {
			rel, _ := filepath.Rel(root, path)
			if strings.Count(rel, string(filepath.Separator)) > 1 {
				return nil
			}
		}

		if !isClaudeFile(path, info.Name()) {
			return nil
		}

		absPath, _ := filepath.Abs(path)
		if seen[absPath] {
			return nil
		}
		seen[absPath] = true

		entry := models.FileEntry{
			ID:       fileID(absPath),
			Path:     absPath,
			RelPath:  relativeDisplay(absPath),
			Name:     info.Name(),
			Category: categorize(absPath, info.Name()),
			Size:     info.Size(),
			ModTime:  info.ModTime(),
			ReadOnly: !isWritable(absPath),
		}
		files = append(files, entry)
		return nil
	})

	return files, err
}

// isClaudeFile returns true if this file is Claude-related.
func isClaudeFile(path, name string) bool {
	nameLower := strings.ToLower(name)

	// Direct Claude config files
	if nameLower == "claude.md" || nameLower == ".clauderc" {
		return true
	}

	// Files inside a .claude directory
	if strings.Contains(path, ".claude"+string(filepath.Separator)) ||
		strings.Contains(path, ".claude/") {
		// Include meaningful files, skip conversation logs (large .jsonl files)
		ext := strings.ToLower(filepath.Ext(name))
		switch ext {
		case ".md", ".json", ".yaml", ".yml", ".txt", ".toml":
			return true
		}
		// Also include files with no extension that might be configs
		if ext == "" && !strings.HasPrefix(name, ".") {
			return true
		}
	}

	return false
}

// categorize assigns a category based on file path and name.
func categorize(path, name string) models.Category {
	pathLower := strings.ToLower(path)
	nameLower := strings.ToLower(name)

	// Memory files
	if strings.Contains(pathLower, "memory") || nameLower == "memory.md" {
		return models.CategoryMemory
	}
	if nameLower == "claude.md" && !strings.Contains(pathLower, ".claude") {
		return models.CategoryProject
	}
	if nameLower == "claude.md" && strings.Contains(pathLower, "memory") {
		return models.CategoryMemory
	}

	// Settings
	if nameLower == "settings.json" || nameLower == ".clauderc" {
		return models.CategorySettings
	}

	// Todos
	if strings.Contains(pathLower, "todos") || strings.Contains(pathLower, "todo") {
		return models.CategoryTodos
	}

	// Plans
	if strings.Contains(pathLower, "plans") || strings.Contains(pathLower, "plan") {
		return models.CategoryPlans
	}

	// Skills
	if strings.Contains(pathLower, "skills") || strings.Contains(pathLower, "skill") {
		return models.CategorySkills
	}

	// Project-level files
	if nameLower == "claude.md" || nameLower == ".clauderc" {
		return models.CategoryProject
	}

	return models.CategoryOther
}

// fileID generates a stable, URL-safe identifier for a file path.
func fileID(path string) string {
	h := sha256.Sum256([]byte(path))
	return fmt.Sprintf("%x", h[:8])
}

// relativeDisplay returns a display-friendly relative path.
func relativeDisplay(absPath string) string {
	home := homeDir()
	if strings.HasPrefix(absPath, home) {
		return "~" + absPath[len(home):]
	}
	return absPath
}

// isWritable checks if the file can be written to.
func isWritable(path string) bool {
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return false
	}
	f.Close()
	return true
}

func homeDir() string {
	if runtime.GOOS == "windows" {
		return os.Getenv("USERPROFILE")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return os.Getenv("HOME")
	}
	return home
}
