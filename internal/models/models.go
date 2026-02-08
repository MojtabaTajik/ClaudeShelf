package models

import "time"

// Category groups related Claude files together.
type Category string

const (
	CategoryMemory   Category = "memory"
	CategorySettings Category = "settings"
	CategoryTodos    Category = "todos"
	CategoryPlans    Category = "plans"
	CategorySkills   Category = "skills"
	CategoryProject  Category = "project"
	CategoryOther    Category = "other"
)

// CategoryInfo provides display metadata for a category.
type CategoryInfo struct {
	ID          Category `json:"id"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
}

// AllCategories returns ordered category metadata for the UI.
func AllCategories() []CategoryInfo {
	return []CategoryInfo{
		{CategoryMemory, "Memories", "MEMORY.md and per-project memory files", "brain"},
		{CategorySettings, "Settings", "Claude configuration and settings files", "settings"},
		{CategoryTodos, "Todos", "Task and todo tracking files", "checklist"},
		{CategoryPlans, "Plans", "Planning and strategy documents", "map"},
		{CategorySkills, "Skills", "Custom skill definitions", "sparkles"},
		{CategoryProject, "Project Config", "CLAUDE.md and .clauderc project files", "folder"},
		{CategoryOther, "Other", "Other Claude-related files", "file"},
	}
}

// Scope indicates whether a file is global or project-scoped.
type Scope string

const (
	ScopeGlobal  Scope = "global"
	ScopeProject Scope = "project"
)

// FileEntry represents a single discovered Claude file.
type FileEntry struct {
	ID          string   `json:"id"`
	Path        string   `json:"path"`
	RelPath     string   `json:"relPath"`
	Name        string   `json:"name"`
	DisplayName string   `json:"displayName"`
	Category    Category `json:"category"`
	Scope       Scope    `json:"scope"`
	ProjectName string   `json:"projectName,omitempty"`
	Size        int64    `json:"size"`
	ModTime     time.Time `json:"modTime"`
	ReadOnly    bool     `json:"readOnly"`
}

// BulkDeleteRequest is the payload for deleting multiple files.
type BulkDeleteRequest struct {
	IDs []string `json:"ids"`
}

// FileContent is returned when reading a file's contents.
type FileContent struct {
	FileEntry
	Content string `json:"content"`
}

// SaveRequest is the payload for saving a file.
type SaveRequest struct {
	Content string `json:"content"`
}

// ScanResult holds the complete scan output.
type ScanResult struct {
	RootPath   string      `json:"rootPath"`
	Files      []FileEntry `json:"files"`
	ScannedAt  time.Time   `json:"scannedAt"`
	Categories []CategoryInfo `json:"categories"`
}
