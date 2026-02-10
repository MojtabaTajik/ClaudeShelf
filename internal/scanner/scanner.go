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

// normPath normalises a path to forward slashes for consistent string matching
// across platforms. Only used for comparisons, not for actual file operations.
func normPath(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
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

	// On Windows, also check %APPDATA%\Claude
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			paths = append(paths, filepath.Join(appData, "Claude"))
		}
		if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
			paths = append(paths, filepath.Join(localAppData, "Claude"))
		}
	}

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

	// On Windows, also check common project locations on other drives
	if runtime.GOOS == "windows" {
		projectDirs = append(projectDirs,
			filepath.Join(home, "Documents"),
			filepath.Join(home, "Desktop"),
		)
	}

	for _, d := range projectDirs {
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			paths = append(paths, d)
		}
	}

	// Also scan current working directory for project-level .claude/
	if cwd, err := os.Getwd(); err == nil {
		cwdClaude := filepath.Join(cwd, ".claude")
		if info, err := os.Stat(cwdClaude); err == nil && info.IsDir() {
			paths = append(paths, cwdClaude)
		}
	}

	return paths
}

// scanPath scans a single directory for Claude-related files.
func (s *Scanner) scanPath(root string, seen map[string]bool) ([]models.FileEntry, error) {
	var files []models.FileEntry

	// Determine if this is the ~/.claude directory itself
	normRoot := normPath(root)
	isClaudeDir := strings.HasSuffix(normRoot, ".claude") || strings.HasSuffix(normRoot, ".claude/") ||
		strings.HasSuffix(strings.ToLower(normRoot), "/claude") // Windows %APPDATA%\Claude

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
		normP := normPath(path)
		if !isClaudeDir && !strings.Contains(normP, ".claude") {
			rel, _ := filepath.Rel(root, path)
			normRel := normPath(rel)
			if strings.Count(normRel, "/") > 1 {
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

		cat := categorize(absPath, info.Name())
		scope, projectName := extractScope(absPath)
		entry := models.FileEntry{
			ID:          fileID(absPath),
			Path:        absPath,
			RelPath:     relativeDisplay(absPath),
			Name:        info.Name(),
			DisplayName: buildDisplayName(absPath, info.Name(), cat, projectName),
			Category:    cat,
			Scope:       scope,
			ProjectName: projectName,
			Size:        info.Size(),
			ModTime:     info.ModTime(),
			ReadOnly:    !isWritable(absPath),
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

	// Files inside a .claude (or Claude on Windows) directory
	np := normPath(path)
	npLower := strings.ToLower(np)
	if strings.Contains(np, ".claude/") || strings.Contains(npLower, "/claude/") {
		ext := strings.ToLower(filepath.Ext(name))
		switch ext {
		case ".md", ".json", ".yaml", ".yml", ".txt", ".toml":
			return true
		case ".log":
			// Log files in debug directories
			return true
		case ".sh":
			// Shell scripts (hooks, snapshots)
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
	np := normPath(path)
	pathLower := strings.ToLower(np)
	nameLower := strings.ToLower(name)

	// Agent definitions — .md files in .claude/agents/ or project .claude/agents/
	if strings.Contains(pathLower, "/agents/") && strings.HasSuffix(nameLower, ".md") {
		return models.CategoryAgents
	}

	// Debug logs
	if strings.Contains(pathLower, "/debug/") {
		return models.CategoryDebug
	}

	// Memory files
	if strings.Contains(pathLower, "/memory/") || nameLower == "memory.md" {
		return models.CategoryMemory
	}
	if nameLower == "claude.md" && !strings.Contains(pathLower, ".claude") {
		return models.CategoryProject
	}

	// Settings — config files, hook scripts, stats cache
	if nameLower == "settings.json" || nameLower == ".clauderc" {
		return models.CategorySettings
	}
	if strings.HasSuffix(nameLower, ".sh") && strings.Contains(pathLower, "/.claude/") {
		// Hook scripts like stop-hook-git-check.sh in .claude/ root
		if !strings.Contains(pathLower, "/shell-snapshots/") {
			return models.CategorySettings
		}
	}
	if nameLower == "stats-cache.json" {
		return models.CategorySettings
	}

	// Todos & Tasks (tasks/ is the newer dir, todos/ is the older one)
	if strings.Contains(pathLower, "/todos/") || strings.Contains(pathLower, "/tasks/") {
		return models.CategoryTodos
	}

	// Plans
	if strings.Contains(pathLower, "/plans/") {
		return models.CategoryPlans
	}

	// Skills
	if strings.Contains(pathLower, "/skills/") {
		return models.CategorySkills
	}

	// Project-level files
	if nameLower == "claude.md" || nameLower == ".clauderc" {
		return models.CategoryProject
	}

	return models.CategoryOther
}

// extractScope determines if a file is global or project-scoped and extracts the project name.
// Claude encodes project paths like: ~/.claude/projects/-home-user-Projects-MyApp/memory/MEMORY.md
// The directory name after "projects/" is the encoded project path with "/" replaced by "-".
func extractScope(absPath string) (models.Scope, string) {
	np := normPath(absPath)

	home := normPath(homeDir())

	// Look for /projects/ in the path which indicates project-scoped files
	idx := strings.Index(np, "/.claude/projects/")
	if idx == -1 {
		// Check for project-level .claude/ dirs (e.g. ~/MyProject/.claude/agents/foo.md)
		// These are NOT inside ~/.claude/ but inside a project directory
		homeClaudePrefix := home + "/.claude/"
		if strings.Contains(np, "/.claude/") && !strings.HasPrefix(np, homeClaudePrefix) {
			return models.ScopeProject, extractProjectFromPath(absPath)
		}
		// Files completely outside any .claude dir (e.g. ~/MyProject/CLAUDE.md)
		if !strings.Contains(np, "/.claude/") && !strings.Contains(strings.ToLower(np), "/claude/") {
			return models.ScopeProject, extractProjectFromPath(absPath)
		}
		return models.ScopeGlobal, ""
	}

	// Extract the encoded project directory name
	after := np[idx+len("/.claude/projects/"):]
	parts := strings.SplitN(after, "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		return models.ScopeGlobal, ""
	}

	encoded := parts[0] // e.g. "-home-user-Projects-MyApp" or "-C-Users-john-Projects-MyApp"
	return models.ScopeProject, decodeProjectName(encoded)
}

// decodeProjectName extracts a human-readable project name from the encoded directory.
// "-home-user-Documents-Projects-VulWall-Landing" → "VulWall-Landing"
func decodeProjectName(encoded string) string {
	// Replace leading dash, then split by common path separators
	cleaned := strings.TrimPrefix(encoded, "-")
	// Split on single dashes that likely represent path separators
	// The encoded path uses "-" for "/", so we reconstruct and take the last meaningful segments
	segments := strings.Split(cleaned, "-")
	if len(segments) == 0 {
		return encoded
	}

	// Skip common prefixes: home, user, Users, Documents, Projects, src, dev, etc.
	// Also skips single-char segments which covers Windows drive letters (C, D, E, ...)
	skipWords := map[string]bool{
		"home": true, "user": true, "users": true, "root": true,
		"documents": true, "desktop": true, "downloads": true,
		"src": true, "dev": true, "code": true, "workspace": true, "repos": true, "projects": true,
		"var": true, "tmp": true, "opt": true, "usr": true, "mnt": true,
		// Windows specific
		"program files": true, "appdata": true, "local": true, "roaming": true,
	}

	// Find where the meaningful project name starts
	start := 0
	for i, seg := range segments {
		if skipWords[strings.ToLower(seg)] || len(seg) <= 1 {
			start = i + 1
		} else {
			break
		}
	}

	if start >= len(segments) {
		// All segments were "skip" words — use the last 2
		if len(segments) >= 2 {
			start = len(segments) - 2
		} else {
			start = 0
		}
	}

	result := strings.Join(segments[start:], "-")
	if result == "" {
		return encoded
	}
	return result
}

// extractProjectFromPath gets a project name from a non-global-claude path.
// For ~/Projects/MyApp/CLAUDE.md → "MyApp"
// For ~/Projects/MyApp/.claude/agents/foo.md → "MyApp"
func extractProjectFromPath(absPath string) string {
	np := normPath(absPath)
	// If inside a project-level .claude dir, find the project root above .claude/
	if idx := strings.Index(np, "/.claude/"); idx != -1 {
		projectDir := np[:idx]
		parts := strings.Split(projectDir, "/")
		if len(parts) > 0 {
			return parts[len(parts)-1]
		}
	}
	dir := filepath.Dir(absPath)
	return filepath.Base(dir)
}

// buildDisplayName creates a human-friendly name for a file.
func buildDisplayName(absPath, name string, cat models.Category, projectName string) string {
	nameLower := strings.ToLower(name)
	np := normPath(absPath)

	switch {
	case nameLower == "memory.md":
		if projectName != "" {
			return projectName + " Memory"
		}
		return "Global Memory"

	case nameLower == "claude.md" && !strings.Contains(np, "/.claude/"):
		if projectName != "" {
			return projectName + " Project Config"
		}
		return "Project Config"

	case nameLower == "settings.json" && strings.Contains(np, "/.claude/"):
		return "Global Settings"

	case nameLower == ".clauderc":
		if projectName != "" {
			return projectName + " RC Config"
		}
		return "Claude RC Config"

	case nameLower == "skill.md" || nameLower == "skills.md":
		// Try to get skill name from parent dir
		parent := filepath.Base(filepath.Dir(absPath))
		if parent != "" && parent != "skills" && parent != "." {
			return titleCase(strings.ReplaceAll(parent, "-", " ")) + " Skill"
		}
		return "Skill Definition"

	case cat == models.CategoryDebug:
		base := strings.TrimSuffix(name, filepath.Ext(name))
		label := titleCase(strings.ReplaceAll(strings.ReplaceAll(base, "-", " "), "_", " "))
		return "Debug — " + label

	case cat == models.CategorySettings && strings.HasSuffix(nameLower, ".sh"):
		// Hook scripts: stop-hook-git-check.sh → "Stop Hook Git Check"
		base := strings.TrimSuffix(name, filepath.Ext(name))
		return titleCase(strings.ReplaceAll(strings.ReplaceAll(base, "-", " "), "_", " "))

	case cat == models.CategoryAgents:
		// code-reviewer.md → "Code Reviewer Agent"
		base := strings.TrimSuffix(name, filepath.Ext(name))
		label := titleCase(strings.ReplaceAll(strings.ReplaceAll(base, "-", " "), "_", " "))
		if projectName != "" {
			return projectName + " — " + label + " Agent"
		}
		return label + " Agent"

	case cat == models.CategoryTodos:
		if projectName != "" {
			return projectName + " Todos"
		}
		return "Todos"

	case cat == models.CategoryPlans:
		if projectName != "" {
			return projectName + " Plan"
		}
		return cleanFileName(name)

	case cat == models.CategoryMemory:
		// Topic memory files like debugging.md, patterns.md
		base := strings.TrimSuffix(name, filepath.Ext(name))
		label := titleCase(strings.ReplaceAll(base, "-", " "))
		if projectName != "" {
			return projectName + " — " + label
		}
		return label

	default:
		return cleanFileName(name)
	}
}

func cleanFileName(name string) string {
	base := strings.TrimSuffix(name, filepath.Ext(name))
	return titleCase(strings.ReplaceAll(strings.ReplaceAll(base, "-", " "), "_", " "))
}

func titleCase(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// fileID generates a stable, URL-safe identifier for a file path.
func fileID(path string) string {
	h := sha256.Sum256([]byte(path))
	return fmt.Sprintf("%x", h[:8])
}

// relativeDisplay returns a display-friendly relative path using forward slashes.
func relativeDisplay(absPath string) string {
	home := homeDir()
	if strings.HasPrefix(absPath, home) {
		rel := "~" + absPath[len(home):]
		return normPath(rel) // normalise to forward slashes for display
	}
	return normPath(absPath)
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
