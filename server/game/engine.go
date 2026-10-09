package game

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

const AppVersion = "v0.1.0"

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
	LeaderCards  []Policy // Liderin elindeki 3 kart
	PartnerCards []Policy // Ortağa iletilen 2 kart

	// Oylama
	Votes        map[string]string // ID -> "YES" / "NO"
	VoteHistory  []VoteHistoryItem
	LastVoteItem *VoteHistoryItem

	// İddialar ve Çelişkiler
	CurrentClaim *Claim

	// Masaüstü Şüphe/Güven Çipleri
	// Suspicions[sourceID][targetID] = "SUSPICIOUS" | "TRUSTED"
	Suspicions map[string]map[string]string

	PeekedCards []Policy // Liderin incelediği kartlar

	Winner    string
	WinReason string
	Logs      []LogEntry

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
			return p
		}
	}

	p := &Player{
		ID:      id,
		Name:    name,
		IsBot:   isBot,
		IsAlive: true,
		Avatar:  avatar,
	}
	r.Players = append(r.Players, p)
	r.Suspicions[id] = make(map[string]string)
	r.addLog(fmt.Sprintf("%s masaya katıldı.", name), "info")
	return p
}

func (r *Room) StartGameWithBots() error {
	r.mu.Lock()
	if len(r.Players) == 0 {
		r.mu.Unlock()
		return fmt.Errorf("masada hiç oyuncu yok")
	}

	// 5 kişiye tamamlamak için bot ekle
	botNames := []string{"Ajan Kaya", "Mühendis Ece", "Analist Can", "Operatör Deniz"}
	avatars := []string{"🤖", "🦊", "🦉", "🦁"}
	bIdx := 0
	for len(r.Players) < 5 && bIdx < len(botNames) {
		p := &Player{
			ID:      fmt.Sprintf("bot-%d", bIdx+1),
			Name:    botNames[bIdx],
			IsBot:   true,
			IsAlive: true,
			Avatar:  avatars[bIdx],
		}
		r.Players = append(r.Players, p)
		r.Suspicions[p.ID] = make(map[string]string)
		bIdx++
	}

	// Rolleri ata (5 oyuncu için: 3 Koruyucu, 1 Casus, 1 Gizli Lider)
	roles := []Role{RoleProtector, RoleProtector, RoleProtector, RoleSpy, RoleSecretLeader}
	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(roles), func(i, j int) { roles[i], roles[j] = roles[j], roles[i] })

	for i, p := range r.Players {
		p.Role = roles[i]
		p.IsAlive = true
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

	leader := r.Players[r.LeaderIdx]
	r.addLog("Oyun başladı! Roller dağıtıldı ve 17 yasa kartı karıştırıldı.", "alert")
	r.addLog(fmt.Sprintf("İlk Lider: %s. Ortak adayını belirlemesi bekleniyor.", leader.Name), "info")

	r.mu.Unlock()
	r.notifyChange()

	// Eğer ilk lider botsa aday önersin
	r.checkBotAction()
	return nil
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
		r.addLog("Destedeki kartlar azaldı. Atılan kartlar desteye karıştırılıyor.", "info")
		r.Deck = append(r.Deck, r.DiscardPile...)
		r.DiscardPile = make([]Policy, 0)
		rand.Shuffle(len(r.Deck), func(i, j int) { r.Deck[i], r.Deck[j] = r.Deck[j], r.Deck[i] })
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

	// Uygunluk kontrolü: önceki ortak tekrar seçilemez
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
	r.addLog(fmt.Sprintf("%s, Ortak (Şansölye) adayı olarak %s'yi önerdi. Oylama başladı!", currentLeader.Name, candidate.Name), "vote")

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
	r.checkBotAction()
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

		// Gizli Lider Kazanma Koşulu:
		// 3 Kırmızı yasa çıktıktan sonra Gizli Lider Ortak seçilirse Casuslar derhal kazanır!
		if r.RedPolicies >= 3 && partner.Role == RoleSecretLeader {
			r.Winner = "SPIES"
			r.WinReason = fmt.Sprintf("Gizli Lider (%s) Ortak olarak seçildi ve oylamadan geçti! Casuslar zafer kazandı.", partner.Name)
			r.Phase = PhaseGameOver
			r.addLog(r.WinReason, "alert")
			return
		}

		// Yasama fazına geç (Lider kart çeker)
		r.checkDeck()
		r.LeaderCards = append([]Policy{}, r.Deck[:3]...)
		r.Deck = r.Deck[3:]
		r.PartnerCards = nil
		r.Phase = PhaseLegislateLeader
	} else {
		r.addLog(fmt.Sprintf("Oylama REDDEDİLDİ (%d Evet / %d Hayır). Kaos sayacı arttı.", yesCount, noCount), "vote")
		r.ChaosCounter++

		if r.ChaosCounter >= 3 {
			r.addLog("Kaos zirve yaptı! Halk isyan etti: Destedeki en üst yasa zorla geçiriliyor!", "alert")
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

	r.addLog(fmt.Sprintf("Lider %s 1 kartı eledi ve 2 gizli yasayı Ortağa (%s) iletti.", leader.Name, r.getPlayerByID(r.PartnerID).Name), "policy")

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
	r.addLog(fmt.Sprintf("Ortak %s yasayı masaya sürdü!", partner.Name), "policy")

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
		r.addLog(r.WinReason, "alert")
		return
	}
	if r.RedPolicies >= 6 {
		r.Winner = "SPIES"
		r.WinReason = "6 Casus Yasası yürürlüğe girdi. Casuslar sistemi ele geçirdi!"
		r.Phase = PhaseGameOver
		r.addLog(r.WinReason, "alert")
		return
	}

	if wasChaos {
		// Kaos ile geçtiyse iddia veya başkan yetkisi olmaz, doğrudan sonraki tura geçer
		r.advanceLeader()
		r.Phase = PhaseNomination
		r.PartnerID = ""
		return
	}

	// Normal yasalaşmada sessiz protokolün kalbi: İDDİA (CLAIMING) ARAYÜZÜNE GEÇ!
	r.CurrentClaim = &Claim{
		PartnerEnacted: policy,
	}
	r.Phase = PhaseClaiming
	r.addLog("İddia Aşaması: Lider ve Ortak ne çektiklerini masaya beyan ediyor.", "info")
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

	r.addLog(fmt.Sprintf("%s iddia etti: 'Desteden %s çektim, Ortağa %s ilettim.'", leader.Name, formatPolicies(drawn), formatPolicies(passed)), "info")

	r.checkClaims()
	r.mu.Unlock()
	r.notifyChange()

	r.checkBotAction()
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
	r.addLog(fmt.Sprintf("%s iddia etti: 'Liderden bana %s geldi.'", partner.Name, formatPolicies(received)), "info")

	r.checkClaims()
	r.mu.Unlock()
	r.notifyChange()

	r.checkBotAction()
	return nil
}

