/**
 * Headless Secret Hitler (5-kişilik) kural motoru veri tipleri.
 * Kesinlikle görsel / Three.js / DOM bağımlılığı içermez.
 */

export type Role = 'LIBERAL' | 'FASCIST' | 'HITLER';
export type Faction = 'LIBERAL' | 'FASCIST';
export type Policy = 'LIBERAL' | 'FASCIST';
export type Vote = 'JA' | 'NEIN';

export type GamePhase =
  | 'SETUP'
  | 'ELECTION_NOMINATION'
  | 'ELECTION_VOTING'
  | 'LEGISLATIVE_PRESIDENT'
  | 'LEGISLATIVE_CHANCELLOR'
  | 'EXECUTIVE_PEEK'
  | 'EXECUTIVE_EXECUTION'
  | 'GAME_OVER';

export type ExecutivePower = 'NONE' | 'POLICY_PEEK' | 'EXECUTION';

export type WinReason =
  | 'LIBERAL_POLICIES'
  | 'FASCIST_POLICIES'
  | 'HITLER_CHANCELLOR'
  | 'HITLER_EXECUTED';

export interface Player {
  id: string;
  name: string;
  seatIndex: number;
  isHuman: boolean;
  isAlive: boolean;
  role: Role;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seatIndex: number;
  isHuman: boolean;
  isAlive: boolean;
  /** Oyun bitmeden yalnızca oyunculara özel görünümde açılır */
  revealedRole?: Role;
}

export interface ElectionResult {
  round: number;
  presidentId: string;
  nomineeId: string;
  passed: boolean;
  jaCount: number;
  neinCount: number;
  votes: Record<string, Vote>;
  electionTracker: number;
}

export interface LogEntry {
  round: number;
  phase: GamePhase;
  message: string;
  category: 'info' | 'election' | 'legislative' | 'executive' | 'victory';
}

export interface GameState {
  phase: GamePhase;
  round: number;
  players: Player[];
  presidentIndex: number;
  presidentId: string;
  chancellorNomineeId: string | null;
  chancellorId: string | null;
  lastElectedPresidentId: string | null;
  lastElectedChancellorId: string | null;
  votes: Record<string, Vote>;
  lastElectionResult: ElectionResult | null;
  electionTracker: number;
  liberalPolicies: number;
  fascistPolicies: number;
  drawPile: Policy[];
  discardPile: Policy[];
  presidentHand: Policy[];
  chancellorHand: Policy[];
  peekedCards: Policy[];
  activeExecutivePower: ExecutivePower;
  winner: Faction | null;
  winReason: WinReason | null;
  logs: LogEntry[];
}

/** Tek bir oyuncuya özel, gizli bilgileri filtreleyen güvenli durum görünümü */
export interface PlayerView {
  phase: GamePhase;
  round: number;
  yourId: string;
  yourRole: Role;
  /** 5 kişilik oyunda Faşist -> Hitler'i, Hitler -> Faşisti bilir; Liberal ise boştur */
  knownFascists: string[];
  knownHitlerId: string | null;
  players: PublicPlayer[];
  presidentId: string;
  chancellorNomineeId: string | null;
  chancellorId: string | null;
  votedPlayerIds: string[];
  revealedVotes: Record<string, Vote> | null;
  lastElectionResult: ElectionResult | null;
  electionTracker: number;
  liberalPolicies: number;
  fascistPolicies: number;
  drawPileCount: number;
  discardPileCount: number;
  /** Yalnızca aktif Başkan yasama aşamasında 3 kartı görür */
  presidentHand: Policy[] | null;
  /** Yalnızca aktif Şansölye yasama aşamasında 2 kartı görür */
  chancellorHand: Policy[] | null;
  /** Yalnızca aktif Başkan 3. Faşist politika sonrasında üst 3 kartı görür */
  peekedCards: Policy[] | null;
  activeExecutivePower: ExecutivePower;
  winner: Faction | null;
  winReason: WinReason | null;
  logs: LogEntry[];
}

export interface EngineEventMap {
  STATE_CHANGED: GameState;
  PHASE_CHANGED: { prevPhase: GamePhase; phase: GamePhase; round: number };
  ELECTION_NOMINATED: { presidentId: string; nomineeId: string; round: number };
  VOTE_CAST: { playerId: string; totalVotes: number; requiredVotes: number };
  ELECTION_RESOLVED: ElectionResult;
  CARDS_DRAWN: { presidentId: string; count: number; remainingDrawPile: number };
  POLICY_DISCARDED: { actorId: string; by: 'PRESIDENT' | 'CHANCELLOR'; discardPileCount: number };
  POLICY_ENACTED: {
    policy: Policy;
    liberalPolicies: number;
    fascistPolicies: number;
    viaChaos: boolean;
  };
  EXECUTIVE_POWER_TRIGGERED: { power: ExecutivePower; presidentId: string };
  POLICY_PEEKED: { presidentId: string; cards: Policy[] };
  PLAYER_EXECUTED: { presidentId: string; targetId: string; wasHitler: boolean };
  GAME_OVER: { winner: Faction; reason: WinReason };
  LOG: LogEntry;
}
