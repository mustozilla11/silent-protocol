package game

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

const AppVersion = "v1.0.0"
const DefaultPhaseSeconds = 10

type Room struct {
	mu           sync.RWMutex
	Players      []*Player
	Phase        GamePhase
	Round        int
	ChaosCounter int
	BluePolicies int
	RedPolicies  int
	Deck         []Policy
	DiscardPile  []Policy

	LeaderIdx     int
	PartnerID     string
	PrevLeaderID  string
	PrevPartnerID string

	// Tur içi gizli kartlar
	LeaderCards       []Policy // Liderin elindeki 3 kart
	ActualLeaderDrawn []Policy // Liderin desteden gerçekten çektiği 3 kart (doğruluk için)
	PartnerCards      []Policy // Ortağa iletilen 2 kart

	// Oylama
	Votes        map[string]string // ID -> "YES" / "NO"
	VoteHistory  []VoteHistoryItem
	LastVoteItem *VoteHistoryItem

	// İddialar ve Çelişkiler
	CurrentClaim *Claim

	// Masaüstü Şüphe/Güven Çipleri
	// Suspicions[sourceID][targetID] = "SUSPECT" | "TRUSTED"
	Suspicions map[string]map[string]string

	PeekedCards []Policy // Liderin incelediği kartlar

	Winner    string
	WinReason string
	Logs      []LogEntry

	// Faz Zamanlayıcısı (10 saniye karar süresi)
	phaseSeq      uint64
	phaseDuration int
	phaseEndsAt   time.Time

	// Olay dinleyicisi callback (WebSocket bildirimleri için)
	OnStateChange func()
}

func NewRoom() *Room {
	r := &Room{
		Phase:       PhaseLobby,
		Round:       1,
		Deck:        make([]Policy, 0),
		DiscardPile: make([]Policy, 0),
		Votes:       make(map[string]string),
		VoteHistory: make([]VoteHistoryItem, 0),
		Suspicions:  make(map[string]map[string]string),
		Logs:        make([]LogEntry, 0),
	}
	r.addLog("Oda oluşturuldu. Oyuncular bekleniyor.", "info")
	return r
}

func (r *Room) AddPlayer(id, name string, isBot bool, avatar string) *Player {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, p := range r.Players {
		if p.ID == id {
			if name != "" {
				p.Name = name
			}
			return p
		}
	}

	p := &Player{
		ID:         id,
		Name:       name,
		IsBot:      isBot,
		IsAlive:    true,
		Avatar:     avatar,
		Expression: "neutral",
	}
	r.Players = append(r.Players, p)
	r.Suspicions[id] = make(map[string]string)
	r.addLog(fmt.Sprintf("%s masaya katıldı.", name), "info")
	return p
}

var lobbyBotPool = []struct {
	Name   string
	Avatar string
}{
	{"Ajan Kaya", "🕶️"},
	{"Mühendis Ece", "🦊"},
	{"Analist Can", "🦉"},
	{"Operatör Deniz", "🦁"},
	{"Kriptolog Bora", "🎩"},
	{"Diplomat Zeynep", "🕊️"},
}

func (r *Room) AddBot() {
	r.mu.Lock()
	if r.Phase != PhaseLobby || len(r.Players) >= 7 {
		r.mu.Unlock()
		return
	}

	used := make(map[string]bool)
	for _, p := range r.Players {
		used[p.Name] = true
	}

	var pickedName, pickedAvatar string
	for _, b := range lobbyBotPool {
		if !used[b.Name] {
			pickedName = b.Name
			pickedAvatar = b.Avatar
			break
		}
	}
	if pickedName == "" {
		pickedName = fmt.Sprintf("Ajan #%d", len(r.Players))
		pickedAvatar = "🎭"
	}

	botID := fmt.Sprintf("bot-%d", time.Now().UnixNano()%100000+int64(len(r.Players)))
	p := &Player{
		ID:         botID,
		Name:       pickedName,
		IsBot:      true,
		IsAlive:    true,
		Avatar:     pickedAvatar,
		Expression: "neutral",
	}
	r.Players = append(r.Players, p)
	r.Suspicions[botID] = make(map[string]string)
	r.addLog(fmt.Sprintf("%s masaya oturdu.", pickedName), "info")
	r.mu.Unlock()
	r.notifyChange()
}

func (r *Room) RemoveBot(targetID string) {
	r.mu.Lock()
	if r.Phase != PhaseLobby {
		r.mu.Unlock()
		return
	}
	filtered := make([]*Player, 0, len(r.Players))
	for _, p := range r.Players {
		if p.ID == targetID && p.IsBot {
			r.addLog(fmt.Sprintf("%s masadan ayrıldı.", p.Name), "info")
			continue
		}
		filtered = append(filtered, p)
	}
	r.Players = filtered
	r.mu.Unlock()
	r.notifyChange()
}

func (r *Room) RemoveLobbyPlayer(targetID string) {
	r.mu.Lock()
	if r.Phase != PhaseLobby {
		r.mu.Unlock()
		return
	}
	filtered := make([]*Player, 0, len(r.Players))
	changed := false
	for _, p := range r.Players {
		if p.ID == targetID && !p.IsBot {
			changed = true
			continue
		}
		filtered = append(filtered, p)
	}
	r.Players = filtered
	r.mu.Unlock()
	if changed {
		r.notifyChange()
	}
}

func (r *Room) ReturnToLobby() {
	r.mu.Lock()
	r.phaseSeq++
	r.Phase = PhaseLobby
	r.Winner = ""
	r.WinReason = ""
	r.PartnerID = ""
	r.CurrentClaim = nil
	r.LeaderCards = nil
	r.PartnerCards = nil
	r.PeekedCards = nil
	for _, p := range r.Players {
		p.IsAlive = true
		p.Expression = "neutral"
		p.Bubble = ""
		p.TargetID = ""
	}
	r.mu.Unlock()
	r.notifyChange()
}

