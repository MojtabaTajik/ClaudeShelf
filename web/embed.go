package web

import "embed"

// StaticFS embeds the entire static directory for distribution as a single binary.
//
//go:embed static/*
var StaticFS embed.FS