func (r *Room) checkClaims() {
	if r.CurrentClaim.LeaderClaimed && r.CurrentClaim.PartnerClaimed {
		// Çelişki kontrolü!
		// Liderin ilettiğini iddia ettiği kartlar ile Ortağın aldığını iddia ettiği kartlar uyuşuyor mu?
		lPassedBlue := countBlue(r.CurrentClaim.LeaderPassed)
		lPassedRed := len(r.CurrentClaim.LeaderPassed) - lPassedBlue

		pRecBlue := countBlue(r.CurrentClaim.PartnerReceived)
		pRecRed := len(r.CurrentClaim.PartnerReceived) - pRecBlue

		if lPassedBlue != pRecBlue || lPassedRed != pRecRed {
			r.CurrentClaim.HasConflict = true
			r.CurrentClaim.ConflictNote = fmt.Sprintf("ÇELİŞKİ! Lider %d Mavi/%d Kırmızı verdiğini, Ortak ise %d Mavi/%d Kırmızı aldığını iddia ediyor!", lPassedBlue, lPassedRed, pRecBlue, pRecRed)
			r.addLog("⚡ DİKKAT: BEYANLARDA ÇELİŞKİ TESPİT EDİLDİ! BİRİ YALAN SÖYLÜYOR!", "conflict")
		} else {
			r.CurrentClaim.HasConflict = false
			r.CurrentClaim.ConflictNote = "Beyanlar birbiriyle örtüşüyor."
			r.addLog("Beyanlar tutarlı. Açık bir çelişki bulunamadı.", "info")
		}

		// Şimdi yetki kontrolü yap: Son yasa Kırmızı ise yetki verilebilir mi?
		if r.CurrentClaim.PartnerEnacted == PolicyRed {
			if r.RedPolicies == 3 {
				// Gelecek 3 kartı inceleme yetkisi
				r.Phase = PhasePowersPeek
				r.checkDeck()
				r.PeekedCards = append([]Policy{}, r.Deck[:min(3, len(r.Deck))]...)
				r.addLog(fmt.Sprintf("3. Kırmızı Yasa Yetkisi: Lider (%s) destenin en üstündeki 3 yasayı inceliyor.", r.getCurrentLeader().Name), "alert")
				return
			} else if r.RedPolicies == 4 || r.RedPolicies == 5 {
				// İnfaz yetkisi
				r.Phase = PhasePowersExecution
				r.addLog(fmt.Sprintf("%d. Kırmızı Yasa Yetkisi: Lider (%s) masadan birini infaz etmek zorunda!", r.RedPolicies, r.getCurrentLeader().Name), "alert")
				return
			}
		}

		// Yetki yoksa Şüphe işaretleme fazına geç
		r.Phase = PhaseSuspicionMarking
		r.addLog("Masa Şüphe İşaretleme Aşaması: Oyuncular avatarlara çip yerleştirebilir.", "info")
	}
}

