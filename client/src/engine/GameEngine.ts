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
  Player,
  PlayerView,
  Policy,
  PublicPlayer,
  Role,
  Vote,
  WinReason,
} from './types.ts';

export interface GameEngineOptions {
  /** Tekrarlanabilir testler için özel PRNG fonksiyonu (varsayılan Math.random) */
  rng?: () => number;
  /** İnsan oyuncunun adı */
  humanName?: string;
  /** Başlangıç Başkan indeksi (belirtilmezse rastgele seçilir) */
  startingPresidentIndex?: number;
  /** Özel bot isimleri */
  botNames?: string[];
  /** Otomatik oyun kurulumu yapılsın mı (varsayılan true) */
  autoStart?: boolean;
}

const DEFAULT_BOT_NAMES = ['Ajan Kaya', 'Mühendis Ece', 'Analist Can', 'Operatör Deniz'];

/**
 * Saf, arayüzden tamamen bağımsız (Headless) 5-Kişilik Secret Hitler Kural Motoru.
 * Görsel/Three.js/DOM kodu içermez; durum değişikliklerini EventEmitter üzerinden yayar.
 */
export class GameEngine {
  public readonly events = new EventEmitter<EngineEventMap>();
  private readonly rng: () => number;
  private readonly bots: BotController;
  private state: GameState;

  constructor(options: GameEngineOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.bots = new BotController(this.rng);
    this.state = this.createEmptyState();

    if (options.autoStart !== false) {
      this.startNewGame(options);
    }
  }

  private createEmptyState(): GameState {
    return {
      phase: 'SETUP',
      round: 0,
      players: [],
      presidentIndex: 0,
      presidentId: '',
      chancellorNomineeId: null,
      chancellorId: null,
      lastElectedPresidentId: null,
      lastElectedChancellorId: null,
      votes: {},
      lastElectionResult: null,
      electionTracker: 0,
      liberalPolicies: 0,
      fascistPolicies: 0,
      drawPile: [],
      discardPile: [],
      presidentHand: [],
      chancellorHand: [],
      peekedCards: [],
      activeExecutivePower: 'NONE',
      winner: null,
      winReason: null,
      logs: [],
    };
  }

  /**
   * 5 kişilik oyunu başlatır: 3 Liberal, 1 Faşist, 1 Hitler + 17 kartlık politika destesi (6 Liberal, 11 Faşist).
   */
  startNewGame(options: GameEngineOptions = {}): GameState {
    const humanName = options.humanName?.trim() || 'Sen';
    const botNames = options.botNames ?? DEFAULT_BOT_NAMES;

    const roles: Role[] = this.shuffle([
      'LIBERAL',
      'LIBERAL',
      'LIBERAL',
      'FASCIST',
      'HITLER',
    ]);

    const players: Player[] = [
      {
        id: 'human',
        name: humanName,
        seatIndex: 0,
        isHuman: true,
        isAlive: true,
        role: roles[0],
      },
      ...botNames.slice(0, 4).map((name, idx) => ({
        id: `bot-${idx + 1}`,
        name,
        seatIndex: idx + 1,
        isHuman: false,
        isAlive: true,
        role: roles[idx + 1],
      })),
    ];

    const startIdx =
      options.startingPresidentIndex !== undefined
        ? ((options.startingPresidentIndex % 5) + 5) % 5
        : Math.floor(this.rng() * 5);

    const drawPile = this.buildInitialDeck();

    this.state = {
      phase: 'ELECTION_NOMINATION',
      round: 1,
      players,
      presidentIndex: startIdx,
      presidentId: players[startIdx].id,
      chancellorNomineeId: null,
      chancellorId: null,
      lastElectedPresidentId: null,
      lastElectedChancellorId: null,
      votes: {},
      lastElectionResult: null,
      electionTracker: 0,
      liberalPolicies: 0,
      fascistPolicies: 0,
      drawPile,
      discardPile: [],
      presidentHand: [],
      chancellorHand: [],
      peekedCards: [],
      activeExecutivePower: 'NONE',
      winner: null,
      winReason: null,
      logs: [],
    };

    this.appendLog(
      `Oyun başladı! 5 oyuncu (3 Liberal, 1 Faşist, 1 Hitler) ve 17 kartlı deste (6 Liberal, 11 Faşist) hazır.`,
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

  /** Test ve hata ayıklama için mevcut tam state kopyasını döner. */
  getState(): GameState {
    return structuredClone(this.state);
  }

  /** Bir oyuncunun UI/Renderer'da görebileceği rol ve el bilgisini gizlilik sınırlarıyla üretir. */
  getPlayerView(viewerId: string): PlayerView {
    const s = this.state;
    const viewer = s.players.find((p) => p.id === viewerId);
    if (!viewer) {
      throw new Error(`Oyuncu bulunamadı: ${viewerId}`);
    }

    const isGameOver = s.phase === 'GAME_OVER';
    const canSeeSecretTeam = viewer.role === 'FASCIST' || viewer.role === 'HITLER';

    const knownFascists =
      canSeeSecretTeam || isGameOver
        ? s.players.filter((p) => p.role === 'FASCIST').map((p) => p.id)
        : [];
    const hitlerPlayer = s.players.find((p) => p.role === 'HITLER') ?? null;
    const knownHitlerId =
      (canSeeSecretTeam || isGameOver) && hitlerPlayer ? hitlerPlayer.id : null;

    const players: PublicPlayer[] = s.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      isHuman: p.isHuman,
      isAlive: p.isAlive,
      revealedRole: isGameOver || p.id === viewerId ? p.role : undefined,
    }));

