package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"silent-protocol/server/game"
)

//go:embed all:dist
var embeddedFS embed.FS

func randomID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func main() {
	port := flag.String("port", "8080", "Sunucu port numarası")
	openBrowserFlag := flag.Bool("open", true, "Başlangıçta tarayıcıyı otomatik aç")
	flag.Parse()

	if envPort := os.Getenv("PORT"); envPort != "" {
		*port = envPort
	}

	appURL := fmt.Sprintf("http://localhost:%s", *port)
	fmt.Printf("=========================================\n")
	fmt.Printf(" 🛡️  SESSİZ PROTOKOL (SILENT PROTOCOL)\n")
	fmt.Printf(" Sürüm: %s\n", game.AppVersion)
	fmt.Printf(" Adres: %s\n", appURL)
	fmt.Printf("=========================================\n")

	if *openBrowserFlag {
		go func() {
			// Sunucunun ayağa kalkması için kısa bir gecikme
			time.Sleep(350 * time.Millisecond)
			_ = exec.Command("xdg-open", appURL).Start()
		}()
	}

	room := game.NewRoom()
	hub := NewHub(room)
	go hub.Run()

	// WebSocket endpoint
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("WS Yükseltme hatası:", err)
			return
		}

		playerID := r.URL.Query().Get("id")
		if playerID == "" {
			playerID = "p-" + randomID()
		}

		client := &Client{
			hub:      hub,
			conn:     conn,
			send:     make(chan []byte, 256),
			playerID: playerID,
		}
		hub.register <- client

		go client.writePump()
		hub.BroadcastState()
		client.readPump()
	})

	// Sağlık ve sürüm API
	http.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"name":"Silent Protocol","version":"%s","status":"running"}`, game.AppVersion)
	})

	// Gömülü veya diskteki statik frontend
	subFS, err := fs.Sub(embeddedFS, "dist")
	if err == nil {
		fsServer := http.FileServer(http.FS(subFS))
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			if path != "/" {
				f, err := subFS.Open(filepath.Clean(path[1:]))
				if err == nil {
					f.Close()
					fsServer.ServeHTTP(w, r)
					return
				}
			}
			// SPA fallback: index.html
			indexData, err := fs.ReadFile(subFS, "index.html")
			if err == nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Write(indexData)
				return
			}
			fsServer.ServeHTTP(w, r)
		})
		log.Println("Gömülü (embedded) frontend varlıkları başarıyla bağlandı.")
	} else {
		// Disk üzerinden fallback
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			fmt.Fprintf(w, `<h3>Silent Protocol Server %s</h3><p>WebSocket çalışıyor.</p>`, game.AppVersion)
		})
	}

	addr := ":" + *port
	log.Printf("Sunucu dinleniyor: http://localhost%s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal("Sunucu hatası:", err)
	}
}
