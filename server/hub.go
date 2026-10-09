package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"silent-protocol/server/game"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Geliştirme ve masaüstü kullanımı için her orijine izin ver
	},
}

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	playerID string
}

type Hub struct {
	mu         sync.Mutex
	clients    map[*Client]bool
	playerMap  map[string]*Client // playerID -> Client
	room       *game.Room
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
}

func NewHub(room *game.Room) *Hub {
	h := &Hub{
		clients:    make(map[*Client]bool),
		playerMap:  make(map[string]*Client),
		room:       room,
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}

	// Oda her güncellendiğinde ilgili istemcilere filtrelenmiş veriyi gönder
	room.OnStateChange = func() {
		h.BroadcastState()
	}

	return h
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				if client.playerID != "" {
					delete(h.playerMap, client.playerID)
				}
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) BroadcastState() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		view := h.room.GetPrivateView(client.playerID)
		msg, err := json.Marshal(map[string]interface{}{
			"type":    "state",
			"payload": view,
		})
		if err == nil {
			select {
			case client.send <- msg:
			default:
				// Buffer dolduysa
			}
		}
	}
}

type InMessage struct {
	Type        string        `json:"type"`
	Name        string        `json:"name,omitempty"`
	Avatar      string        `json:"avatar,omitempty"`
	CandidateID string        `json:"candidate_id,omitempty"`
	Vote        string        `json:"vote,omitempty"`
	Index       int           `json:"index,omitempty"`
	Drawn       []game.Policy `json:"drawn,omitempty"`
	Passed      []game.Policy `json:"passed,omitempty"`
	Received    []game.Policy `json:"received,omitempty"`
	TargetID    string        `json:"target_id,omitempty"`
	Chip        string        `json:"chip,omitempty"`
	Expression  string        `json:"expression,omitempty"`
	Bubble      string        `json:"bubble,omitempty"`
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var in InMessage
		if err := json.Unmarshal(message, &in); err != nil {
			continue
		}

		switch in.Type {
		case "join":
			name := in.Name
			if name == "" {
				name = "Komutan"
			}
			avatar := in.Avatar
			if avatar == "" {
				avatar = "🛡️"
			}
			player := c.hub.room.AddPlayer(c.playerID, name, false, avatar)
			c.hub.mu.Lock()
			c.hub.playerMap[c.playerID] = c
			c.hub.mu.Unlock()
			c.hub.BroadcastState()
			log.Printf("Oyuncu katıldı: %s (%s)", player.Name, player.ID)

		case "start_game":
			_ = c.hub.room.StartGameWithBots()

		case "nominate":
			_ = c.hub.room.NominatePartner(c.playerID, in.CandidateID)

		case "vote":
			_ = c.hub.room.CastVote(c.playerID, in.Vote)

		case "leader_discard":
			_ = c.hub.room.LeaderDiscard(c.playerID, in.Index)

		case "partner_enact":
			_ = c.hub.room.PartnerEnact(c.playerID, in.Index)

		case "leader_claim":
			_ = c.hub.room.SubmitLeaderClaim(c.playerID, in.Drawn, in.Passed)

		case "partner_claim":
			_ = c.hub.room.SubmitPartnerClaim(c.playerID, in.Received)

		case "toggle_suspicion":
			c.hub.room.ToggleSuspicion(c.playerID, in.TargetID, in.Chip)

		case "close_peek":
			_ = c.hub.room.ClosePeek(c.playerID)

		case "execute_player":
			_ = c.hub.room.ExecutePlayer(c.playerID, in.TargetID)

		case "finish_marking":
			c.hub.room.FinishSuspicionMarking()

		case "gesture":
			c.hub.room.SetExpression(c.playerID, in.Expression, in.Bubble, in.TargetID)
		}
	}
}

func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()

	for msg := range c.send {
		w, err := c.conn.NextWriter(websocket.TextMessage)
		if err != nil {
			return
		}
		w.Write(msg)
		if err := w.Close(); err != nil {
			return
		}
	}
}