func (r *Room) StartGameWithBots() error {
	r.mu.Lock()
	if len(r.Players) == 0 {
		r.mu.Unlock()
		return fmt.Errorf("masada hiç oyuncu yok")
	}

	// En az 5 kişiye tamamlamak için bot ekle
	used := make(map[string]bool)
	for _, p := range r.Players {
		used[p.Name] = true
	}
	bIdx := 0
	for len(r.Players) < 5 && bIdx < len(lobbyBotPool) {
		cand := lobbyBotPool[bIdx]
		bIdx++
		if used[cand.Name] {
			continue
		}
		used[cand.Name] = true
		botID := fmt.Sprintf("bot-%d-%d", bIdx, time.Now().UnixNano()%1000)
		p := &Player{
			ID:         botID,
			Name:       cand.Name,
			IsBot:      true,
			IsAlive:    true,
			Avatar:     cand.Avatar,
			Expression: "neutral",
		}
		r.Players = append(r.Players, p)
		r.Suspicions[p.ID] = make(map[string]string)
	}

	// 5, 6 veya 7 oyuncu için dengeli rol dağılımı
	n := len(r.Players)
	var roles []Role
	switch {
	case n >= 7:
		roles = []Role{RoleProtector, RoleProtector, RoleProtector, RoleProtector, RoleSpy, RoleSpy, RoleSecretLeader}
	case n == 6:
		roles = []Role{RoleProtector, RoleProtector, RoleProtector, RoleProtector, RoleSpy, RoleSecretLeader}
	default:
		roles = []Role{RoleProtector, RoleProtector, RoleProtector, RoleSpy, RoleSecretLeader}
	}

	rand.Shuffle(len(roles), func(i, j int) { roles[i], roles[j] = roles[j], roles[i] })

	for i, p := range r.Players {
		p.Role = roles[i%len(roles)]
		p.IsAlive = true
		p.Expression = "neutral"
		p.Bubble = ""
		p.TargetID = ""
		r.Suspicions[p.ID] = make(map[string]string)
	}

	// Desteyi oluştur: 6 Mavi, 11 Kırmızı = 17 Kart
	r.initDeck()

	r.BluePolicies = 0
	r.RedPolicies = 0
	r.ChaosCounter = 0
	r.Round = 1
	r.LeaderIdx = rand.Intn(len(r.Players))
	r.PartnerID = ""
	r.PrevLeaderID = ""
	r.PrevPartnerID = ""
	r.Phase = PhaseNomination
	r.Winner = ""
	r.WinReason = ""
	r.CurrentClaim = nil
	r.LastVoteItem = nil
	r.VoteHistory = make([]VoteHistoryItem, 0)
	r.Votes = make(map[string]string)
	r.LeaderCards = nil
	r.ActualLeaderDrawn = nil
	r.PartnerCards = nil
	r.PeekedCards = nil

	leader := r.Players[r.LeaderIdx]
	r.addLog("Oyun başladı! Roller dağıtıldı ve 17 yasa kartı karıştırıldı.", "alert")
	r.addLog(fmt.Sprintf("İlk Lider: %s. Ortak adayını belirlemesi bekleniyor.", leader.Name), "info")
	r.armPhaseTimerLocked(PhaseNomination, DefaultPhaseSeconds)

	r.mu.Unlock()
	r.notifyChange()

	r.checkBotAction()
	return nil
}

// armPhaseTimerLocked her faz için 10 saniyelik otoriter zamanlayıcı kurar (mu kilitliyken çağrılır)
func (r *Room) armPhaseTimerLocked(expectedPhase GamePhase, seconds int) {
	r.phaseSeq++
	seq := r.phaseSeq
	r.phaseDuration = seconds
	r.phaseEndsAt = time.Now().Add(time.Duration(seconds) * time.Second)

	time.AfterFunc(time.Duration(seconds)*time.Second+150*time.Millisecond, func() {
		r.handlePhaseTimeout(seq, expectedPhase)
	})
}

func (r *Room) handlePhaseTimeout(seq uint64, expectedPhase GamePhase) {
	r.mu.Lock()
	if r.phaseSeq != seq || r.Phase != expectedPhase || r.Phase == PhaseLobby || r.Phase == PhaseGameOver {
		r.mu.Unlock()
		return
	}

	leader := r.getCurrentLeader()
	partnerID := r.PartnerID
	r.mu.Unlock()

	switch expectedPhase {
	case PhaseNomination:
		if leader != nil {
			r.mu.RLock()
			var pick string
			for _, p := range r.Players {
				if p.ID != leader.ID && p.IsAlive && (p.ID != r.PrevPartnerID || r.countAlivePlayers() <= 5) {
					pick = p.ID
					break
				}
			}
			r.mu.RUnlock()
			if pick != "" {
				r.addLog(fmt.Sprintf("⏱️ Süre doldu: Lider %s otomatik aday seçti.", leader.Name), "info")
				_ = r.NominatePartner(leader.ID, pick)
			}
		}

	case PhaseVoting:
		r.mu.RLock()
		missing := make([]string, 0)
		for _, p := range r.Players {
			if p.IsAlive {
				if _, voted := r.Votes[p.ID]; !voted {
					missing = append(missing, p.ID)
				}
			}
		}
		r.mu.RUnlock()
		if len(missing) > 0 {
			r.addLog("⏱️ Oylama süresi doldu, kullanılmayan oylar Çekimser/Evet sayıldı.", "info")
			for _, id := range missing {
				_ = r.CastVote(id, "YES")
			}
		}

	case PhaseLegislateLeader:
		if leader != nil {
			r.addLog(fmt.Sprintf("⏱️ Süre doldu: Lider %s otomatik bir kart eledi.", leader.Name), "info")
			_ = r.LeaderDiscard(leader.ID, 0)
		}

	case PhaseLegislatePartner:
		if partnerID != "" {
			r.addLog("⏱️ Süre doldu: Ortak kalan kartlardan birini yürürlüğe koydu.", "info")
			_ = r.PartnerEnact(partnerID, 0)
		}

	case PhaseClaiming:
		r.mu.RLock()
		claim := r.CurrentClaim
		pCards := append([]Policy{}, r.PartnerCards...)
		lDrawn := append([]Policy{}, r.ActualLeaderDrawn...)
		r.mu.RUnlock()
		if claim != nil {
			if leader != nil && !claim.LeaderClaimed {
				_ = r.SubmitLeaderClaim(leader.ID, lDrawn, pCards)
			}
			if partnerID != "" && !claim.PartnerClaimed {
				_ = r.SubmitPartnerClaim(partnerID, pCards)
			}
		}

	case PhasePowersPeek:
		if leader != nil {
			_ = r.ClosePeek(leader.ID)
		}

	case PhasePowersExecution:
		if leader != nil {
			r.mu.RLock()
			var pick string
			for _, p := range r.Players {
				if p.ID != leader.ID && p.IsAlive {
					pick = p.ID
					break
				}
			}
			r.mu.RUnlock()
			if pick != "" {
				_ = r.ExecutePlayer(leader.ID, pick)
			}
		}

	case PhaseSuspicionMarking:
		r.FinishSuspicionMarking()
	}
}

func (r *Room) initDeck() {
	deck := make([]Policy, 0, 17)
	for i := 0; i < 6; i++ {
		deck = append(deck, PolicyBlue)
	}
	for i := 0; i < 11; i++ {
		deck = append(deck, PolicyRed)
	}
	rand.Shuffle(len(deck), func(i, j int) { deck[i], deck[j] = deck[j], deck[i] })
	r.Deck = deck
	r.DiscardPile = make([]Policy, 0)
}