// ClosePeek Lider incelemeyi kapatır
func (r *Room) ClosePeek(leaderID string) error {
	r.mu.Lock()
	if r.Phase != PhasePowersPeek {
		r.mu.Unlock()
		return fmt.Errorf("peek fazında değil")
	}
	r.PeekedCards = nil
	r.Phase = PhaseSuspicionMarking
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
	r.addLog(fmt.Sprintf("⚖️ LİDER %s, %s OYUNCUSUNU İNFAZ ETTİ!", leader.Name, target.Name), "alert")

	// Eğer Gizli Lider infaz edildiyse Koruyucular anında kazanır!
	if target.Role == RoleSecretLeader {
		r.Winner = "PROTECTORS"
		r.WinReason = fmt.Sprintf("Gizli Lider (%s) infaz edildi! Koruyucular kazandı!", target.Name)
		r.Phase = PhaseGameOver
		r.addLog(r.WinReason, "alert")
		r.mu.Unlock()
		r.notifyChange()
		return nil
	}

	r.addLog(fmt.Sprintf("%s Gizli Lider değildi. Oyun devam ediyor.", target.Name), "info")
	r.Phase = PhaseSuspicionMarking

	r.mu.Unlock()
	r.notifyChange()
	r.checkBotAction()
	return nil
}

// ToggleSuspicion Bir oyuncunun masadaki bir başkasına şüphe veya güven çipi koyması
func (r *Room) ToggleSuspicion(sourceID, targetID, chipType string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.Suspicions[sourceID]; !ok {
		r.Suspicions[sourceID] = make(map[string]string)
	}

	current := r.Suspicions[sourceID][targetID]
	if current == chipType {
		delete(r.Suspicions[sourceID], targetID) // Kaldır
	} else {
		r.Suspicions[sourceID][targetID] = chipType
	}
	r.notifyChange()
}