    return {
      phase: s.phase,
      round: s.round,
      yourId: viewerId,
      yourRole: viewer.role,
      knownFascists,
      knownHitlerId,
      players,
      presidentId: s.presidentId,
      chancellorNomineeId: s.chancellorNomineeId,
      chancellorId: s.chancellorId,
      votedPlayerIds: Object.keys(s.votes),
      revealedVotes: s.phase !== 'ELECTION_VOTING' && s.lastElectionResult ? { ...s.lastElectionResult.votes } : null,
      lastElectionResult: s.lastElectionResult ? structuredClone(s.lastElectionResult) : null,
      electionTracker: s.electionTracker,
      liberalPolicies: s.liberalPolicies,
      fascistPolicies: s.fascistPolicies,
      drawPileCount: s.drawPile.length,
      discardPileCount: s.discardPile.length,
      presidentHand:
        s.phase === 'LEGISLATIVE_PRESIDENT' && viewerId === s.presidentId
          ? [...s.presidentHand]
          : null,
      chancellorHand:
        s.phase === 'LEGISLATIVE_CHANCELLOR' && viewerId === s.chancellorId
          ? [...s.chancellorHand]
          : null,
      peekedCards:
        s.phase === 'EXECUTIVE_PEEK' && viewerId === s.presidentId
          ? [...s.peekedCards]
          : null,
      activeExecutivePower: s.activeExecutivePower,
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

  /**
   * Secret Hitler term-limit kurallarına göre aday gösterilebilecek Şansölye adayları:
   * - Hayatta olmalı
   * - Başkanın kendisi olamaz
   * - Önceki seçilmiş Şansölye olamaz
   * - Eğer hayatta > 5 oyuncu varsa, önceki seçilmiş Başkan da olamaz (5 kişide yalnızca son Şansölye kuralı uygulanır)
   */
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

  // =========================================================================
  // DURUM MAKİNESİ GEÇİŞLERİ (STATE MACHINE TRANSITIONS)
  // =========================================================================

  /** 1. ADIM: Başkan Şansölye adayını belirler */
  nominateChancellor(presidentId: string, nomineeId: string): void {
    this.assertPhase('ELECTION_NOMINATION');
    if (this.state.presidentId !== presidentId) {
      throw new Error(`Yalnızca aktif Başkan (${this.state.presidentId}) aday gösterebilir.`);
    }

    const eligible = this.getEligibleChancellorNominees();
    const nominee = eligible.find((p) => p.id === nomineeId);
    if (!nominee) {
      throw new Error(`Geçersiz veya dönem sınırı engelli Şansölye adayı: ${nomineeId}`);
    }

    const prevPhase = this.state.phase;
    this.state.chancellorNomineeId = nominee.id;
    this.state.votes = {};
    this.state.phase = 'ELECTION_VOTING';

    this.appendLog(
      `Başkan ${this.getCurrentPresident().name}, ${nominee.name}'yi Şansölye adayı gösterdi. Oylama (Ja/Nein) başladı.`,
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

  /** 2. ADIM: Hayattaki oyuncular JA veya NEIN oyu kullanır */
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
      };
      s.lastElectionResult = result;
      s.chancellorNomineeId = null;

      this.appendLog(
        `Oylama REDDEDİLDİ (${jaCount} Ja / ${neinCount} Nein). Kaos sayacı: ${s.electionTracker}/3.`,
        'election'
      );
      this.events.emit('ELECTION_RESOLVED', result);

      if (s.electionTracker >= 3) {
        this.triggerChaosPolicy();
        return;
      }

      this.rotatePresidentClockwise();
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

    // OYLAMA KABUL EDİLDİ!
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
    };
    s.lastElectionResult = result;

    this.appendLog(
      `Oylama KABUL EDİLDİ (${jaCount} Ja / ${neinCount} Nein)! Hükümet: Başkan ${this.getCurrentPresident().name} & Şansölye ${nominee.name}.`,
      'election'
    );
    this.events.emit('ELECTION_RESOLVED', result);

    // Hitler'in Şansölye seçilmesiyle Faşist zaferi kontrolü (3+ Faşist politika sonrasında)
    if (s.fascistPolicies >= 3 && nominee.role === 'HITLER') {
      this.finishGame(
        'FASCIST',
        'HITLER_CHANCELLOR',
        `3+ Faşist politika sonrası Hitler (${nominee.name}) Şansölye seçildi! Faşistler kazandı!`
      );
      return;
    }

    // Yasama Aşamasına geç: Deste 3'ten azsa karıştır ve 3 kart çek
    this.ensureDeckHasCards(3);
    const drawn = s.drawPile.splice(0, 3);
    s.presidentHand = drawn;
    s.chancellorHand = [];
    s.phase = 'LEGISLATIVE_PRESIDENT';

    this.appendLog(
      `Başkan ${this.getCurrentPresident().name} desteden 3 politika kartı çekti (Destede kalan: ${s.drawPile.length}).`,
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
    // Kaos sonrası dönem limitleri sıfırlanır (resmi Secret Hitler kuralı)
    s.lastElectedPresidentId = null;
    s.lastElectedChancellorId = null;
    s.chancellorId = null;

    this.appendLog(
      `KAOS (3/3 Red)! Destedeki en üst kart (${topPolicy}) doğrudan yürürlüğe girdi ve dönem sınırları sıfırlandı.`,
      'executive'
    );
    this.enactPolicyToBoard(topPolicy, true);

    if (s.phase !== 'GAME_OVER') {
      this.rotatePresidentClockwise();
      s.round++;
      s.phase = 'ELECTION_NOMINATION';
      this.emitPhaseChange(prevPhase, 'ELECTION_NOMINATION');
    }
    this.emitStateChanged();
  }

  /** 3. ADIM: Başkan 3 karttan 1'ini discard eder, kalan 2'sini Şansölyeye verir */
  discardPolicyByPresident(presidentId: string, cardIndex: number): void {
    this.assertPhase('LEGISLATIVE_PRESIDENT');
    const s = this.state;
    if (s.presidentId !== presidentId) {
      throw new Error(`Yalnızca aktif Başkan (${s.presidentId}) kart eleyebilir.`);
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
      `Başkan ${this.getCurrentPresident().name} 1 kart eledi ve 2 kartı Şansölye ${chancellor.name}'ye verdi.`,
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

  /** 4. ADIM: Şansölye 2 karttan 1'ini yasalaştırır, diğerini discard eder */
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

    // Faşist politika yasalaştıysa 5-kişilik Executive Power kilometre taşlarını kontrol et
    if (enacted === 'FASCIST') {
      const power = this.getExecutivePowerForFascistCount(s.fascistPolicies);
      if (power === 'POLICY_PEEK') {
        this.ensureDeckHasCards(3);
        s.peekedCards = s.drawPile.slice(0, 3);
        s.activeExecutivePower = 'POLICY_PEEK';
        s.phase = 'EXECUTIVE_PEEK';
        this.appendLog(
          `3. Faşist Politika Yetkisi: Başkan ${this.getCurrentPresident().name} destenin üstündeki 3 kartı inceliyor.`,
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
          `${s.fascistPolicies}. Faşist Politika Yetkisi: Başkan ${this.getCurrentPresident().name} bir oyuncuyu infaz etmeli!`,
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
    }

    this.advanceToNextRound(prevPhase);
  }

  /** 3. Faşist politika sonrasında Başkanın kart incelemesini tamamlaması */
  completePolicyPeek(presidentId: string): void {
    this.assertPhase('EXECUTIVE_PEEK');
    if (this.state.presidentId !== presidentId) {
      throw new Error(`Yalnızca aktif Başkan (${this.state.presidentId}) incelemeyi bitirebilir.`);
    }
    const prevPhase = this.state.phase;
    this.state.peekedCards = [];
    this.state.activeExecutivePower = 'NONE';
    this.appendLog(
      `Başkan ${this.getCurrentPresident().name} desteye göz atma yetkisini tamamladı.`,
      'executive'
    );
    this.advanceToNextRound(prevPhase);
  }

  /** 4. veya 5. Faşist politika sonrasında Başkanın bir oyuncuyu infaz etmesi */
  executePlayer(presidentId: string, targetId: string): void {
    this.assertPhase('EXECUTIVE_EXECUTION');
    const s = this.state;
    if (s.presidentId !== presidentId) {
      throw new Error(`Yalnızca aktif Başkan (${s.presidentId}) infaz kararı verebilir.`);
    }

    const target = s.players.find((p) => p.id === targetId);
    if (!target || !target.isAlive || target.id === presidentId) {
      throw new Error(`Geçersiz infaz hedefi: ${targetId}`);
    }

    const prevPhase = s.phase;
    target.isAlive = false;
    s.activeExecutivePower = 'NONE';
    const wasHitler = target.role === 'HITLER';

    this.appendLog(
      `İNFAZ! Başkan ${this.getCurrentPresident().name}, ${target.name} oyuncusunu infaz etti!`,
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
        `Hitler (${target.name}) infaz edildi! Liberaller oyunu kazandı!`
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
    }

    this.appendLog(
      `${policy} politika yürürlüğe girdi! Skor — Liberal: ${s.liberalPolicies}/5, Faşist: ${s.fascistPolicies}/6`,
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
        '5 Liberal politika yürürlüğe girdi! Liberaller kazandı!'
      );
      return;
    }

    if (s.fascistPolicies >= 6) {
      this.finishGame(
        'FASCIST',
        'FASCIST_POLICIES',
        '6 Faşist politika yürürlüğe girdi! Faşistler kazandı!'
      );
    }
  }

  /** 5 kişilik board için resmi Faşist yetki kilometre taşları */
  getExecutivePowerForFascistCount(count: number): ExecutivePower {
    if (count === 3) return 'POLICY_PEEK';
    if (count === 4 || count === 5) return 'EXECUTION';
    return 'NONE';
  }

  private advanceToNextRound(prevPhase: GamePhase): void {
    const s = this.state;
    s.chancellorId = null;
    s.chancellorNomineeId = null;
    this.rotatePresidentClockwise();
    s.round++;
    s.phase = 'ELECTION_NOMINATION';

    this.appendLog(
      `Tur #${s.round}: Yeni Başkan ${this.getCurrentPresident().name} Şansölye adayını seçiyor.`,
      'election'
    );
    this.emitPhaseChange(prevPhase, 'ELECTION_NOMINATION');
    this.emitStateChanged();
  }

  private rotatePresidentClockwise(): void {
    const s = this.state;
    const count = s.players.length;
    for (let step = 1; step <= count; step++) {
      const nextIdx = (s.presidentIndex + step) % count;
      if (s.players[nextIdx].isAlive) {
        s.presidentIndex = nextIdx;
        s.presidentId = s.players[nextIdx].id;
        return;
      }
    }
  }

  private ensureDeckHasCards(required: number): void {
    const s = this.state;
    if (s.drawPile.length >= required) return;

    if (s.discardPile.length === 0) {
      throw new Error('Destede ve ıskarta yığınında yeterli kart kalmadı.');
    }

    s.drawPile = this.shuffle([...s.drawPile, ...s.discardPile]);
    s.discardPile = [];
    this.appendLog(
      `Destede ${required}'ten az kart kaldığı için ıskarta kartları yeniden karıştırıldı (Deste: ${s.drawPile.length}).`,
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
  // OFFLİNE BOT ADIMLAYICISI (CONSUME EDİLEBİLİR TURN HELPER)
  // =========================================================================

  /**
   * Mevcut fazda karar bekleyen tüm yapay zeka bot hamlelerini yürütür.
   * Konsol/terminal simülasyonunda ve offline oyunda insan sırası dışındaki adımları ilerletir.
   * @returns Hamle yapılıp yapılmadığı (true = durum ilerledi, false = insan hamlesi bekleniyor veya GAME_OVER)
   */
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
          s.presidentHand
        );
        this.discardPolicyByPresident(president.id, discardIdx);
        return true;
      }

      case 'LEGISLATIVE_CHANCELLOR': {
        const chancellor = s.players.find((p) => p.id === s.chancellorId);
        if (!chancellor || chancellor.isHuman) return false;
        const enactIdx = this.bots.chooseChancellorEnactIndex(
          chancellor,
          s.chancellorHand
        );
        this.enactPolicyByChancellor(chancellor.id, enactIdx);
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