func (r *Room) checkDeck() {
	if len(r.Deck) < 3 {
		r.addLog("Destedeki kartlar azaldı. Iskarta kartları desteye karıştırılıyor.", "info")
		r.Deck = append(r.Deck, r.DiscardPile...)
		r.DiscardPile = make([]Policy, 0)
		rand.Shuffle(len(r.Deck), func(i, j int) { r.Deck[i], r.Deck[j] = r.Deck[j], r.Deck[i] })
	}
}

func (r *Room) clearTempBubblesLocked() {
	for _, p := range r.Players {
		if p.Expression != "pointing" {
			p.Expression = "neutral"
			p.Bubble = ""
			p.TargetID = ""
		}
	}
}

// NominatePartner Liderin Ortak (Şansölye) aday göstermesi
func (r *Room) NominatePartner(leaderID, candidateID string) error {
	r.mu.Lock()
	if r.Phase != PhaseNomination {
		r.mu.Unlock()
		return fmt.Errorf("adaylık fazında değil")
	}

	currentLeader := r.getCurrentLeader()
	if currentLeader == nil || currentLeader.ID != leaderID {
		r.mu.Unlock()
		return fmt.Errorf("sadece mevcut Lider aday gösterebilir")
	}

	if candidateID == leaderID {
		r.mu.Unlock()
		return fmt.Errorf("lider kendini ortak seçemez")
	}

	// Uygunluk kontrolü: 6+ oyuncu hayattayken önceki ortak tekrar seçilemez
	if candidateID == r.PrevPartnerID && r.countAlivePlayers() > 5 {
		r.mu.Unlock()
		return fmt.Errorf("önceki ortak tekrar seçilemez")
	}

	var candidate *Player
	for _, p := range r.Players {
		if p.ID == candidateID && p.IsAlive {
			candidate = p
			break
		}
	}
	if candidate == nil {
		r.mu.Unlock()
		return fmt.Errorf("geçersiz aday")
	}

	r.PartnerID = candidateID
	r.Phase = PhaseVoting
	r.Votes = make(map[string]string)
	currentLeader.Expression = "pointing"
	currentLeader.Bubble = fmt.Sprintf("👉 Adayım %s", candidate.Name)
	currentLeader.TargetID = candidateID
	r.addLog(fmt.Sprintf("%s, Ortak adayı olarak %s'yi önerdi. Oylama başladı!", currentLeader.Name, candidate.Name), "vote")
	r.armPhaseTimerLocked(PhaseVoting, DefaultPhaseSeconds)

	r.mu.Unlock()
	r.notifyChange()

	r.checkBotAction()
	return nil
}

// CastVote Oyuncunun oy kullanması ("YES" / "NO")
func (r *Room) CastVote(playerID, vote string) error {
	r.mu.Lock()
	if r.Phase != PhaseVoting {
		r.mu.Unlock()
		return fmt.Errorf("oylama fazında değil")
	}

	if vote != "YES" && vote != "NO" {
		r.mu.Unlock()
		return fmt.Errorf("geçersiz oy")
	}

	r.Votes[playerID] = vote

	// Tüm hayattaki oyuncular oy verdi mi?
	allVoted := true
	for _, p := range r.Players {
		if p.IsAlive {
			if _, ok := r.Votes[p.ID]; !ok {
				allVoted = false
				break
			}
		}
	}

	if allVoted {
		r.resolveVoting()
		r.mu.Unlock()
		r.notifyChange()
		r.checkBotAction()
		return nil
	}

	r.mu.Unlock()
	r.notifyChange()
	return nil
}

func (r *Room) resolveVoting() {
	yesCount := 0
	noCount := 0
	votesCopy := make(map[string]string)

	for id, v := range r.Votes {
		votesCopy[id] = v
		if v == "YES" {
			yesCount++
		} else {
			noCount++
		}
	}

	leader := r.getCurrentLeader()
	partner := r.getPlayerByID(r.PartnerID)
	passed := yesCount > noCount

	histItem := VoteHistoryItem{
		Round:       r.Round,
		LeaderID:    leader.ID,
		LeaderName:  leader.Name,
		PartnerID:   partner.ID,
		PartnerName: partner.Name,
		Passed:      passed,
		Votes:       votesCopy,
	}
	r.LastVoteItem = &histItem
	r.VoteHistory = append(r.VoteHistory, histItem)

	if passed {
		r.addLog(fmt.Sprintf("Oylama KABUL EDİLDİ (%d Evet / %d Hayır). Hükümet kuruldu!", yesCount, noCount), "vote")
		r.ChaosCounter = 0

		// 3 Kırmızı yasa çıktıktan sonra Gizli Lider Ortak seçilirse Casuslar derhal kazanır!
		if r.RedPolicies >= 3 && partner.Role == RoleSecretLeader {
			r.Winner = "SPIES"
			r.WinReason = fmt.Sprintf("Gizli Lider (%s) Ortak olarak seçildi ve oylamadan geçti! Casuslar zafer kazandı.", partner.Name)
			r.Phase = PhaseGameOver
			r.phaseSeq++
			r.addLog(r.WinReason, "alert")
			return
		}

		// Yasama fazına geç (Lider masadaki desteden 3 kart çeker)
		r.checkDeck()
		r.LeaderCards = append([]Policy{}, r.Deck[:3]...)
		r.ActualLeaderDrawn = append([]Policy{}, r.LeaderCards...)
		r.Deck = r.Deck[3:]
		r.PartnerCards = nil
		r.clearTempBubblesLocked()
		r.Phase = PhaseLegislateLeader
		r.addLog(fmt.Sprintf("🃏 Lider %s masadaki desteden 3 gizli yasa kartı çekti.", leader.Name), "policy")
		r.armPhaseTimerLocked(PhaseLegislateLeader, DefaultPhaseSeconds)
	} else {
		r.addLog(fmt.Sprintf("Oylama REDDEDİLDİ (%d Evet / %d Hayır). Kaos sayacı arttı.", yesCount, noCount), "vote")
		r.ChaosCounter++

		if r.ChaosCounter >= 3 {
			r.addLog("🔥 Kaos 3'e ulaştı! Destedeki en üst yasa doğrudan yürürlüğe giriyor!", "alert")
			r.checkDeck()
			enacted := r.Deck[0]
			r.Deck = r.Deck[1:]
			r.applyEnactedPolicy(enacted, true)
			r.ChaosCounter = 0
			if r.Phase == PhaseGameOver {
				return
			}
		}

		// Sonraki lider
		r.advanceLeader()
		r.Phase = PhaseNomination
		r.PartnerID = ""
		r.armPhaseTimerLocked(PhaseNomination, DefaultPhaseSeconds)
	}
}

