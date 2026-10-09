package game

type Role string

const (
	RoleProtector    Role = "PROTECTOR"
	RoleSpy          Role = "SPY"
	RoleSecretLeader Role = "SECRET_LEADER"
)

type Policy string

const (
	PolicyBlue Policy = "BLUE" // Koruyucu Yasası
	PolicyRed  Policy = "RED"  // Casus Yasası
)

type GamePhase string

const (
	PhaseLobby             GamePhase = "LOBBY"
	PhaseNomination        GamePhase = "NOMINATION"
	PhaseVoting            GamePhase = "VOTING"
	PhaseLegislateLeader   GamePhase = "LEGISLATE_LEADER"
	PhaseLegislatePartner  GamePhase = "LEGISLATE_PARTNER"
	PhaseClaiming          GamePhase = "CLAIMING"
	PhasePowersPeek        GamePhase = "POWERS_PEEK"
	PhasePowersExecution   GamePhase = "POWERS_EXECUTION"
	PhaseSuspicionMarking  GamePhase = "SUSPICION_MARKING"
	PhaseGameOver          GamePhase = "GAME_OVER"
)

type Player struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	IsBot     bool   `json:"is_bot"`
	Role      Role   `json:"-"` // Asla istemciye topluca açılmaz!
	IsAlive   bool   `json:"is_alive"`
	Avatar    string `json:"avatar"`
}

type Claim struct {
	LeaderDrawn     []Policy `json:"leader_drawn"`     // Lider: "Çektiğim 3 kart"
	LeaderPassed    []Policy `json:"leader_passed"`    // Lider: "Ortağa ilettiğim 2 kart"
	PartnerReceived []Policy `json:"partner_received"` // Ortak: "Bana gelen 2 kart"
	PartnerEnacted  Policy   `json:"partner_enacted"`  // Ortak: "Yasalaştırdığım kart"
	HasConflict     bool     `json:"has_conflict"`     // Çelişki var mı?
	ConflictNote    string   `json:"conflict_note"`    // Çelişki açıklaması
	LeaderClaimed   bool     `json:"leader_claimed"`
	PartnerClaimed  bool     `json:"partner_claimed"`
}

type VoteHistoryItem struct {
	Round        int               `json:"round"`
	LeaderID     string            `json:"leader_id"`
	LeaderName   string            `json:"leader_name"`
	PartnerID    string            `json:"partner_id"`
	PartnerName  string            `json:"partner_name"`
	Passed       bool              `json:"passed"`
	Votes        map[string]string `json:"votes"` // playerID -> "YES" / "NO"
	EnactedPolicy Policy           `json:"enacted_policy,omitempty"`
}

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Message   string `json:"message"`
	Type      string `json:"type"` // "info", "vote", "policy", "conflict", "alert"
}

// PublicGameState istemciye gönderilen filtrelenmiş durumdur
type PublicGameState struct {
	Phase           GamePhase                  `json:"phase"`
	Round           int                        `json:"round"`
	ChaosCounter    int                        `json:"chaos_counter"` // 3 olunca kaos patlar
	BluePolicies    int                        `json:"blue_policies"` // 5 olursa Koruyucu zaferi
	RedPolicies     int                        `json:"red_policies"`  // 6 olursa Casus zaferi
	DeckCount       int                        `json:"deck_count"`
	DiscardCount    int                        `json:"discard_count"`
	Players         []PlayerPublic             `json:"players"`
	LeaderID        string                     `json:"leader_id"`
	PartnerID       string                     `json:"partner_id"`
	PrevLeaderID    string                     `json:"prev_leader_id"`
	PrevPartnerID   string                     `json:"prev_partner_id"`
	Votes           map[string]string          `json:"votes"` // Oylama bitince açılır
	LastVoteItem    *VoteHistoryItem           `json:"last_vote_item,omitempty"`
	History         []VoteHistoryItem          `json:"history"`
	Logs            []LogEntry                 `json:"logs"`
	CurrentClaim    *Claim                     `json:"current_claim,omitempty"`
	Winner          string                     `json:"winner,omitempty"` // "PROTECTORS" veya "SPIES"
	WinReason       string                     `json:"win_reason,omitempty"`
	Suspicions      map[string]map[string]string `json:"suspicions"` // sourceID -> (targetID -> "SUSPICIOUS"/"TRUSTED")
	Version         string                     `json:"version"`
}

type PlayerPublic struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	IsBot   bool   `json:"is_bot"`
	IsAlive bool   `json:"is_alive"`
	Avatar  string `json:"avatar"`
}

// PrivatePlayerView her istemciye özel gönderilen nihai nesne
type PrivatePlayerView struct {
	PublicState     PublicGameState `json:"public_state"`
	YourID          string          `json:"your_id"`
	YourRole        Role            `json:"your_role"`
	KnownAllies     []string        `json:"known_allies"`     // Casus ise bildiği diğer casuslar
	SecretLeaderID  string          `json:"secret_leader_id"` // Casus ise gizli liderin ID'si
	DrawnPolicies   []Policy        `json:"drawn_policies,omitempty"` // Sadece lider/ortak kart seçimindeyken
	PeekedPolicies  []Policy        `json:"peeked_policies,omitempty"` // Policy peek yetkisinde
}
