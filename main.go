package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"

	"github.com/MojtabaTajik/ClaudeShelf/internal/scanner"
	"github.com/MojtabaTajik/ClaudeShelf/internal/server"
	"github.com/MojtabaTajik/ClaudeShelf/web"
)

func main() {
	port := flag.Int("port", 8010, "Port to run the web server on")
	path := flag.String("path", "", "Directory to scan for Claude files (empty = scan common locations)")
	flag.Parse()

	// Validate path if provided
	if *path != "" {
		info, err := os.Stat(*path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: path %q does not exist: %v\n", *path, err)
			os.Exit(1)
		}
		if !info.IsDir() {
			fmt.Fprintf(os.Stderr, "Error: path %q is not a directory\n", *path)
			os.Exit(1)
		}
	}

	// Create scanner
	sc := scanner.New(*path)

	// Prepare embedded static filesystem - strip the "static/" prefix
	staticFS, err := fs.Sub(web.StaticFS, "static")
	if err != nil {
		log.Fatalf("Failed to load embedded files: %v", err)
	}

	// Create and start server
	srv := server.New(*port, sc, staticFS)

	fmt.Println("  _____ _                 _       _____ _          _  __")
	fmt.Println(" / ____| |               | |     / ____| |        | |/ _|")
	fmt.Println("| |    | | __ _ _   _  __| | ___| (___ | |__   ___| | |_")
	fmt.Println("| |    | |/ _` | | | |/ _` |/ _ \\\\___ \\| '_ \\ / _ \\ |  _|")
	fmt.Println("| |____| | (_| | |_| | (_| |  __/____) | | | |  __/ | |")
	fmt.Println(" \\_____|_|\\__,_|\\__,_|\\__,_|\\___|_____/|_| |_|\\___|_|_|")
	fmt.Println()

	if *path != "" {
		fmt.Printf("Scanning: %s\n", *path)
	} else {
		fmt.Println("Scanning: common Claude locations")
	}

	if err := srv.Start(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