// FinishSuspicionMarking Sonraki tura geç
func (r *Room) FinishSuspicionMarking() {
	r.mu.Lock()
	if r.Phase != PhaseSuspicionMarking {
		r.mu.Unlock()
		return
	}

	r.PrevLeaderID = r.getCurrentLeader().ID
	r.PrevPartnerID = r.PartnerID
	r.advanceLeader()
	r.Round++
	r.Phase = PhaseNomination
	r.PartnerID = ""
	r.CurrentClaim = nil

	newLeader := r.getCurrentLeader()
	r.addLog(fmt.Sprintf("Yeni Tur (#%d). Sıradaki Lider: %s", r.Round, newLeader.Name), "info")

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
			ID:      p.ID,
			Name:    p.Name,
			IsBot:   p.IsBot,
			IsAlive: p.IsAlive,
			Avatar:  p.Avatar,
		}
	}

	leader := r.getCurrentLeader()
	leaderID := ""
	if leader != nil {
		leaderID = leader.ID
	}

	// Oylama devam ederken kimin ne oy verdiği gizlidir; bitince açılır
	exposedVotes := make(map[string]string)
	if r.Phase != PhaseVoting {
		for k, v := range r.Votes {
			exposedVotes[k] = v
		}
	} else {
		// Sadece kimlerin oy verip vermediğini göster
		for k := range r.Votes {
			exposedVotes[k] = "VOTED"
		}
	}

	pub := PublicGameState{
		Phase:         r.Phase,
		Round:         r.Round,
		ChaosCounter:  r.ChaosCounter,
		BluePolicies:  r.BluePolicies,
		RedPolicies:   r.RedPolicies,
		DeckCount:     len(r.Deck),
		DiscardCount:  len(r.DiscardPile),
		Players:       publicPlayers,
		LeaderID:      leaderID,
		PartnerID:     r.PartnerID,
		PrevLeaderID:  r.PrevLeaderID,
		PrevPartnerID: r.PrevPartnerID,
		Votes:         exposedVotes,
		LastVoteItem:  r.LastVoteItem,
		History:       r.VoteHistory,
		Logs:          r.Logs,
		CurrentClaim:  r.CurrentClaim,
		Winner:        r.Winner,
		WinReason:     r.WinReason,
		Suspicions:    r.Suspicions,
		Version:       AppVersion,
	}

	view := PrivatePlayerView{
		PublicState: pub,
		YourID:      playerID,
	}

	if me != nil {
		view.YourRole = me.Role

		// 5 kişilik oyunda Casus ve Gizli Lider birbirini bilir
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

		// Kart çekimlerinde sadece ilgili kişiye elindeki kartlar gönderilir
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

// --- BOT YAPAY ZEKASI (RULES-BASED BOT SIMULATION) ---
func (r *Room) checkBotAction() {
	go func() {
		time.Sleep(700 * time.Millisecond) // İnsansı küçük gecikme

		r.mu.RLock()
		phase := r.Phase
		leader := r.getCurrentLeader()
		partnerID := r.PartnerID
		partner := r.getPlayerByID(partnerID)
		r.mu.RUnlock()

		switch phase {
		case PhaseNomination:
			if leader != nil && leader.IsBot && leader.IsAlive {
				// Uygun bir aday bul
				r.mu.RLock()
				candidates := make([]string, 0)
				for _, p := range r.Players {
					if p.ID != leader.ID && p.IsAlive && p.ID != r.PrevPartnerID {
						candidates = append(candidates, p.ID)
					}
				}
				r.mu.RUnlock()

				if len(candidates) > 0 {
					pick := candidates[rand.Intn(len(candidates))]
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
							time.Sleep(time.Duration(400+rand.Intn(600)) * time.Millisecond)
							vote := "YES"
							if bRole == RoleProtector {
								// Koruyucu bot: Kaos yüksekse veya güvensiz hissetmediyse genelde YES verir
								if rand.Float32() < 0.25 {
									vote = "NO"
								}
							} else {
								// Casus bot
								vote = "YES"
							}
							_ = r.CastVote(bID, vote)
						}(botID, botRole)
					}
				}
			}
			r.mu.RUnlock()

		case PhaseLegislateLeader:
			if leader != nil && leader.IsBot {
				r.mu.RLock()
				cards := r.LeaderCards
				role := leader.Role
				r.mu.RUnlock()

				discardIdx := 0
				if role == RoleProtector {
					// Koruyucu kırmızı varsa kırmızıyı eler
					for i, c := range cards {
						if c == PolicyRed {
							discardIdx = i
							break
						}
					}
				} else {
					// Casus mavi varsa maviyi eler
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
				r.mu.RLock()
				cards := r.PartnerCards
				role := partner.Role
				r.mu.RUnlock()

				enactIdx := 0
				if role == RoleProtector {
					// Koruyucu mavi varsa maviyi yasalaştırır
					for i, c := range cards {
						if c == PolicyBlue {
							enactIdx = i
							break
						}
					}
				} else {
					// Casus kırmızı varsa kırmızıyı yasalaştırır
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
			r.mu.RLock()
			claim := r.CurrentClaim
			r.mu.RUnlock()

			if claim == nil {
				return
			}

			// Lider botsa beyan ver
			if leader != nil && leader.IsBot && !claim.LeaderClaimed {
				r.mu.RLock()
				pCards := r.PartnerCards
				role := leader.Role
				r.mu.RUnlock()

				// Koruyucu bot gerçeği söyler; Casus bot mavisi yoksa "3 kırmızı geldi" yalanı söyleyebilir
				drawn := []Policy{PolicyBlue, PolicyRed, PolicyRed}
				passed := pCards
				if len(passed) == 0 {
					passed = []Policy{PolicyRed, PolicyRed}
				}
				if role == RoleProtector {
					drawn = append([]Policy{}, passed...)
					drawn = append(drawn, PolicyRed) // Temsili
				}
				_ = r.SubmitLeaderClaim(leader.ID, drawn, passed)
			}

			// Ortak botsa beyan ver
			if partner != nil && partner.IsBot && !claim.PartnerClaimed {
				r.mu.RLock()
				pCards := r.PartnerCards
				r.mu.RUnlock()

				rec := pCards
				if len(rec) == 0 {
					rec = []Policy{claim.PartnerEnacted, PolicyRed}
				}
				_ = r.SubmitPartnerClaim(partner.ID, rec)
			}

		case PhasePowersPeek:
			if leader != nil && leader.IsBot {
				time.Sleep(1500 * time.Millisecond)
				_ = r.ClosePeek(leader.ID)
			}

		case PhasePowersExecution:
			if leader != nil && leader.IsBot {
				r.mu.RLock()
				targets := make([]string, 0)
				for _, p := range r.Players {
					if p.ID != leader.ID && p.IsAlive {
						targets = append(targets, p.ID)
					}
				}
				r.mu.RUnlock()

				if len(targets) > 0 {
					pick := targets[rand.Intn(len(targets))]
					_ = r.ExecutePlayer(leader.ID, pick)
				}
			}

		case PhaseSuspicionMarking:
			// Botlar rastgele şüphe çipi koysun ve 3 saniye sonra yeni tura geçilsin
			time.Sleep(3 * time.Second)
			r.FinishSuspicionMarking()
		}
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