// LeaderDiscard Lider 3 karttan 1'ini atar, 2'sini ortağa iletir
func (r *Room) LeaderDiscard(leaderID string, discardIdx int) error {
	r.mu.Lock()
	if r.Phase != PhaseLegislateLeader {
		r.mu.Unlock()
		return fmt.Errorf("lider yasama fazında değil")
	}

	leader := r.getCurrentLeader()
	if leader == nil || leader.ID != leaderID {
		r.mu.Unlock()
		return fmt.Errorf("sadece mevcut lider kart eleyebilir")
	}

	if discardIdx < 0 || discardIdx >= len(r.LeaderCards) {
		r.mu.Unlock()
		return fmt.Errorf("geçersiz kart indeksi")
	}

	discarded := r.LeaderCards[discardIdx]
	r.DiscardPile = append(r.DiscardPile, discarded)

	passed := make([]Policy, 0, 2)
	for i, c := range r.LeaderCards {
		if i != discardIdx {
			passed = append(passed, c)
		}
	}
	r.PartnerCards = passed
	r.Phase = PhaseLegislatePartner
	r.armPhaseTimerLocked(PhaseLegislatePartner, DefaultPhaseSeconds)

	r.addLog(fmt.Sprintf("🃏 Lider %s 1 kartı eledi ve 2 kartı masadan Ortağa (%s) uzattı.", leader.Name, r.getPlayerByID(r.PartnerID).Name), "policy")

	r.mu.Unlock()
	r.notifyChange()

	r.checkBotAction()
	return nil
}

// PartnerEnact Ortak 2 karttan 1'ini seçip yasalaştırır, diğerini atar
func (r *Room) PartnerEnact(partnerID string, enactIdx int) error {
	r.mu.Lock()
	if r.Phase != PhaseLegislatePartner {
		r.mu.Unlock()
		return fmt.Errorf("ortak yasama fazında değil")
	}

	if r.PartnerID != partnerID {
		r.mu.Unlock()
		return fmt.Errorf("sadece mevcut ortak kart yasalaştırabilir")
	}

	if enactIdx < 0 || enactIdx >= len(r.PartnerCards) {
		r.mu.Unlock()
		return fmt.Errorf("geçersiz kart indeksi")
	}

	enacted := r.PartnerCards[enactIdx]
	discardIdx := 1 - enactIdx
	r.DiscardPile = append(r.DiscardPile, r.PartnerCards[discardIdx])

	partner := r.getPlayerByID(partnerID)
	r.addLog(fmt.Sprintf("🃏 Ortak %s seçtiği yasayı masaya koydu!", partner.Name), "policy")

	r.applyEnactedPolicy(enacted, false)

	r.mu.Unlock()
	r.notifyChange()

	r.checkBotAction()
	return nil
}

func (r *Room) applyEnactedPolicy(policy Policy, wasChaos bool) {
	if policy == PolicyBlue {
		r.BluePolicies++
		r.addLog(fmt.Sprintf("🛡️ KORUYUCU YASASI GEÇTİ! (Toplam: %d/5)", r.BluePolicies), "policy")
	} else {
		r.RedPolicies++
		r.addLog(fmt.Sprintf("🚨 CASUS YASASI GEÇTİ! (Toplam: %d/6)", r.RedPolicies), "policy")
	}

	if r.LastVoteItem != nil {
		r.LastVoteItem.EnactedPolicy = policy
	}

	// Zafer kontrolleri
	if r.BluePolicies >= 5 {
		r.Winner = "PROTECTORS"
		r.WinReason = "5 Koruyucu Yasası başarıyla yürürlüğe girdi. Koruyucular kazandı!"
		r.Phase = PhaseGameOver
		r.phaseSeq++
		r.addLog(r.WinReason, "alert")
		return
	}
	if r.RedPolicies >= 6 {
		r.Winner = "SPIES"
		r.WinReason = "6 Casus Yasası yürürlüğe girdi. Casuslar sistemi ele geçirdi!"
		r.Phase = PhaseGameOver
		r.phaseSeq++
		r.addLog(r.WinReason, "alert")
		return
	}

	if wasChaos {
		r.advanceLeader()
		r.Phase = PhaseNomination
		r.PartnerID = ""
		r.armPhaseTimerLocked(PhaseNomination, DefaultPhaseSeconds)
		return
	}

	r.CurrentClaim = &Claim{
		PartnerEnacted: policy,
	}
	r.Phase = PhaseClaiming
	r.addLog("İddia Aşaması: Lider ve Ortak kart beyanlarını sunuyor.", "info")
	r.armPhaseTimerLocked(PhaseClaiming, DefaultPhaseSeconds)
}

// SubmitLeaderClaim Lider iddiasını bildirir
func (r *Room) SubmitLeaderClaim(leaderID string, drawn []Policy, passed []Policy) error {
	r.mu.Lock()
	if r.Phase != PhaseClaiming {
		r.mu.Unlock()
		return fmt.Errorf("iddia fazında değil")
	}

	leader := r.getCurrentLeader()
	if leader == nil || leader.ID != leaderID {
		r.mu.Unlock()
		return fmt.Errorf("sadece mevcut lider beyanda bulunabilir")
	}

	if r.CurrentClaim == nil {
		r.CurrentClaim = &Claim{}
	}

	r.CurrentClaim.LeaderDrawn = drawn
	r.CurrentClaim.LeaderPassed = passed
	r.CurrentClaim.LeaderClaimed = true

	r.addLog(fmt.Sprintf("%s beyan etti: '3 kart (%s) çektim, Ortağa %s ilettim.'", leader.Name, formatPolicies(drawn), formatPolicies(passed)), "info")

	r.checkClaimsLocked()
	r.mu.Unlock()
	r.notifyChange()

	if r.Phase != PhaseClaiming {
		r.checkBotAction()
	}
	return nil
}

// SubmitPartnerClaim Ortak iddiasını bildirir
func (r *Room) SubmitPartnerClaim(partnerID string, received []Policy) error {
	r.mu.Lock()
	if r.Phase != PhaseClaiming {
		r.mu.Unlock()
		return fmt.Errorf("iddia fazında değil")
	}

	if r.PartnerID != partnerID {
		r.mu.Unlock()
		return fmt.Errorf("sadece mevcut ortak beyanda bulunabilir")
	}

	if r.CurrentClaim == nil {
		r.CurrentClaim = &Claim{}
	}

	r.CurrentClaim.PartnerReceived = received
	r.CurrentClaim.PartnerClaimed = true

	partner := r.getPlayerByID(partnerID)
	r.addLog(fmt.Sprintf("%s beyan etti: 'Liderden bana %s geldi.'", partner.Name, formatPolicies(received)), "info")

	r.checkClaimsLocked()
	r.mu.Unlock()
	r.notifyChange()

	if r.Phase != PhaseClaiming {
		r.checkBotAction()
	}
	return nil
}

