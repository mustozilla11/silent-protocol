/**
 * Tam Kapasiteli Secret Hitler (5–10 Kişilik) Headless Kural Motoru Tipleri.
 * Kesinlikle Three.js / DOM / Canvas bağımlılığı içermez.
 */

export type Role = 'LIBERAL' | 'FASCIST' | 'HITLER';
export type Faction = 'LIBERAL' | 'FASCIST';
export type PartyMembership = 'LIBERAL' | 'FASCIST';
export type Policy = 'LIBERAL' | 'FASCIST';
export type Vote = 'JA' | 'NEIN';

export type GamePhase =
  | 'SETUP'
  | 'ELECTION_NOMINATION'
  | 'ELECTION_VOTING'
  | 'LEGISLATIVE_PRESIDENT'
  | 'LEGISLATIVE_CHANCELLOR'
  | 'LEGISLATIVE_VETO_RESPONSE'
  | 'CLAIM_DEBATE'
  | 'EXECUTIVE_INVESTIGATE'
  | 'EXECUTIVE_SPECIAL_ELECTION'
  | 'EXECUTIVE_PEEK'
  | 'EXECUTIVE_EXECUTION'
  | 'GAME_OVER';

export type ExecutivePower =
  | 'NONE'
  | 'INVESTIGATE'
  | 'SPECIAL_ELECTION'
  | 'POLICY_PEEK'
  | 'EXECUTION';

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
  /** Hitler'in parti üyeliği kartında da 'FASCIST' yazar */
  partyMembership: PartyMembership;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seatIndex: number;
  isHuman: boolean;
  isAlive: boolean;
  wasInvestigated: boolean;
  /** Yalnızca oyun bitiminde veya kendi görünümünde açılır; infaz edilenin rolü açılmaz */
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
  wasSpecialElection: boolean;
}

export interface ClaimRecord {
  round: number;
  presidentId: string;
  chancellorId: string;
  enactedPolicy: Policy | null; // Veto edildiyse null
  wasVetoed: boolean;
  presidentDrawn: Policy[] | null;
  presidentPassed: Policy[] | null;
  chancellorReceived: Policy[] | null;
  presidentClaimed: boolean;
  chancellorClaimed: boolean;
  hasConflict: boolean;
  conflictSummary: string;
}

export interface InvestigationResult {
  round: number;
  investigatorId: string;
  targetId: string;
  partyMembership: PartyMembership;
}

export interface LogEntry {
  round: number;
  phase: GamePhase;
  message: string;
  category: 'info' | 'election' | 'legislative' | 'claim' | 'executive' | 'victory';
}

export interface GameState {
  phase: GamePhase;
  round: number;
  playerCount: number;
  players: Player[];
  presidentIndex: number;
  presidentId: string;
  /** Özel Seçim sonrası dönüş yapılacak saat yönü sıradaki Başkan indeksi */
  specialElectionReturnIndex: number | null;
  isSpecialElectionRound: boolean;
  chancellorNomineeId: string | null;
  chancellorId: string | null;
  lastElectedPresidentId: string | null;
  lastElectedChancellorId: string | null;
  votes: Record<string, Vote>;
  lastElectionResult: ElectionResult | null;
  electionTracker: number;
  liberalPolicies: number;
  fascistPolicies: number;
  vetoUnlocked: boolean;
  vetoRejectedThisTurn: boolean;
  drawPile: Policy[];
  discardPile: Policy[];
  /** Başkanın desteden gerçekte çektiği 3 kart (beyan ve bot hafızası için) */
  actualPresidentDrawn: Policy[];
  presidentHand: Policy[];
  chancellorHand: Policy[];
  peekedCards: Policy[];
  activeExecutivePower: ExecutivePower;
  boardPowers: ExecutivePower[];
  investigatedPlayerIds: string[];
  lastInvestigation: InvestigationResult | null;
  currentClaim: ClaimRecord | null;
  claimHistory: ClaimRecord[];
  winner: Faction | null;
  winReason: WinReason | null;
  logs: LogEntry[];
}

export interface PlayerView {
  phase: GamePhase;
  round: number;
  playerCount: number;
  yourId: string;
  yourRole: Role;
  yourParty: PartyMembership;
  /**
   * 5-6 kişi: Faşist ve Hitler birbirini tanır.
   * 7-10 kişi: Faşistler birbirini ve Hitler'i görür; HITLER kendi takımını bilmez!
   */
  knownFascists: string[];
  knownHitlerId: string | null;
  hitlerKnowsAllies: boolean;
  players: PublicPlayer[];
  presidentId: string;
  isSpecialElectionRound: boolean;
  chancellorNomineeId: string | null;
  chancellorId: string | null;
  votedPlayerIds: string[];
  revealedVotes: Record<string, Vote> | null;
  lastElectionResult: ElectionResult | null;
  electionTracker: number;
  liberalPolicies: number;
  fascistPolicies: number;
  vetoUnlocked: boolean;
  vetoRejectedThisTurn: boolean;
  drawPileCount: number;
  discardPileCount: number;
  presidentHand: Policy[] | null;
  chancellorHand: Policy[] | null;
  peekedCards: Policy[] | null;
  activeExecutivePower: ExecutivePower;
  boardPowers: ExecutivePower[];
  lastInvestigation: InvestigationResult | null;
  currentClaim: ClaimRecord | null;
  claimHistory: ClaimRecord[];
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
  VETO_PROPOSED: { chancellorId: string; presidentId: string };
  VETO_RESOLVED: { accepted: boolean; electionTracker: number };
  POLICY_ENACTED: {
    policy: Policy;
    liberalPolicies: number;
    fascistPolicies: number;
    viaChaos: boolean;
  };
  CLAIM_SUBMITTED: { actorId: string; role: 'PRESIDENT' | 'CHANCELLOR'; hasConflict: boolean };
  EXECUTIVE_POWER_TRIGGERED: { power: ExecutivePower; presidentId: string };
  LOYALTY_INVESTIGATED: { presidentId: string; targetId: string; party: PartyMembership };
  SPECIAL_ELECTION_CALLED: { byPresidentId: string; chosenPresidentId: string };
  POLICY_PEEKED: { presidentId: string; cards: Policy[] };
  PLAYER_EXECUTED: { presidentId: string; targetId: string; wasHitler: boolean };
  GAME_OVER: { winner: Faction; reason: WinReason };
  LOG: LogEntry;
}
