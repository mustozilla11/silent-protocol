import { BotController } from './BotController.ts';
import { EventEmitter } from './EventEmitter.ts';
import type {
  ElectionResult,
  EngineEventMap,
  ExecutivePower,
  Faction,
  GamePhase,
  GameState,
  LogEntry,
  PartyMembership,
  Player,
  PlayerView,
  Policy,
  PublicPlayer,
  Role,
  Vote,
  WinReason,
} from './types.ts';

export interface GameEngineOptions {
  /** 5 ila 10 oyuncu sayısı (varsayılan: 5) */
  playerCount?: number;
  /** Tekrarlanabilir testler için özel PRNG fonksiyonu */
  rng?: () => number;
  /** İnsan oyuncunun adı */
  humanName?: string;
  /** Başlangıç Başkan indeksi */
  startingPresidentIndex?: number;
  /** Özel bot isimleri */
  botNames?: string[];
  /** Otomatik başlatılsın mı (varsayılan true) */
  autoStart?: boolean;
  /** Yasama sonrası beyan/tartışma fazını kullan (varsayılan true) */
  enableClaimDebate?: boolean;
}

const DEFAULT_BOT_NAMES = [
  'Ajan Kaya',
  'Mühendis Ece',
  'Analist Can',
  'Operatör Deniz',
  'Kriptolog Bora',
  'Diplomat Zeynep',
  'Dedektif Arda',
  'Arşivci Selin',
  'Gözcü Kerem',
];

const ROLE_DISTRIBUTIONS: Record<number, { liberals: number; fascists: number }> = {
  5: { liberals: 3, fascists: 1 },
  6: { liberals: 4, fascists: 1 },
  7: { liberals: 4, fascists: 2 },
  8: { liberals: 5, fascists: 2 },
  9: { liberals: 5, fascists: 3 },
  10: { liberals: 6, fascists: 3 },
};

/** 1..5 arası (indeks 0..4) Faşist politika yuvalarının yetki haritası (6. yuva = Faşist zaferi) */
export function getBoardPowersForPlayerCount(playerCount: number): ExecutivePower[] {
  if (playerCount <= 6) {
    return ['NONE', 'NONE', 'POLICY_PEEK', 'EXECUTION', 'EXECUTION'];
  }
  if (playerCount <= 8) {
    return ['NONE', 'INVESTIGATE', 'SPECIAL_ELECTION', 'EXECUTION', 'EXECUTION'];
  }
  return ['INVESTIGATE', 'INVESTIGATE', 'SPECIAL_ELECTION', 'EXECUTION', 'EXECUTION'];
}

/**
 * 5–10 Kişilik Secret Hitler Tam Kural Motoru (Headless State Machine).
 * Sıfır Three.js, sıfır DOM bağımlılığı.
 */
export class GameEngine {
  public readonly events = new EventEmitter<EngineEventMap>();
  private readonly rng: () => number;
  private readonly bots: BotController;
  private enableClaimDebate: boolean;
  private pendingPostClaimPower: ExecutivePower = 'NONE';
  private state: GameState;

  constructor(options: GameEngineOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.bots = new BotController(this.rng);
    this.enableClaimDebate = options.enableClaimDebate ?? true;
    this.state = this.createEmptyState();

    if (options.autoStart !== false) {
      this.startNewGame(options);
    }
  }

  private createEmptyState(): GameState {
    return {
      phase: 'SETUP',
      round: 0,
      playerCount: 5,
      players: [],
      presidentIndex: 0,
      presidentId: '',
      specialElectionReturnIndex: null,
      isSpecialElectionRound: false,
      chancellorNomineeId: null,
      chancellorId: null,
      lastElectedPresidentId: null,
      lastElectedChancellorId: null,
      votes: {},
      lastElectionResult: null,
      electionTracker: 0,
      liberalPolicies: 0,
      fascistPolicies: 0,
      vetoUnlocked: false,
      vetoRejectedThisTurn: false,
      drawPile: [],
      discardPile: [],
      actualPresidentDrawn: [],
      presidentHand: [],
      chancellorHand: [],
      peekedCards: [],
      activeExecutivePower: 'NONE',
      boardPowers: getBoardPowersForPlayerCount(5),
      investigatedPlayerIds: [],
      lastInvestigation: null,
      currentClaim: null,
      claimHistory: [],
      winner: null,
      winReason: null,
      logs: [],
    };
  }

  startNewGame(options: GameEngineOptions = {}): GameState {
    const rawCount = options.playerCount ?? this.state.playerCount ?? 5;
    const playerCount = Math.min(10, Math.max(5, Math.round(rawCount)));
    if (options.enableClaimDebate !== undefined) {
      this.enableClaimDebate = options.enableClaimDebate;
    }

    const humanName = options.humanName?.trim() || 'Sen';
    const botNames = options.botNames ?? DEFAULT_BOT_NAMES;
    const dist = ROLE_DISTRIBUTIONS[playerCount];

    const roles: Role[] = this.shuffle([
      ...Array<Role>(dist.liberals).fill('LIBERAL'),
      ...Array<Role>(dist.fascists).fill('FASCIST'),
      'HITLER',
    ]);

    const players: Player[] = Array.from({ length: playerCount }, (_, idx) => {
      const role = roles[idx];
      const partyMembership: PartyMembership = role === 'LIBERAL' ? 'LIBERAL' : 'FASCIST';
      return {
        id: idx === 0 ? 'human' : `bot-${idx}`,
        name: idx === 0 ? humanName : botNames[idx - 1] ?? `Oyuncu ${idx + 1}`,
        seatIndex: idx,
        isHuman: idx === 0,
        isAlive: true,
        role,
        partyMembership,
      };
    });

    const startIdx =
      options.startingPresidentIndex !== undefined
        ? ((options.startingPresidentIndex % playerCount) + playerCount) % playerCount
        : Math.floor(this.rng() * playerCount);

    this.bots.resetMemory();
    this.pendingPostClaimPower = 'NONE';
    const boardPowers = getBoardPowersForPlayerCount(playerCount);

    this.state = {
      phase: 'ELECTION_NOMINATION',
      round: 1,
      playerCount,
      players,
      presidentIndex: startIdx,
      presidentId: players[startIdx].id,
      specialElectionReturnIndex: null,
      isSpecialElectionRound: false,
      chancellorNomineeId: null,
      chancellorId: null,
      lastElectedPresidentId: null,
      lastElectedChancellorId: null,
      votes: {},
      lastElectionResult: null,
      electionTracker: 0,
      liberalPolicies: 0,
      fascistPolicies: 0,
      vetoUnlocked: false,
      vetoRejectedThisTurn: false,
      drawPile: this.buildInitialDeck(),
      discardPile: [],
      actualPresidentDrawn: [],
      presidentHand: [],
      chancellorHand: [],
      peekedCards: [],
      activeExecutivePower: 'NONE',
      boardPowers,
      investigatedPlayerIds: [],
      lastInvestigation: null,
      currentClaim: null,
      claimHistory: [],
      winner: null,
      winReason: null,
      logs: [],
    };

    const nightRuleNote =
      playerCount <= 6
        ? '5–6 kişilik mod: Faşist ve Hitler birbirini tanır.'
        : '7–10 kişilik mod: Faşistler Hitler’i görür, ancak Hitler takım arkadaşlarını bilmez!';

    this.appendLog(
      `${playerCount} kişilik oyun başladı! (${dist.liberals} Liberal, ${dist.fascists} Faşist, 1 Hitler) — ${nightRuleNote}`,
      'info'
    );
    this.appendLog(
      `Tur #1: Başkan ${players[startIdx].name} Şansölye adayını seçiyor.`,
      'election'
    );

    this.emitPhaseChange('SETUP', 'ELECTION_NOMINATION');
    this.emitStateChanged();
    return this.getState();
  }