func (r *Room) checkClaimsLocked() {
	if r.CurrentClaim.LeaderClaimed && r.CurrentClaim.PartnerClaimed {
		lPassedBlue := countBlue(r.CurrentClaim.LeaderPassed)
		lPassedRed := len(r.CurrentClaim.LeaderPassed) - lPassedBlue

		pRecBlue := countBlue(r.CurrentClaim.PartnerReceived)
		pRecRed := len(r.CurrentClaim.PartnerReceived) - pRecBlue

		leader := r.getCurrentLeader()
		leaderID := ""
		if leader != nil {
			leaderID = leader.ID
		}

		if lPassedBlue != pRecBlue || lPassedRed != pRecRed {
			r.CurrentClaim.HasConflict = true
			r.CurrentClaim.ConflictNote = fmt.Sprintf("ÇELİŞKİ! Lider %d Mavi/%d Kırmızı verdiğini, Ortak ise %d Mavi/%d Kırmızı aldığını iddia ediyor!", lPassedBlue, lPassedRed, pRecBlue, pRecRed)
			r.addLog("⚡ ÇELİŞKİ TESPİT EDİLDİ! BİRİ YALAN SÖYLÜYOR!", "conflict")

			reactions := []string{"Ha?!", "Aha!", "👉 Yalan!", "Hmm..."}
			for i, p := range r.Players {
				if p.IsBot && p.IsAlive {
					if p.ID == leaderID && r.PartnerID != "" {
						p.Expression = "pointing"
						p.Bubble = "👉 O yalan söylüyor!"
						p.TargetID = r.PartnerID
					} else if p.ID == r.PartnerID && leaderID != "" {
						p.Expression = "pointing"
						p.Bubble = "👉 Lider yalan söylüyor!"
						p.TargetID = leaderID
					} else if i%2 == 0 && r.PartnerID != "" {
						p.Expression = "pointing"
						p.Bubble = "👉 Şüpheli!"
						p.TargetID = r.PartnerID
					} else {
						p.Expression = "surprised"
						p.Bubble = reactions[i%len(reactions)]
						p.TargetID = leaderID
					}
				}
			}
		} else {
			r.CurrentClaim.HasConflict = false
			r.CurrentClaim.ConflictNote = "Beyanlar birbiriyle örtüşüyor."
			r.addLog("Beyanlar tutarlı. Açık bir çelişki bulunamadı.", "info")

			if r.CurrentClaim.PartnerEnacted == PolicyRed {
				for i, p := range r.Players {
					if p.IsBot && p.IsAlive && p.ID != r.PartnerID {
						if i%2 == 0 {
							p.Expression = "thinking"
							p.Bubble = "Hmm..."
							p.TargetID = r.PartnerID
						} else {
							p.Expression = "look_left"
							p.Bubble = "👀..."
						}
					}
				}
			}
		}

		// Yetki kontrolü
		if r.CurrentClaim.PartnerEnacted == PolicyRed {
			if r.RedPolicies == 3 {
				r.Phase = PhasePowersPeek
				r.checkDeck()
				r.PeekedCards = append([]Policy{}, r.Deck[:min(3, len(r.Deck))]...)
				r.addLog(fmt.Sprintf("👁️ 3. Kırmızı Yasa Yetkisi: Lider (%s) destenin üstündeki 3 kartı inceliyor.", r.getCurrentLeader().Name), "alert")
				r.armPhaseTimerLocked(PhasePowersPeek, DefaultPhaseSeconds)
				return
			} else if r.RedPolicies == 4 || r.RedPolicies == 5 {
				r.Phase = PhasePowersExecution
				r.addLog(fmt.Sprintf("⚖️ %d. Kırmızı Yasa Yetkisi: Lider (%s) masadan birini infaz etmek zorunda!", r.RedPolicies, r.getCurrentLeader().Name), "alert")
				r.armPhaseTimerLocked(PhasePowersExecution, DefaultPhaseSeconds)
				return
			}
		}

		r.Phase = PhaseSuspicionMarking
		r.addLog("Şüphe & İşaret Aşaması: Parmağınla işaret edebilir veya çip bırakabilirsin.", "info")
		r.armPhaseTimerLocked(PhaseSuspicionMarking, DefaultPhaseSeconds)
	}
}

// ClosePeek Lider incelemeyi kapatır
func (r *Room) ClosePeek(leaderID string) error {
	r.mu.Lock()
	if r.Phase != PhasePowersPeek {
		r.mu.Unlock()
		return fmt.Errorf("peek fazında değil")
	}
	leader := r.getCurrentLeader()
	if leader == nil || leader.ID != leaderID {
		r.mu.Unlock()
		return fmt.Errorf("sadece lider kapatabilir")
	}
	r.PeekedCards = nil
	r.Phase = PhaseSuspicionMarking
	r.armPhaseTimerLocked(PhaseSuspicionMarking, DefaultPhaseSeconds)
	r.mu.Unlock()
	r.notifyChange()
	r.checkBotAction()
	return nil
}

// ExecutePlayer Lider bir oyuncuyu infaz eder
func (r *Room) ExecutePlayer(leaderID, targetID string) error {
	r.mu.Lock()
	if r.Phase != PhasePowersExecution {
		r.mu.Unlock()
		return fmt.Errorf("infaz fazında değil")
	}

	leader := r.getCurrentLeader()
	if leader == nil || leader.ID != leaderID {
		r.mu.Unlock()
		return fmt.Errorf("sadece lider infaz edebilir")
	}

	target := r.getPlayerByID(targetID)
	if target == nil || !target.IsAlive || target.ID == leaderID {
		r.mu.Unlock()
		return fmt.Errorf("geçersiz infaz hedefi")
	}

	target.IsAlive = false
	target.Expression = "surprised"
	target.Bubble = "💀..."
	r.addLog(fmt.Sprintf("⚖️ LİDER %s, %s OYUNCUSUNU İNFAZ ETTİ!", leader.Name, target.Name), "alert")

	// Gizli Lider infaz edildiyse Koruyucular anında kazanır!
	if target.Role == RoleSecretLeader {
		r.Winner = "PROTECTORS"
		r.WinReason = fmt.Sprintf("Gizli Lider (%s) infaz edildi! Koruyucular kazandı!", target.Name)
		r.Phase = PhaseGameOver
		r.phaseSeq++
		r.addLog(r.WinReason, "alert")
		r.mu.Unlock()
		r.notifyChange()
		return nil
	}

	r.addLog(fmt.Sprintf("%s Gizli Lider değildi. Oyun devam ediyor.", target.Name), "info")
	r.Phase = PhaseSuspicionMarking
	r.armPhaseTimerLocked(PhaseSuspicionMarking, DefaultPhaseSeconds)

	r.mu.Unlock()
	r.notifyChange()
	r.checkBotAction()
	return nil
}

// ToggleSuspicion Bir oyuncunun masadaki bir başkasına şüphe veya güven çipi koyması
func (r *Room) ToggleSuspicion(sourceID, targetID, chipType string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if chipType == "SUSPICIOUS" {
		chipType = "SUSPECT"
	}

	if _, ok := r.Suspicions[sourceID]; !ok {
		r.Suspicions[sourceID] = make(map[string]string)
	}

	current := r.Suspicions[sourceID][targetID]
	if current == chipType {
		delete(r.Suspicions[sourceID], targetID)
	} else {
		r.Suspicions[sourceID][targetID] = chipType
	}
	r.notifyChange()
}

// SetExpression Oyuncunun jest, mimik ve baloncuk ifadesini günceller
func (r *Room) SetExpression(playerID, expr, bubble, targetID string) {
	r.mu.Lock()

	p := r.getPlayerByID(playerID)
	var pointedBot *Player
	var pName string
	if p != nil {
		pName = p.Name
		if expr == "pointing" && targetID == "" {
			if r.PartnerID != "" && r.PartnerID != playerID {
				targetID = r.PartnerID
			} else if leader := r.getCurrentLeader(); leader != nil && leader.ID != playerID {
				targetID = leader.ID
			} else {
				for _, other := range r.Players {
					if other.ID != playerID && other.IsAlive {
						targetID = other.ID
						break
					}
				}
			}
		}

		p.Expression = expr
		p.Bubble = bubble
		p.TargetID = targetID

		if expr == "pointing" && targetID != "" {
			target := r.getPlayerByID(targetID)
			if target != nil {
				r.addLog(fmt.Sprintf("🫵 %s parmağıyla %s oyuncusunu işaret etti!", p.Name, target.Name), "info")
				if target.IsBot && target.IsAlive && !p.IsBot {
					pointedBot = target
				}
			}
		}
	}
	r.mu.Unlock()
	r.notifyChange()

	// Gerçek oyuncu bir botu parmakla işaret ederse bot kısa süre sonra tepki verir!
	if pointedBot != nil {
		go func(bID, pointerID, pointerName string) {
			time.Sleep(1100 * time.Millisecond)
			r.mu.Lock()
			bot := r.getPlayerByID(bID)
			if bot != nil && bot.IsAlive {
				roll := rand.Intn(3)
				if roll == 0 {
					bot.Expression = "surprised"
					bot.Bubble = "Ha?! Ben mi?!"
					bot.TargetID = pointerID
				} else if roll == 1 {
					bot.Expression = "pointing"
					bot.Bubble = fmt.Sprintf("👉 Asıl %s!", pointerName)
					bot.TargetID = pointerID
				} else {
					bot.Expression = "thinking"
					bot.Bubble = "Hmm..."
					bot.TargetID = pointerID
				}
			}
			r.mu.Unlock()
			r.notifyChange()
		}(pointedBot.ID, playerID, pName)
	}
}

// FinishSuspicionMarking Sonraki tura geç
func (r *Room) FinishSuspicionMarking() {
	r.mu.Lock()
	if r.Phase != PhaseSuspicionMarking {
		r.mu.Unlock()
		return
	}

	if l := r.getCurrentLeader(); l != nil {
		r.PrevLeaderID = l.ID
	}
	r.PrevPartnerID = r.PartnerID
	r.advanceLeader()
	r.Round++
	r.Phase = PhaseNomination
	r.PartnerID = ""
	r.CurrentClaim = nil
	r.clearTempBubblesLocked()

	newLeader := r.getCurrentLeader()
	r.addLog(fmt.Sprintf("Yeni Tur (#%d). Sıradaki Lider: %s", r.Round, newLeader.Name), "info")
	r.armPhaseTimerLocked(PhaseNomination, DefaultPhaseSeconds)

	r.mu.Unlock()
	r.notifyChange()
	r.checkBotAction()
}

func (r *Room) advanceLeader() {
	for i := 0; i < len(r.Players); i++ {
		r.LeaderIdx = (r.LeaderIdx + 1) % len(r.Players)
		if r.Players[r.LeaderIdx].IsAlive {
			break
		}
	}
}

func (r *Room) getCurrentLeader() *Player {
	if len(r.Players) == 0 {
		return nil
	}
	return r.Players[r.LeaderIdx]
}