  private buildInitialDeck(): Policy[] {
    const cards: Policy[] = [
      ...Array<Policy>(6).fill('LIBERAL'),
      ...Array<Policy>(11).fill('FASCIST'),
    ];
    return this.shuffle(cards);
  }

  private shuffle<T>(arr: readonly T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  getState(): GameState {
    return structuredClone(this.state);
  }

  /**
   * 5–6 kişilik ve 7–10 kişilik bilgi dağılımına birebir uyan gizli oyuncu görünümü.
   */
  getPlayerView(viewerId: string): PlayerView {
    const s = this.state;
    const viewer = s.players.find((p) => p.id === viewerId);
    if (!viewer) {
      throw new Error(`Oyuncu bulunamadı: ${viewerId}`);
    }

    const isGameOver = s.phase === 'GAME_OVER';
    const hitlerKnowsAllies = s.playerCount <= 6;

    let knownFascists: string[] = [];
    let knownHitlerId: string | null = null;

    if (isGameOver) {
      knownFascists = s.players.filter((p) => p.role === 'FASCIST').map((p) => p.id);
      knownHitlerId = s.players.find((p) => p.role === 'HITLER')?.id ?? null;
    } else if (viewer.role === 'FASCIST') {
      // Faşistler daima diğer Faşistleri ve Hitler'i bilir
      knownFascists = s.players.filter((p) => p.role === 'FASCIST').map((p) => p.id);
      knownHitlerId = s.players.find((p) => p.role === 'HITLER')?.id ?? null;
    } else if (viewer.role === 'HITLER') {
      knownHitlerId = viewer.id;
      if (hitlerKnowsAllies) {
        // 5-6 kişide Hitler kendi Faşistini görür; 7-10 kişide GÖREMEZ!
        knownFascists = s.players.filter((p) => p.role === 'FASCIST').map((p) => p.id);
      }
    }

    const players: PublicPlayer[] = s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      isHuman: p.isHuman,
      isAlive: p.isAlive,
      wasInvestigated: s.investigatedPlayerIds.includes(p.id),
      revealedRole: isGameOver || p.id === viewerId ? p.role : undefined,
    }));

    return {
      phase: s.phase,
      round: s.round,
      playerCount: s.playerCount,
      yourId: viewerId,
      yourRole: viewer.role,
      yourParty: viewer.partyMembership,
      knownFascists,
      knownHitlerId,
      hitlerKnowsAllies,
      players,
      presidentId: s.presidentId,
      isSpecialElectionRound: s.isSpecialElectionRound,
      chancellorNomineeId: s.chancellorNomineeId,
      chancellorId: s.chancellorId,
      votedPlayerIds: Object.keys(s.votes),
      revealedVotes:
        s.phase !== 'ELECTION_VOTING' && s.lastElectionResult
          ? { ...s.lastElectionResult.votes }
          : null,
      lastElectionResult: s.lastElectionResult
        ? structuredClone(s.lastElectionResult)
        : null,
      electionTracker: s.electionTracker,
      liberalPolicies: s.liberalPolicies,
      fascistPolicies: s.fascistPolicies,
      vetoUnlocked: s.vetoUnlocked,
      vetoRejectedThisTurn: s.vetoRejectedThisTurn,
      drawPileCount: s.drawPile.length,
      discardPileCount: s.discardPile.length,
      presidentHand:
        s.phase === 'LEGISLATIVE_PRESIDENT' && viewerId === s.presidentId
          ? [...s.presidentHand]
          : null,
      chancellorHand:
        (s.phase === 'LEGISLATIVE_CHANCELLOR' && viewerId === s.chancellorId) ||
        (s.phase === 'LEGISLATIVE_VETO_RESPONSE' &&
          (viewerId === s.chancellorId || viewerId === s.presidentId))
          ? [...s.chancellorHand]
          : null,
      peekedCards:
        s.phase === 'EXECUTIVE_PEEK' && viewerId === s.presidentId
          ? [...s.peekedCards]
          : null,
      activeExecutivePower: s.activeExecutivePower,
      boardPowers: [...s.boardPowers],
      lastInvestigation:
        s.lastInvestigation &&
        (s.lastInvestigation.investigatorId === viewerId || isGameOver)
          ? { ...s.lastInvestigation }
          : null,
      currentClaim: s.currentClaim ? structuredClone(s.currentClaim) : null,
      claimHistory: structuredClone(s.claimHistory),
      winner: s.winner,
      winReason: s.winReason,
      logs: [...s.logs],
    };
  }

  getAlivePlayers(): Player[] {
    return this.state.players.filter((p) => p.isAlive);
  }

  getCurrentPresident(): Player {
    const p = this.state.players[this.state.presidentIndex];
    if (!p) throw new Error('Aktif Başkan bulunamadı.');
    return p;
  }

  /** Hayatta >5 oyuncu varsa hem önceki Başkan hem önceki Şansölye engellenir; <=5 iken yalnız son Şansölye */
  getEligibleChancellorNominees(): Player[] {
    const s = this.state;
    const alive = this.getAlivePlayers();
    const excludePrevPresident = alive.length > 5;

    return alive.filter((p) => {
      if (p.id === s.presidentId) return false;
      if (s.lastElectedChancellorId && p.id === s.lastElectedChancellorId) return false;
      if (excludePrevPresident && s.lastElectedPresidentId && p.id === s.lastElectedPresidentId) {
        return false;
      }
      return true;
    });
  }

  getInvestigablePlayers(presidentId: string): Player[] {
    return this.getAlivePlayers().filter(
      (p) => p.id !== presidentId && !this.state.investigatedPlayerIds.includes(p.id)
    );
  }

  // =========================================================================
  // 1. SEÇİM AŞAMASI (NOMINATION & JA/NEIN VOTING)
  // =========================================================================

  nominateChancellor(presidentId: string, nomineeId: string): void {
    this.assertPhase('ELECTION_NOMINATION');
    if (this.state.presidentId !== presidentId) {
      throw new Error(`Yalnızca aktif Başkan (${this.state.presidentId}) aday gösterebilir.`);
    }

    const nominee = this.getEligibleChancellorNominees().find((p) => p.id === nomineeId);
    if (!nominee) {
      throw new Error(`Geçersiz veya dönem yasaklı Şansölye adayı: ${nomineeId}`);
    }

    const prevPhase = this.state.phase;
    this.state.chancellorNomineeId = nominee.id;
    this.state.votes = {};
    this.state.vetoRejectedThisTurn = false;
    this.state.phase = 'ELECTION_VOTING';

    this.appendLog(
      `Başkan ${this.getCurrentPresident().name}, ${nominee.name}'yi Şansölye adayı gösterdi. Oylama (Ja / Nein)!`,
      'election'
    );
    this.events.emit('ELECTION_NOMINATED', {
      presidentId,
      nomineeId: nominee.id,
      round: this.state.round,
    });
    this.emitPhaseChange(prevPhase, 'ELECTION_VOTING');
    this.emitStateChanged();
  }

  castVote(playerId: string, vote: Vote): void {
    this.assertPhase('ELECTION_VOTING');
    const voter = this.state.players.find((p) => p.id === playerId);
    if (!voter || !voter.isAlive) {
      throw new Error(`Yalnızca hayattaki oyuncular oy kullanabilir: ${playerId}`);
    }
    if (this.state.votes[playerId]) {
      throw new Error(`Oyuncu zaten oy kullandı: ${playerId}`);
    }

    this.state.votes[playerId] = vote;
    const alive = this.getAlivePlayers();
    this.events.emit('VOTE_CAST', {
      playerId,
      totalVotes: Object.keys(this.state.votes).length,
      requiredVotes: alive.length,
    });

    if (Object.keys(this.state.votes).length === alive.length) {
      this.resolveElection();
    } else {
      this.emitStateChanged();
    }
  }

  private resolveElection(): void {
    const s = this.state;
    const prevPhase = s.phase;
    const votesSnapshot = { ...s.votes };

    let jaCount = 0;
    let neinCount = 0;
    for (const v of Object.values(votesSnapshot)) {
      if (v === 'JA') jaCount++;
      else neinCount++;
    }

    const passed = jaCount > neinCount;
    const nomineeId = s.chancellorNomineeId!;
    const nominee = s.players.find((p) => p.id === nomineeId)!;

    if (!passed) {
      s.electionTracker++;
      const result: ElectionResult = {
        round: s.round,
        presidentId: s.presidentId,
        nomineeId,
        passed: false,
        jaCount,
        neinCount,
        votes: votesSnapshot,
        electionTracker: s.electionTracker,
        wasSpecialElection: s.isSpecialElectionRound,
      };
      s.lastElectionResult = result;
      s.chancellorNomineeId = null;

      this.appendLog(
        `Oylama REDDEDİLDİ (${jaCount} Ja / ${neinCount} Nein). Seçim Sayacı: ${s.electionTracker}/3.`,
        'election'
      );
      this.events.emit('ELECTION_RESOLVED', result);

      if (s.electionTracker >= 3) {
        this.triggerChaosPolicy();
        return;
      }

      this.advancePresidentTurn();
      s.round++;
      s.phase = 'ELECTION_NOMINATION';
      this.appendLog(
        `Tur #${s.round}: Yeni Başkan ${this.getCurrentPresident().name} aday seçiyor.`,
        'election'
      );
      this.emitPhaseChange(prevPhase, 'ELECTION_NOMINATION');
      this.emitStateChanged();
      return;
    }

    // Hükümet seçildi!
    s.electionTracker = 0;
    s.chancellorId = nomineeId;
    s.chancellorNomineeId = null;
    s.lastElectedPresidentId = s.presidentId;
    s.lastElectedChancellorId = nomineeId;

    const result: ElectionResult = {
      round: s.round,
      presidentId: s.presidentId,
      nomineeId,
      passed: true,
      jaCount,
      neinCount,
      votes: votesSnapshot,
      electionTracker: 0,
      wasSpecialElection: s.isSpecialElectionRound,
    };
    s.lastElectionResult = result;

    this.appendLog(
      `Hükümet KURULDU (${jaCount} Ja / ${neinCount} Nein): Başkan ${this.getCurrentPresident().name} & Şansölye ${nominee.name}.`,
      'election'
    );
    this.events.emit('ELECTION_RESOLVED', result);

    // Hitler kontrolü (3+ Faşist politika sonrası seçilen Şansölye Hitler ise Faşistler anında kazanır!)
    if (s.fascistPolicies >= 3 && nominee.role === 'HITLER') {
      this.finishGame(
        'FASCIST',
        'HITLER_CHANCELLOR',
        `3+ Faşist politika sonrası Hitler (${nominee.name}) Şansölye seçildi! Faşistler kazandı!`
      );
      return;
    }

    // Yasama Başlangıcı: Deste 3'ten azsa karıştır
    this.ensureDeckHasCards(3);
    const drawn = s.drawPile.splice(0, 3);
    s.actualPresidentDrawn = [...drawn];
    s.presidentHand = drawn;
    s.chancellorHand = [];
    s.phase = 'LEGISLATIVE_PRESIDENT';

    this.appendLog(
      `Başkan ${this.getCurrentPresident().name} kapalı desteden 3 Politika Kartı çekti (Kalan: ${s.drawPile.length}).`,
      'legislative'
    );
    this.events.emit('CARDS_DRAWN', {
      presidentId: s.presidentId,
      count: drawn.length,
      remainingDrawPile: s.drawPile.length,
    });
    this.emitPhaseChange(prevPhase, 'LEGISLATIVE_PRESIDENT');
    this.emitStateChanged();
  }

  private triggerChaosPolicy(): void {
    const s = this.state;
    const prevPhase = s.phase;
    this.ensureDeckHasCards(1);
    const topPolicy = s.drawPile.shift()!;
    s.electionTracker = 0;
    s.lastElectedPresidentId = null;
    s.lastElectedChancellorId = null;
    s.chancellorId = null;

    this.appendLog(
      `KAOS (3/3 Red)! Destedeki en üst politika (${topPolicy}) doğrudan yürürlüğe girdi ve dönem yasakları kalktı.`,
      'executive'
    );
    this.enactPolicyToBoard(topPolicy, true);

    if (s.phase !== 'GAME_OVER') {
      this.advancePresidentTurn();
      s.round++;
      s.phase = 'ELECTION_NOMINATION';
      this.emitPhaseChange(prevPhase, 'ELECTION_NOMINATION');
    }
    this.emitStateChanged();
  }

  // =========================================================================
  // 2. YASAMA & VETO AŞAMASI
  // =========================================================================

  discardPolicyByPresident(presidentId: string, cardIndex: number): void {
    this.assertPhase('LEGISLATIVE_PRESIDENT');
    const s = this.state;
    if (s.presidentId !== presidentId) {
      throw new Error(`Yalnızca aktif Başkan (${s.presidentId}) kart atabilir.`);
    }
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= s.presidentHand.length) {
      throw new Error(`Geçersiz kart indeksi: ${cardIndex}`);
    }

    const prevPhase = s.phase;
    const [discarded] = s.presidentHand.splice(cardIndex, 1);
    s.discardPile.push(discarded);
    s.chancellorHand = [...s.presidentHand];
    s.presidentHand = [];
    s.phase = 'LEGISLATIVE_CHANCELLOR';

    const chancellor = s.players.find((p) => p.id === s.chancellorId)!;
    this.appendLog(
      `Başkan ${this.getCurrentPresident().name} 1 kartı kapalı çöpe attı, 2 kartı Şansölye ${chancellor.name}'ye verdi.`,
      'legislative'
    );
    this.events.emit('POLICY_DISCARDED', {
      actorId: presidentId,
      by: 'PRESIDENT',
      discardPileCount: s.discardPile.length,
    });
    this.emitPhaseChange(prevPhase, 'LEGISLATIVE_CHANCELLOR');
    this.emitStateChanged();
  }

  enactPolicyByChancellor(chancellorId: string, cardIndex: number): void {
    this.assertPhase('LEGISLATIVE_CHANCELLOR');
    const s = this.state;
    if (s.chancellorId !== chancellorId) {
      throw new Error(`Yalnızca aktif Şansölye (${s.chancellorId}) politika geçirebilir.`);
    }
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= s.chancellorHand.length) {
      throw new Error(`Geçersiz kart indeksi: ${cardIndex}`);
    }

    const prevPhase = s.phase;
    const enacted = s.chancellorHand[cardIndex];
    const discarded = s.chancellorHand[1 - cardIndex];
    const receivedCopy = [...s.chancellorHand];

    s.discardPile.push(discarded);
    s.chancellorHand = [];

    this.events.emit('POLICY_DISCARDED', {
      actorId: chancellorId,
      by: 'CHANCELLOR',
      discardPileCount: s.discardPile.length,
    });

    this.enactPolicyToBoard(enacted, false);
    if (s.phase === 'GAME_OVER') {
      return;
    }

    const triggeredPower =
      enacted === 'FASCIST'
        ? this.getExecutivePowerForFascistCount(s.fascistPolicies)
        : 'NONE';

    if (this.enableClaimDebate) {
      // Beyan ve Tartışma fazı! Yetki varsa beyanlardan sonra tetiklenecek.
      this.pendingPostClaimPower = triggeredPower;
      // Geçici olarak receivedCopy'yi Claim hesaplamasına kadar sakla (presidentHand temiz)
      s.presidentHand = receivedCopy;
      s.currentClaim = {
        round: s.round,
        presidentId: s.presidentId,
        chancellorId: s.chancellorId!,
        enactedPolicy: enacted,
        wasVetoed: false,
        presidentDrawn: null,
        presidentPassed: null,
        chancellorReceived: null,
        presidentClaimed: false,
        chancellorClaimed: false,
        hasConflict: false,
        conflictSummary: '',
      };
      s.phase = 'CLAIM_DEBATE';
      this.appendLog(
        `Politika masaya kondu! Tartışma açıldı: Başkan ve Şansölye beyanlarını sunabilir.`,
        'claim'
      );
      this.emitPhaseChange(prevPhase, 'CLAIM_DEBATE');
      this.emitStateChanged();
      return;
    }

    this.enterExecutivePowerOrNextRound(prevPhase, triggeredPower);
  }

  /** Veto Yetkisi: 5. Faşist politika sonrasında Şansölye veto teklif eder */
  proposeVeto(chancellorId: string): void {
    this.assertPhase('LEGISLATIVE_CHANCELLOR');
    const s = this.state;
    if (!s.vetoUnlocked) {
      throw new Error('Veto yetkisi henüz açılmadı (5. Faşist politika gerekir).');
    }
    if (s.vetoRejectedThisTurn) {
      throw new Error('Başkan bu tur Vetoyu zaten reddetti; kart seçmek zorundasın.');
    }
    if (s.chancellorId !== chancellorId) {
      throw new Error('Yalnızca aktif Şansölye Veto teklif edebilir.');
    }

    const prevPhase = s.phase;
    s.phase = 'LEGISLATIVE_VETO_RESPONSE';
    const chanc = s.players.find((p) => p.id === chancellorId)!;
    this.appendLog(
      `⚖️ Şansölye ${chanc.name} elindeki kartları VETO etmek istedi! Başkan kararı bekleniyor.`,
      'legislative'
    );
    this.events.emit('VETO_PROPOSED', {
      chancellorId,
      presidentId: s.presidentId,
    });
    this.emitPhaseChange(prevPhase, 'LEGISLATIVE_VETO_RESPONSE');
    this.emitStateChanged();
  }

  /** Veto yanıtı: Kabul edilirse 2 kart da çöpe atılır ve seçim sayacı +1 ilerler */
  respondToVeto(presidentId: string, accept: boolean): void {
    this.assertPhase('LEGISLATIVE_VETO_RESPONSE');
    const s = this.state;
    if (s.presidentId !== presidentId) {
      throw new Error('Yalnızca aktif Başkan Vetoyu yanıtlayabilir.');
    }

    const prevPhase = s.phase;
    if (!accept) {
      s.vetoRejectedThisTurn = true;
      s.phase = 'LEGISLATIVE_CHANCELLOR';
      this.appendLog(
        `Başkan ${this.getCurrentPresident().name} Vetoyu REDDETTİ! Şansölye 2 karttan 1'ini geçirmek zorunda.`,
        'legislative'
      );
      this.events.emit('VETO_RESOLVED', {
        accepted: false,
        electionTracker: s.electionTracker,
      });
      this.emitPhaseChange(prevPhase, 'LEGISLATIVE_CHANCELLOR');
      this.emitStateChanged();
      return;
    }

    // Veto KABUL EDİLDİ! İki kart da çöpe atılır, sayaç 1 ilerler
    s.discardPile.push(...s.chancellorHand);
    s.chancellorHand = [];
    s.electionTracker++;
    this.appendLog(
      `⚖️ Başkan Vetoyu KABUL ETTİ! Her iki kart da çöpe atıldı. Seçim Sayacı: ${s.electionTracker}/3.`,
      'legislative'
    );
    this.events.emit('VETO_RESOLVED', {
      accepted: true,
      electionTracker: s.electionTracker,
    });

    if (s.electionTracker >= 3) {
      this.triggerChaosPolicy();
      return;
    }

    this.advanceToNextRound(prevPhase);
  }

  // =========================================================================
  // 3. KART SONRASI BEYAN & ÇELİŞKİ TARTIŞMASI (CLAIM_DEBATE)
  // =========================================================================

  submitPresidentClaim(presidentId: string, drawn: Policy[], passed: Policy[]): void {
    this.assertPhase('CLAIM_DEBATE');
    const s = this.state;
    if (!s.currentClaim || s.currentClaim.presidentId !== presidentId) {
      throw new Error('Yalnızca bu turun Başkanı beyanda bulunabilir.');
    }

    s.currentClaim.presidentDrawn = [...drawn];
    s.currentClaim.presidentPassed = [...passed];
    s.currentClaim.presidentClaimed = true;

    this.appendLog(
      `${this.getCurrentPresident().name} (Başkan): "Desteden ${this.formatHand(drawn)} çektim, Şansölyeye ${this.formatHand(passed)} verdim."`,
      'claim'
    );

    this.evaluateClaimConflict();
    this.emitStateChanged();
  }

  submitChancellorClaim(chancellorId: string, received: Policy[]): void {
    this.assertPhase('CLAIM_DEBATE');
    const s = this.state;
    if (!s.currentClaim || s.currentClaim.chancellorId !== chancellorId) {
      throw new Error('Yalnızca bu turun Şansölyesi beyanda bulunabilir.');
    }

    s.currentClaim.chancellorReceived = [...received];
    s.currentClaim.chancellorClaimed = true;

    const chanc = s.players.find((p) => p.id === chancellorId)!;
    this.appendLog(
      `${chanc.name} (Şansölye): "Bana ${this.formatHand(received)} geldi."`,
      'claim'
    );

    this.evaluateClaimConflict();
    this.emitStateChanged();
  }

  private evaluateClaimConflict(): void {
    const s = this.state;
    const c = s.currentClaim;
    if (!c || !c.presidentClaimed || !c.chancellorClaimed) {
      if (c?.presidentClaimed) {
        this.events.emit('CLAIM_SUBMITTED', {
          actorId: c.presidentId,
          role: 'PRESIDENT',
          hasConflict: false,
        });
      }
      return;
    }

    const pLib = (c.presidentPassed ?? []).filter((x) => x === 'LIBERAL').length;
    const cLib = (c.chancellorReceived ?? []).filter((x) => x === 'LIBERAL').length;

    if (pLib !== cLib) {
      c.hasConflict = true;
      c.conflictSummary = `ÇELİŞKİ! Başkan ${pLib} Liberal verdiğini, Şansölye ise ${cLib} Liberal aldığını iddia ediyor!`;
      this.appendLog(`⚡ ${c.conflictSummary}`, 'claim');
    } else {
      c.hasConflict = false;
      c.conflictSummary = 'Başkan ve Şansölye beyanları birbiriyle örtüşüyor.';
      this.appendLog(`✓ ${c.conflictSummary}`, 'claim');
    }

    s.claimHistory.push(structuredClone(c));
    this.bots.observeClaimOutcome(c);
    this.events.emit('CLAIM_SUBMITTED', {
      actorId: c.chancellorId,
      role: 'CHANCELLOR',
      hasConflict: c.hasConflict,
    });
  }

  finishClaimDebate(): void {
    this.assertPhase('CLAIM_DEBATE');
    const prevPhase = this.state.phase;
    this.state.presidentHand = [];
    const power = this.pendingPostClaimPower;
    this.pendingPostClaimPower = 'NONE';
    this.enterExecutivePowerOrNextRound(prevPhase, power);
  }

  // =========================================================================
  // 4. YÜRÜTME AŞAMASI (INVESTIGATE, SPECIAL_ELECTION, PEEK, EXECUTION)
  // =========================================================================

  private enterExecutivePowerOrNextRound(
    prevPhase: GamePhase,
    power: ExecutivePower
  ): void {
    const s = this.state;
    if (power === 'INVESTIGATE') {
      const candidates = this.getInvestigablePlayers(s.presidentId);
      if (candidates.length > 0) {
        s.activeExecutivePower = 'INVESTIGATE';
        s.phase = 'EXECUTIVE_INVESTIGATE';
        this.appendLog(
          `🔍 Bağlılık Soruşturması: Başkan ${this.getCurrentPresident().name} bir oyuncunun Parti Üyeliği kartına bakıyor.`,
          'executive'
        );
        this.events.emit('EXECUTIVE_POWER_TRIGGERED', {
          power: 'INVESTIGATE',
          presidentId: s.presidentId,
        });
        this.emitPhaseChange(prevPhase, 'EXECUTIVE_INVESTIGATE');
        this.emitStateChanged();
        return;
      }
    }

    if (power === 'SPECIAL_ELECTION') {
      s.activeExecutivePower = 'SPECIAL_ELECTION';
      s.phase = 'EXECUTIVE_SPECIAL_ELECTION';
      this.appendLog(
        `🗳️ Özel Seçim Yetkisi: Başkan ${this.getCurrentPresident().name} sıradaki Başkan adayını bizzat seçiyor!`,
        'executive'
      );
      this.events.emit('EXECUTIVE_POWER_TRIGGERED', {
        power: 'SPECIAL_ELECTION',
        presidentId: s.presidentId,
      });
      this.emitPhaseChange(prevPhase, 'EXECUTIVE_SPECIAL_ELECTION');
      this.emitStateChanged();
      return;
    }

    if (power === 'POLICY_PEEK') {
      this.ensureDeckHasCards(3);
      s.peekedCards = s.drawPile.slice(0, 3);
      s.activeExecutivePower = 'POLICY_PEEK';
      s.phase = 'EXECUTIVE_PEEK';
      this.appendLog(
        `👁️ Kart İnceleme (Policy Peek): Başkan ${this.getCurrentPresident().name} destenin üstündeki 3 kartı inceliyor.`,
        'executive'
      );
      this.events.emit('EXECUTIVE_POWER_TRIGGERED', {
        power: 'POLICY_PEEK',
        presidentId: s.presidentId,
      });
      this.events.emit('POLICY_PEEKED', {
        presidentId: s.presidentId,
        cards: [...s.peekedCards],
      });
      this.emitPhaseChange(prevPhase, 'EXECUTIVE_PEEK');
      this.emitStateChanged();
      return;
    }

    if (power === 'EXECUTION') {
      s.activeExecutivePower = 'EXECUTION';
      s.phase = 'EXECUTIVE_EXECUTION';
      this.appendLog(
        `💀 İdam Yetkisi: Başkan ${this.getCurrentPresident().name} masadan bir oyuncuyu idam etmek zorunda!`,
        'executive'
      );
      this.events.emit('EXECUTIVE_POWER_TRIGGERED', {
        power: 'EXECUTION',
        presidentId: s.presidentId,
      });
      this.emitPhaseChange(prevPhase, 'EXECUTIVE_EXECUTION');
      this.emitStateChanged();
      return;
    }

    this.advanceToNextRound(prevPhase);
  }

  /** Bağlılık Soruşturması: Hedefin Parti Üyeliğini ('LIBERAL' | 'FASCIST') görür (Hitler de 'FASCIST' görünür) */
  investigateLoyalty(presidentId: string, targetId: string): PartyMembership {
    this.assertPhase('EXECUTIVE_INVESTIGATE');
    const s = this.state;
    if (s.presidentId !== presidentId) {
      throw new Error('Yalnızca aktif Başkan soruşturma yapabilir.');
    }
    const target = this.getInvestigablePlayers(presidentId).find((p) => p.id === targetId);
    if (!target) {
      throw new Error(`Geçersiz veya daha önce soruşturulmuş oyuncu: ${targetId}`);
    }

    const prevPhase = s.phase;
    s.investigatedPlayerIds.push(target.id);
    s.lastInvestigation = {
      round: s.round,
      investigatorId: presidentId,
      targetId: target.id,
      partyMembership: target.partyMembership,
    };
    s.activeExecutivePower = 'NONE';
    this.bots.observeInvestigation(presidentId, target.id, target.partyMembership);

    this.appendLog(
      `🔍 Başkan ${this.getCurrentPresident().name}, ${target.name} oyuncusunun Parti Üyeliği kartını gizlice inceledi.`,
      'executive'
    );
    this.events.emit('LOYALTY_INVESTIGATED', {
      presidentId,
      targetId: target.id,
      party: target.partyMembership,
    });

    this.advanceToNextRound(prevPhase);
    return target.partyMembership;
  }

  /** Özel Seçim: Başkan sonraki turun Başkanını seçer; sonraki tur eski saat yönü sıradan devam eder */
  callSpecialElection(presidentId: string, chosenPresidentId: string): void {
    this.assertPhase('EXECUTIVE_SPECIAL_ELECTION');
    const s = this.state;
    if (s.presidentId !== presidentId) {
      throw new Error('Yalnızca aktif Başkan Özel Seçim yapabilir.');
    }
    const chosen = s.players.find(
      (p) => p.id === chosenPresidentId && p.isAlive && p.id !== presidentId
    );
    if (!chosen) {
      throw new Error(`Özel seçim için geçersiz aday: ${chosenPresidentId}`);
    }

    const prevPhase = s.phase;
    // Normal sıradaki bir sonraki Başkan indeksini kaydet (zaten özel seçim turunda değilsek!)
    if (s.specialElectionReturnIndex === null) {
      s.specialElectionReturnIndex = (s.presidentIndex + 1) % s.players.length;
    }

    s.presidentIndex = chosen.seatIndex;
    s.presidentId = chosen.id;
    s.isSpecialElectionRound = true;
    s.chancellorId = null;
    s.chancellorNomineeId = null;
    s.activeExecutivePower = 'NONE';
    s.round++;
    s.phase = 'ELECTION_NOMINATION';

    this.appendLog(
      `🗳️ ÖZEL SEÇİM! Yeni Başkan olarak ${chosen.name} atandı (Tur #${s.round}).`,
      'executive'
    );
    this.events.emit('SPECIAL_ELECTION_CALLED', {
      byPresidentId: presidentId,
      chosenPresidentId: chosen.id,
    });
    this.emitPhaseChange(prevPhase, 'ELECTION_NOMINATION');
    this.emitStateChanged();
  }

  completePolicyPeek(presidentId: string): void {
    this.assertPhase('EXECUTIVE_PEEK');
    if (this.state.presidentId !== presidentId) {
      throw new Error(`Yalnızca aktif Başkan (${this.state.presidentId}) incelemeyi bitirebilir.`);
    }
    const prevPhase = this.state.phase;
    this.state.peekedCards = [];
    this.state.activeExecutivePower = 'NONE';
    this.appendLog(
      `Başkan ${this.getCurrentPresident().name} destedeki 3 kartı inceledi ve sırayla geri koydu.`,
      'executive'
    );
    this.advanceToNextRound(prevPhase);
  }

  executePlayer(presidentId: string, targetId: string): void {
    this.assertPhase('EXECUTIVE_EXECUTION');
    const s = this.state;
    if (s.presidentId !== presidentId) {
      throw new Error(`Yalnızca aktif Başkan (${s.presidentId}) idam kararı verebilir.`);
    }

    const target = s.players.find((p) => p.id === targetId);
    if (!target || !target.isAlive || target.id === presidentId) {
      throw new Error(`Geçersiz idam hedefi: ${targetId}`);
    }

    const prevPhase = s.phase;
    target.isAlive = false;
    s.activeExecutivePower = 'NONE';
    const wasHitler = target.role === 'HITLER';

    this.appendLog(
      `💀 İDAM! Başkan ${this.getCurrentPresident().name}, ${target.name} oyuncusunu masadan kaldırdı! (Rolü açıklanmaz.)`,
      'executive'
    );
    this.events.emit('PLAYER_EXECUTED', {
      presidentId,
      targetId: target.id,
      wasHitler,
    });

    if (wasHitler) {
      this.finishGame(
        'LIBERAL',
        'HITLER_EXECUTED',
        `İdam edilen kişi Hitler (${target.name}) çıktı! Liberaller anında kazandı!`
      );
      return;
    }

    this.appendLog(`${target.name} Hitler değildi. Oyun devam ediyor.`, 'info');
    this.advanceToNextRound(prevPhase);
  }

  private enactPolicyToBoard(policy: Policy, viaChaos: boolean): void {
    const s = this.state;
    if (policy === 'LIBERAL') {
      s.liberalPolicies++;
    } else {
      s.fascistPolicies++;
      if (s.fascistPolicies >= 5) {
        s.vetoUnlocked = true;
      }
    }

    this.appendLog(
      `${policy === 'LIBERAL' ? '🔵 LİBERAL' : '🔴 FAŞİST'} politika yerleşti! Skor — Liberal: ${s.liberalPolicies}/5, Faşist: ${s.fascistPolicies}/6`,
      'legislative'
    );
    this.events.emit('POLICY_ENACTED', {
      policy,
      liberalPolicies: s.liberalPolicies,
      fascistPolicies: s.fascistPolicies,
      viaChaos,
    });

    if (s.liberalPolicies >= 5) {
      this.finishGame(
        'LIBERAL',
        'LIBERAL_POLICIES',
        'Liberal panosuna 5. Liberal Politika yerleştirildi! Liberaller kazandı!'
      );
      return;
    }

    if (s.fascistPolicies >= 6) {
      this.finishGame(
        'FASCIST',
        'FASCIST_POLICIES',
        'Faşist panosuna 6. Faşist Politika yerleştirildi! Faşistler kazandı!'
      );
    }
  }

  getExecutivePowerForFascistCount(count: number): ExecutivePower {
    if (count < 1 || count > 5) return 'NONE';
    return this.state.boardPowers[count - 1] ?? 'NONE';
  }

  private advanceToNextRound(prevPhase: GamePhase): void {
    const s = this.state;
    s.chancellorId = null;
    s.chancellorNomineeId = null;
    this.advancePresidentTurn();
    s.round++;
    s.phase = 'ELECTION_NOMINATION';

    this.appendLog(
      `Tur #${s.round}: Yeni Başkan ${this.getCurrentPresident().name} Şansölye adayını seçiyor.`,
      'election'
    );
    this.emitPhaseChange(prevPhase, 'ELECTION_NOMINATION');
    this.emitStateChanged();
  }

  /** Saat yönünde sıradaki hayatta olan Başkana geçer; Özel Seçim sonrası eski sıraya döner */
  private advancePresidentTurn(): void {
    const s = this.state;
    const count = s.players.length;

    let startScanIdx: number;
    if (s.specialElectionReturnIndex !== null) {
      startScanIdx = s.specialElectionReturnIndex;
      s.specialElectionReturnIndex = null;
    } else {
      startScanIdx = (s.presidentIndex + 1) % count;
    }
    s.isSpecialElectionRound = false;

    for (let offset = 0; offset < count; offset++) {
      const idx = (startScanIdx + offset) % count;
      if (s.players[idx].isAlive) {
        s.presidentIndex = idx;
        s.presidentId = s.players[idx].id;
        return;
      }
    }
  }

  private ensureDeckHasCards(required: number): void {
    const s = this.state;
    if (s.drawPile.length >= required) return;

    if (s.discardPile.length === 0) {
      throw new Error('Destede ve çöpte yeterli kart kalmadı.');
    }

    s.drawPile = this.shuffle([...s.drawPile, ...s.discardPile]);
    s.discardPile = [];
    this.appendLog(
      `Destede ${required}'ten az kart kaldığı için çöp destesi karıştırılıp yeni deste oluşturuldu (Deste: ${s.drawPile.length}).`,
      'info'
    );
  }

  private finishGame(winner: Faction, reason: WinReason, message: string): void {
    const prevPhase = this.state.phase;
    this.state.winner = winner;
    this.state.winReason = reason;
    this.state.phase = 'GAME_OVER';
    this.appendLog(message, 'victory');
    this.events.emit('GAME_OVER', { winner, reason });
    this.emitPhaseChange(prevPhase, 'GAME_OVER');
    this.emitStateChanged();
  }

  // =========================================================================
  // OFFLİNE BOT ADIMLAYICISI
  // =========================================================================

  stepBots(): boolean {
    const s = this.state;
    switch (s.phase) {
      case 'ELECTION_NOMINATION': {
        const president = this.getCurrentPresident();
        if (president.isHuman) return false;
        const pick = this.bots.chooseChancellorNominee(
          president,
          this.getEligibleChancellorNominees(),
          s
        );
        this.nominateChancellor(president.id, pick);
        return true;
      }

      case 'ELECTION_VOTING': {
        const pendingBots = this.getAlivePlayers().filter(
          (p) => !p.isHuman && !s.votes[p.id]
        );
        if (pendingBots.length === 0) return false;
        for (const bot of pendingBots) {
          if (this.state.phase !== 'ELECTION_VOTING') break;
          const vote = this.bots.chooseVote(bot, this.state);
          this.castVote(bot.id, vote);
        }
        return true;
      }

      case 'LEGISLATIVE_PRESIDENT': {
        const president = this.getCurrentPresident();
        if (president.isHuman) return false;
        const discardIdx = this.bots.choosePresidentDiscardIndex(
          president,
          s.presidentHand,
          s
        );
        this.discardPolicyByPresident(president.id, discardIdx);
        return true;
      }

      case 'LEGISLATIVE_CHANCELLOR': {
        const chancellor = s.players.find((p) => p.id === s.chancellorId);
        if (!chancellor || chancellor.isHuman) return false;
        if (this.bots.shouldChancellorProposeVeto(chancellor, s.chancellorHand, s)) {
          this.proposeVeto(chancellor.id);
          return true;
        }
        const enactIdx = this.bots.chooseChancellorEnactIndex(
          chancellor,
          s.chancellorHand,
          s
        );
        this.enactPolicyByChancellor(chancellor.id, enactIdx);
        return true;
      }

      case 'LEGISLATIVE_VETO_RESPONSE': {
        const president = this.getCurrentPresident();
        if (president.isHuman) return false;
        const accept = this.bots.shouldPresidentAcceptVeto(president, s.chancellorHand, s);
        this.respondToVeto(president.id, accept);
        return true;
      }

      case 'CLAIM_DEBATE': {
        const claim = s.currentClaim;
        if (!claim) return false;
        const pres = s.players.find((p) => p.id === claim.presidentId)!;
        const chanc = s.players.find((p) => p.id === claim.chancellorId)!;
        let acted = false;

        if (!claim.presidentClaimed && !pres.isHuman) {
          const { drawn, passed } = this.bots.choosePresidentClaim(
            pres,
            s.actualPresidentDrawn,
            s.presidentHand, // receivedCopy saklandı
            claim.enactedPolicy
          );
          this.submitPresidentClaim(pres.id, drawn, passed);
          acted = true;
        }
        if (
          this.state.currentClaim &&
          !this.state.currentClaim.chancellorClaimed &&
          !chanc.isHuman
        ) {
          const rec = this.bots.chooseChancellorClaim(
            chanc,
            this.state.presidentHand,
            this.state.currentClaim.enactedPolicy
          );
          this.submitChancellorClaim(chanc.id, rec);
          acted = true;
        }
        if (
          this.state.phase === 'CLAIM_DEBATE' &&
          this.state.currentClaim?.presidentClaimed &&
          this.state.currentClaim?.chancellorClaimed &&
          acted
        ) {
          return true;
        }
        if (
          this.state.phase === 'CLAIM_DEBATE' &&
          this.state.currentClaim?.presidentClaimed &&
          this.state.currentClaim?.chancellorClaimed &&
          !pres.isHuman &&
          !chanc.isHuman
        ) {
          this.finishClaimDebate();
          return true;
        }
        return acted;
      }

      case 'EXECUTIVE_INVESTIGATE': {
        const president = this.getCurrentPresident();
        if (president.isHuman) return false;
        const targetId = this.bots.chooseInvestigateTarget(
          president,
          this.getInvestigablePlayers(president.id)
        );
        this.investigateLoyalty(president.id, targetId);
        return true;
      }

      case 'EXECUTIVE_SPECIAL_ELECTION': {
        const president = this.getCurrentPresident();
        if (president.isHuman) return false;
        const chosenId = this.bots.chooseSpecialElectionTarget(
          president,
          this.getAlivePlayers()
        );
        this.callSpecialElection(president.id, chosenId);
        return true;
      }

      case 'EXECUTIVE_PEEK': {
        const president = this.getCurrentPresident();
        if (president.isHuman) return false;
        this.completePolicyPeek(president.id);
        return true;
      }

      case 'EXECUTIVE_EXECUTION': {
        const president = this.getCurrentPresident();
        if (president.isHuman) return false;
        const targetId = this.bots.chooseExecutionTarget(president, this.getAlivePlayers());
        this.executePlayer(president.id, targetId);
        return true;
      }

      default:
        return false;
    }
  }

  private formatHand(cards: Policy[]): string {
    const lib = cards.filter((c) => c === 'LIBERAL').length;
    const fasc = cards.length - lib;
    return `${lib} Liberal, ${fasc} Faşist`;
  }

  private assertPhase(expected: GamePhase): void {
    if (this.state.phase !== expected) {
      throw new Error(
        `Geçersiz işlem: Beklenen faz '${expected}', mevcut faz '${this.state.phase}'.`
      );
    }
  }

  private appendLog(message: string, category: LogEntry['category']): void {
    const entry: LogEntry = {
      round: this.state.round,
      phase: this.state.phase,
      message,
      category,
    };
    this.state.logs.push(entry);
    this.events.emit('LOG', entry);
  }

  private emitPhaseChange(prevPhase: GamePhase, phase: GamePhase): void {
    this.events.emit('PHASE_CHANGED', {
      prevPhase,
      phase,
      round: this.state.round,
    });
  }

  private emitStateChanged(): void {
    this.events.emit('STATE_CHANGED', this.getState());
  }
}