func (r *Room) getPlayerByID(id string) *Player {
	for _, p := range r.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func (r *Room) countAlivePlayers() int {
	c := 0
	for _, p := range r.Players {
		if p.IsAlive {
			c++
		}
	}
	return c
}

func (r *Room) addLog(msg, logType string) {
	entry := LogEntry{
		Timestamp: time.Now().Format("15:04:05"),
		Message:   msg,
		Type:      logType,
	}
	r.Logs = append(r.Logs, entry)
	if len(r.Logs) > 100 {
		r.Logs = r.Logs[len(r.Logs)-100:]
	}
}

func (r *Room) notifyChange() {
	if r.OnStateChange != nil {
		r.OnStateChange()
	}
}

// GetPrivateView her oyuncuya özel güvenlik filtreli durum üretir
func (r *Room) GetPrivateView(playerID string) PrivatePlayerView {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var me *Player
	for _, p := range r.Players {
		if p.ID == playerID {
			me = p
			break
		}
	}

	publicPlayers := make([]PlayerPublic, len(r.Players))
	for i, p := range r.Players {
		publicPlayers[i] = PlayerPublic{
			ID:         p.ID,
			Name:       p.Name,
			IsBot:      p.IsBot,
			IsAlive:    p.IsAlive,
			Avatar:     p.Avatar,
			Expression: p.Expression,
			Bubble:     p.Bubble,
			TargetID:   p.TargetID,
		}
	}

	leader := r.getCurrentLeader()
	leaderID := ""
	if leader != nil {
		leaderID = leader.ID
	}

	exposedVotes := make(map[string]string)
	if r.Phase != PhaseVoting {
		for k, v := range r.Votes {
			exposedVotes[k] = v
		}
	} else {
		for k := range r.Votes {
			exposedVotes[k] = "VOTED"
		}
	}

	remaining := 0
	if !r.phaseEndsAt.IsZero() && r.Phase != PhaseLobby && r.Phase != PhaseGameOver {
		remaining = int(time.Until(r.phaseEndsAt).Seconds() + 0.5)
		if remaining < 0 {
			remaining = 0
		}
	}

	pub := PublicGameState{
		Phase:          r.Phase,
		Round:          r.Round,
		PhaseDuration:  r.phaseDuration,
		PhaseRemaining: remaining,
		ChaosCounter:   r.ChaosCounter,
		BluePolicies:   r.BluePolicies,
		RedPolicies:    r.RedPolicies,
		DeckCount:      len(r.Deck),
		DiscardCount:   len(r.DiscardPile),
		Players:        publicPlayers,
		LeaderID:       leaderID,
		PartnerID:      r.PartnerID,
		PrevLeaderID:   r.PrevLeaderID,
		PrevPartnerID:  r.PrevPartnerID,
		Votes:          exposedVotes,
		LastVoteItem:   r.LastVoteItem,
		History:        r.VoteHistory,
		Logs:           r.Logs,
		CurrentClaim:   r.CurrentClaim,
		Winner:         r.Winner,
		WinReason:      r.WinReason,
		Suspicions:     r.Suspicions,
		Version:        AppVersion,
	}

	view := PrivatePlayerView{
		PublicState: pub,
		YourID:      playerID,
	}

	if me != nil {
		view.YourRole = me.Role

		if me.Role == RoleSpy || me.Role == RoleSecretLeader {
			for _, p := range r.Players {
				if p.Role == RoleSecretLeader {
					view.SecretLeaderID = p.ID
				}
				if p.Role == RoleSpy && p.ID != me.ID {
					view.KnownAllies = append(view.KnownAllies, p.ID)
				}
			}
		}

		if r.Phase == PhaseLegislateLeader && leaderID == playerID {
			view.DrawnPolicies = r.LeaderCards
		} else if r.Phase == PhaseLegislatePartner && r.PartnerID == playerID {
			view.DrawnPolicies = r.PartnerCards
		} else if r.Phase == PhasePowersPeek && leaderID == playerID {
			view.PeekedPolicies = r.PeekedCards
		}
	}

	return view
}

// --- BOT YAPAY ZEKASI VE 3D MASA JESTLERİ ---
func (r *Room) checkBotAction() {
	go func() {
		time.Sleep(900 * time.Millisecond)

		r.mu.RLock()
		phase := r.Phase
		seq := r.phaseSeq
		leader := r.getCurrentLeader()
		partnerID := r.PartnerID
		partner := r.getPlayerByID(partnerID)
		aliveCount := r.countAlivePlayers()
		r.mu.RUnlock()

		// Masadaki botların mimik / bakış / parmakla işaret etme davranışları
		r.triggerBotTableGestures(phase, seq)

		switch phase {
		case PhaseNomination:
			if leader != nil && leader.IsBot && leader.IsAlive {
				r.SetExpression(leader.ID, "thinking", "Hmm... Kimi seçsem?", "")
				time.Sleep(2400 * time.Millisecond)

				r.mu.RLock()
				if r.Phase != PhaseNomination || r.phaseSeq != seq {
					r.mu.RUnlock()
					return
				}
				candidates := make([]string, 0)
				for _, p := range r.Players {
					if p.ID != leader.ID && p.IsAlive && (p.ID != r.PrevPartnerID || aliveCount <= 5) {
						candidates = append(candidates, p.ID)
					}
				}
				r.mu.RUnlock()

				if len(candidates) > 0 {
					pick := candidates[rand.Intn(len(candidates))]
					pickPlayer := r.getPlayerByID(pick)
					pickName := ""
					if pickPlayer != nil {
						pickName = pickPlayer.Name
					}
					r.SetExpression(leader.ID, "pointing", fmt.Sprintf("👉 Adayım %s!", pickName), pick)
					time.Sleep(900 * time.Millisecond)
					_ = r.NominatePartner(leader.ID, pick)
				}
			}

		case PhaseVoting:
			r.mu.RLock()
			for _, p := range r.Players {
				if p.IsBot && p.IsAlive {
					if _, voted := r.Votes[p.ID]; !voted {
						botID := p.ID
						botRole := p.Role
						go func(bID string, bRole Role) {
							delay := time.Duration(1800+rand.Intn(3600)) * time.Millisecond
							time.Sleep(delay)
							r.mu.RLock()
							stillVoting := r.Phase == PhaseVoting && r.phaseSeq == seq
							r.mu.RUnlock()
							if !stillVoting {
								return
							}
							vote := "YES"
							if bRole == RoleProtector && rand.Float32() < 0.28 {
								vote = "NO"
							}
							_ = r.CastVote(bID, vote)
						}(botID, botRole)
					}
				}
			}
			r.mu.RUnlock()

		case PhaseLegislateLeader:
			if leader != nil && leader.IsBot {
				r.SetExpression(leader.ID, "thinking", "Hmm... Kartlara bakalım", "")
				time.Sleep(3200 * time.Millisecond)
				r.mu.RLock()
				if r.Phase != PhaseLegislateLeader || r.phaseSeq != seq {
					r.mu.RUnlock()
					return
				}
				cards := r.LeaderCards
				role := leader.Role
				r.mu.RUnlock()

				discardIdx := 0
				if role == RoleProtector {
					for i, c := range cards {
						if c == PolicyRed {
							discardIdx = i
							break
						}
					}
				} else {
					for i, c := range cards {
						if c == PolicyBlue {
							discardIdx = i
							break
						}
					}
				}
				_ = r.LeaderDiscard(leader.ID, discardIdx)
			}

		case PhaseLegislatePartner:
			if partner != nil && partner.IsBot {
				r.SetExpression(partner.ID, "thinking", "Hmm... Hangi yasa?", "")
				time.Sleep(3400 * time.Millisecond)
				r.mu.RLock()
				if r.Phase != PhaseLegislatePartner || r.phaseSeq != seq {
					r.mu.RUnlock()
					return
				}
				cards := r.PartnerCards
				role := partner.Role
				r.mu.RUnlock()

				enactIdx := 0
				if role == RoleProtector {
					for i, c := range cards {
						if c == PolicyBlue {
							enactIdx = i
							break
						}
					}
				} else {
					for i, c := range cards {
						if c == PolicyRed {
							enactIdx = i
							break
						}
					}
				}
				_ = r.PartnerEnact(partner.ID, enactIdx)
			}

		case PhaseClaiming:
			time.Sleep(2000 * time.Millisecond)
			r.mu.RLock()
			if r.Phase != PhaseClaiming || r.phaseSeq != seq || r.CurrentClaim == nil {
				r.mu.RUnlock()
				return
			}
			claim := r.CurrentClaim
			lDrawn := append([]Policy{}, r.ActualLeaderDrawn...)
			pCards := append([]Policy{}, r.PartnerCards...)
			r.mu.RUnlock()

			// Lider botsa beyan ver (Casus ise yalan söyleyebilir)
			if leader != nil && leader.IsBot && !claim.LeaderClaimed {
				drawn := lDrawn
				passed := pCards
				if len(drawn) < 3 {
					drawn = []Policy{PolicyBlue, PolicyRed, PolicyRed}
				}
				if len(passed) < 2 {
					passed = []Policy{PolicyRed, PolicyRed}
				}

				if leader.Role != RoleProtector && countBlue(lDrawn) > 0 && claim.PartnerEnacted == PolicyRed {
					// Casus/Gizli Lider "3 Kırmızı geldi, elimde yoktu!" yalanı söyleyebilir
					drawn = []Policy{PolicyRed, PolicyRed, PolicyRed}
					passed = []Policy{PolicyRed, PolicyRed}
				}
				_ = r.SubmitLeaderClaim(leader.ID, drawn, passed)
			}

			// Ortak botsa beyan ver (Casus ise yalan söyleyebilir -> Çelişki!)
			r.mu.RLock()
			stillClaiming := r.Phase == PhaseClaiming && r.phaseSeq == seq
			claimAfterLeader := r.CurrentClaim
			r.mu.RUnlock()

			if stillClaiming && partner != nil && partner.IsBot && claimAfterLeader != nil && !claimAfterLeader.PartnerClaimed {
				time.Sleep(1600 * time.Millisecond)
				r.mu.RLock()
				if r.Phase != PhaseClaiming || r.phaseSeq != seq {
					r.mu.RUnlock()
					return
				}
				rec := pCards
				role := partner.Role
				enacted := r.CurrentClaim.PartnerEnacted
				r.mu.RUnlock()

				if len(rec) < 2 {
					rec = []Policy{enacted, PolicyRed}
				}
				// Eğer Casus Ortak eline Mavi geldiği halde Kırmızı oynadıysa %70 ihtimalle "2 Kırmızı geldi" der!
				if role != RoleProtector && enacted == PolicyRed && countBlue(rec) > 0 && rand.Float32() < 0.70 {
					rec = []Policy{PolicyRed, PolicyRed}
				}
				_ = r.SubmitPartnerClaim(partner.ID, rec)
			}

		case PhasePowersPeek:
			if leader != nil && leader.IsBot {
				r.SetExpression(leader.ID, "eureka", "Aha! Desteyi gördüm!", "")
				time.Sleep(3500 * time.Millisecond)
				r.mu.RLock()
				ok := r.Phase == PhasePowersPeek && r.phaseSeq == seq
				r.mu.RUnlock()
				if ok {
					_ = r.ClosePeek(leader.ID)
				}
			}

		case PhasePowersExecution:
			if leader != nil && leader.IsBot {
				r.SetExpression(leader.ID, "thinking", "Hmm... Kim Casus?", "")
				time.Sleep(2600 * time.Millisecond)
				r.mu.RLock()
				if r.Phase != PhasePowersExecution || r.phaseSeq != seq {
					r.mu.RUnlock()
					return
				}
				targets := make([]string, 0)
				for _, p := range r.Players {
					if p.ID != leader.ID && p.IsAlive {
						targets = append(targets, p.ID)
					}
				}
				r.mu.RUnlock()

				if len(targets) > 0 {
					pick := targets[rand.Intn(len(targets))]
					r.SetExpression(leader.ID, "pointing", "👉 İnfaz kararım!", pick)
					time.Sleep(1200 * time.Millisecond)
					_ = r.ExecutePlayer(leader.ID, pick)
				}
			}
		}
	}()
}

// triggerBotTableGestures Botların her fazda sağa-sola bakması, parmakla işaret etmesi ve şüphe çipi bırakması
func (r *Room) triggerBotTableGestures(phase GamePhase, seq uint64) {
	go func() {
		time.Sleep(550 * time.Millisecond)
		r.mu.Lock()
		if r.Phase != phase || r.phaseSeq != seq || r.Phase == PhaseLobby || r.Phase == PhaseGameOver {
			r.mu.Unlock()
			return
		}

		leader := r.getCurrentLeader()
		leaderID := ""
		if leader != nil {
			leaderID = leader.ID
		}
		partnerID := r.PartnerID

		aliveIDs := make([]string, 0)
		for _, p := range r.Players {
			if p.IsAlive {
				aliveIDs = append(aliveIDs, p.ID)
			}
		}

		for idx, p := range r.Players {
			if !p.IsBot || !p.IsAlive {
				continue
			}

			switch phase {
			case PhaseNomination:
				if p.ID != leaderID {
					modes := []struct{ e, b string }{
						{"look_left", "👈..."},
						{"look_right", "...👉"},
						{"thinking", "Hmm..."},
						{"pointing", "👉 Beni seç!"},
					}
					m := modes[(idx+r.Round)%len(modes)]
					p.Expression = m.e
					p.Bubble = m.b
					if m.e == "pointing" && leaderID != "" {
						p.TargetID = leaderID
					} else {
						p.TargetID = ""
					}
				}

			case PhaseVoting:
				if idx%3 == 0 && partnerID != "" && partnerID != p.ID {
					p.Expression = "pointing"
					p.Bubble = "👉 Emin miyiz?"
					p.TargetID = partnerID
				} else if idx%2 == 0 {
					p.Expression = "thinking"
					p.Bubble = "Hmm..."
					p.TargetID = partnerID
				} else {
					p.Expression = "look_right"
					p.Bubble = "👀"
					p.TargetID = ""
				}

			case PhaseLegislateLeader:
				if p.ID != leaderID {
					if idx%2 == 0 && leaderID != "" {
						p.Expression = "pointing"
						p.Bubble = "👉 Ne çekti?"
						p.TargetID = leaderID
					} else {
						p.Expression = "look_left"
						p.Bubble = "🃏 Kartlar..."
						p.TargetID = leaderID
					}
				}

			case PhaseLegislatePartner:
				if p.ID != partnerID {
					if idx%2 == 1 && partnerID != "" {
						p.Expression = "pointing"
						p.Bubble = "👉 Mavi bas!"
						p.TargetID = partnerID
					} else {
						p.Expression = "thinking"
						p.Bubble = "Hmm..."
						p.TargetID = partnerID
					}
				}

			case PhaseSuspicionMarking:
				if _, ok := r.Suspicions[p.ID]; !ok {
					r.Suspicions[p.ID] = make(map[string]string)
				}
				target := partnerID
				if target == "" || target == p.ID {
					target = leaderID
				}
				if (target == "" || target == p.ID) && len(aliveIDs) > 0 {
					target = aliveIDs[(idx+1)%len(aliveIDs)]
				}

				if target != "" && target != p.ID {
					if r.CurrentClaim != nil && (r.CurrentClaim.HasConflict || r.CurrentClaim.PartnerEnacted == PolicyRed) {
						r.Suspicions[p.ID][target] = "SUSPECT"
						if idx%2 == 0 {
							p.Expression = "pointing"
							p.Bubble = "👉 Şüpheli!"
							p.TargetID = target
						} else {
							p.Expression = "eureka"
							p.Bubble = "Aha! Çözdüm!"
							p.TargetID = target
						}
					} else if r.CurrentClaim != nil && r.CurrentClaim.PartnerEnacted == PolicyBlue {
						r.Suspicions[p.ID][target] = "TRUSTED"
						p.Expression = "eureka"
						p.Bubble = "👍 Güvenilir!"
						p.TargetID = target
					}
				}
			}
		}

		r.mu.Unlock()
		r.notifyChange()
	}()
}

func formatPolicies(p []Policy) string {
	b := 0
	r := 0
	for _, c := range p {
		if c == PolicyBlue {
			b++
		} else {
			r++
		}
	}
	return fmt.Sprintf("%d Mavi, %d Kırmızı", b, r)
}

func countBlue(p []Policy) int {
	c := 0
	for _, x := range p {
		if x == PolicyBlue {
			c++
		}
	}
	return c
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
