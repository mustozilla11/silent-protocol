import type { ClaimRecord, GameState, Player, Policy, Vote } from './types.ts';

/**
 * 5–10 kişilik Secret Hitler psikolojisine göre bot yapay zekası:
 * - 7–10 kişide Hitler kendi takım arkadaşlarını bilmez ve güvenli/Liberal gibi oynamaya çalışır.
 * - Faşistler Hitler'i korur, güvenilirliğini artırmak için gerektiğinde Liberal kart paslar,
 *   3+ Faşist politika sonrasında Hitler'i Şansölye yapmaya çalışır ve iddialarda blöf atabilir.
 * - Liberaller çelişen beyanları, Faşist yasa geçiren hükümetleri ve soruşturmaları takip eder.
 */
export class BotController {
  private rng: () => number;
  /** Bot ID -> (Hedef ID -> Şüphe Skoru; yüksek = daha şüpheli) */
  private suspicion = new Map<string, Map<string, number>>();

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  resetMemory(): void {
    this.suspicion.clear();
  }

  observeClaimOutcome(claim: ClaimRecord): void {
    if (claim.wasVetoed) return;
    if (claim.hasConflict) {
      this.addSuspicionToAll(claim.presidentId, 2.5);
      this.addSuspicionToAll(claim.chancellorId, 2.5);
    } else if (claim.enactedPolicy === 'FASCIST') {
      this.addSuspicionToAll(claim.chancellorId, 1.2);
      this.addSuspicionToAll(claim.presidentId, 0.7);
    } else if (claim.enactedPolicy === 'LIBERAL') {
      this.addSuspicionToAll(claim.chancellorId, -0.8);
      this.addSuspicionToAll(claim.presidentId, -0.5);
    }
  }

  observeInvestigation(investigatorId: string, targetId: string, party: 'LIBERAL' | 'FASCIST'): void {
    let map = this.suspicion.get(investigatorId);
    if (!map) {
      map = new Map();
      this.suspicion.set(investigatorId, map);
    }
    const prev = map.get(targetId) ?? 0;
    map.set(targetId, party === 'FASCIST' ? prev + 6 : prev - 4);
  }

  private addSuspicionToAll(targetId: string, delta: number): void {
    for (let i = 1; i <= 9; i++) {
      const botId = `bot-${i}`;
      if (botId === targetId) continue;
      let map = this.suspicion.get(botId);
      if (!map) {
        map = new Map();
        this.suspicion.set(botId, map);
      }
      map.set(targetId, (map.get(targetId) ?? 0) + delta);
    }
  }

  private getSuspicion(botId: string, targetId: string): number {
    return this.suspicion.get(botId)?.get(targetId) ?? 0;
  }

  chooseChancellorNominee(
    bot: Player,
    eligibleCandidates: Player[],
    state: GameState
  ): string {
    if (eligibleCandidates.length === 0) {
      throw new Error('Seçilebilir Şansölye adayı kalmadı.');
    }

    // Faşist bot: 3+ Faşist politikadan sonra Hitler'i Şansölye adayı göstermek ister!
    if (bot.role === 'FASCIST' && state.fascistPolicies >= 3) {
      const hitler = eligibleCandidates.find((p) => p.role === 'HITLER');
      if (hitler) return hitler.id;
    }

    // Faşist bot erken turda dikkat çekmemek için Liberal seçebilir
    if (bot.role === 'FASCIST' && state.fascistPolicies < 3) {
      const nonHitler = eligibleCandidates.filter((p) => p.role !== 'HITLER');
      if (nonHitler.length > 0) {
        return nonHitler[Math.floor(this.rng() * nonHitler.length)].id;
      }
    }

    // Liberal veya 7-10'daki kör Hitler: En az şüpheli adayı tercih eder
    const sorted = [...eligibleCandidates].sort(
      (a, b) => this.getSuspicion(bot.id, a.id) - this.getSuspicion(bot.id, b.id)
    );
    const topPool = sorted.slice(0, Math.min(2, sorted.length));
    return topPool[Math.floor(this.rng() * topPool.length)].id;
  }

  chooseVote(bot: Player, state: GameState): Vote {
    const nominee = state.players.find((p) => p.id === state.chancellorNomineeId);
    const president = state.players.find((p) => p.id === state.presidentId);

    // Hitler (7-10 kişilik oyunda takımını bilmese bile şüphe çekmemek için makul oy verir)
    if (bot.role === 'HITLER') {
      if (state.playerCount <= 6 && nominee?.role === 'FASCIST') {
        return 'JA';
      }
      if (nominee?.id === bot.id) return 'JA';
      const susNom = nominee ? this.getSuspicion(bot.id, nominee.id) : 0;
      if (state.fascistPolicies >= 3 && susNom > 2.5) return 'NEIN';
      return this.rng() < 0.72 ? 'JA' : 'NEIN';
    }

    if (bot.role === 'FASCIST') {
      if (nominee?.role === 'HITLER' && state.fascistPolicies >= 3) {
        return 'JA';
      }
      if (
        president?.role === 'HITLER' ||
        nominee?.role === 'HITLER' ||
        president?.role === 'FASCIST' ||
        nominee?.role === 'FASCIST'
      ) {
        return this.rng() < 0.88 ? 'JA' : 'NEIN';
      }
      // Her ikisi de Liberal ve 3+ Faşist varsa bazen engel olmak isteyebilir
      if (state.fascistPolicies >= 3 && state.liberalPolicies >= 3) {
        return this.rng() < 0.35 ? 'JA' : 'NEIN';
      }
      return this.rng() < 0.62 ? 'JA' : 'NEIN';
    }

    // LIBERAL bot mantığı
    const suspSum =
      (president ? this.getSuspicion(bot.id, president.id) : 0) +
      (nominee ? this.getSuspicion(bot.id, nominee.id) : 0);

    if (state.fascistPolicies >= 3 && nominee && this.getSuspicion(bot.id, nominee.id) >= 1.5) {
      return 'NEIN';
    }
    if (suspSum >= 3.0) {
      return this.rng() < 0.20 ? 'JA' : 'NEIN';
    }
    if (state.electionTracker >= 2) {
      return this.rng() < 0.75 ? 'JA' : 'NEIN';
    }
    return this.rng() < 0.70 ? 'JA' : 'NEIN';
  }

  choosePresidentDiscardIndex(bot: Player, hand: readonly Policy[], state: GameState): number {
    // 7-10 kişilik oyunda Hitler erken aşamada güven kazanmak için elinde Liberal varsa geçirebilir!
    if (
      bot.role === 'HITLER' &&
      state.playerCount >= 7 &&
      state.fascistPolicies < 3
    ) {
      const fIdx = hand.indexOf('FASCIST');
      if (fIdx >= 0 && hand.includes('LIBERAL') && this.rng() < 0.75) {
        return fIdx;
      }
    }

    // Faşist Başkan eğer Şansölye'nin Hitler olduğunu biliyorsa ona Liberal kart paslayarak güven kazandırabilir!
    const chanc = state.players.find((p) => p.id === state.chancellorId);
    if (
      bot.role === 'FASCIST' &&
      chanc?.role === 'HITLER' &&
      state.fascistPolicies < 3 &&
      hand.includes('LIBERAL') &&
      this.rng() < 0.7
    ) {
      const fIdx = hand.indexOf('FASCIST');
      if (fIdx >= 0) return fIdx;
    }

    if (bot.role === 'LIBERAL') {
      const fascistIdx = hand.indexOf('FASCIST');
      return fascistIdx >= 0 ? fascistIdx : 0;
    }

    const liberalIdx = hand.indexOf('LIBERAL');
    return liberalIdx >= 0 ? liberalIdx : 0;
  }

  shouldChancellorProposeVeto(bot: Player, hand: readonly Policy[], state: GameState): boolean {
    if (!state.vetoUnlocked || state.vetoRejectedThisTurn) return false;
    // Liberal Şansölye: Elinde hiç Liberal kart kalmadıysa (2 Faşist geldiyse) Veto ister!
    if (bot.role === 'LIBERAL') {
      return !hand.includes('LIBERAL');
    }
    // Faşist / Hitler Şansölye: Elinde hiç Faşist yoksa (2 Liberal geldiyse) Veto ister!
    return !hand.includes('FASCIST') && state.liberalPolicies >= 3;
  }

  shouldPresidentAcceptVeto(bot: Player, handBeforeVeto: readonly Policy[], state: GameState): boolean {
    if (bot.role === 'LIBERAL') {
      // Kaos 2'deyse veto kaosa yol açacağı için riskli olsa da 2 Faşistten kaçabilir
      return !handBeforeVeto.includes('LIBERAL') || state.electionTracker < 2;
    }
    return this.rng() < 0.65;
  }

  chooseChancellorEnactIndex(bot: Player, hand: readonly Policy[], state: GameState): number {
    if (bot.role === 'HITLER' && state.playerCount >= 7 && state.fascistPolicies < 3) {
      const lIdx = hand.indexOf('LIBERAL');
      if (lIdx >= 0 && this.rng() < 0.65) return lIdx;
    }

    if (bot.role === 'LIBERAL') {
      const liberalIdx = hand.indexOf('LIBERAL');
      return liberalIdx >= 0 ? liberalIdx : 0;
    }

    const fascistIdx = hand.indexOf('FASCIST');
    return fascistIdx >= 0 ? fascistIdx : 0;
  }

  choosePresidentClaim(
    bot: Player,
    actualDrawn: readonly Policy[],
    actualPassed: readonly Policy[],
    enacted: Policy | null
  ): { drawn: Policy[]; passed: Policy[] } {
    if (bot.role === 'LIBERAL') {
      return { drawn: [...actualDrawn], passed: [...actualPassed] };
    }

    // Faşist / Hitler bot: Eğer Faşist politika çıktıysa bazen suçu Şansölyeye veya desteye atabilir
    if (enacted === 'FASCIST') {
      if (actualPassed.includes('LIBERAL') && this.rng() < 0.65) {
        // Suçu Şansölyeye at: "Ben sana 1 Liberal 1 Faşist verdim" veya "3 Faşist geldi"
        if (this.rng() < 0.5) {
          return {
            drawn: ['FASCIST', 'FASCIST', 'FASCIST'],
            passed: ['FASCIST', 'FASCIST'],
          };
        }
        return {
          drawn: ['LIBERAL', 'FASCIST', 'FASCIST'],
          passed: ['LIBERAL', 'FASCIST'],
        };
      }
    }
    return { drawn: [...actualDrawn], passed: [...actualPassed] };
  }

  chooseChancellorClaim(
    bot: Player,
    actualReceived: readonly Policy[],
    enacted: Policy | null
  ): Policy[] {
    if (bot.role === 'LIBERAL') {
      return [...actualReceived];
    }

    if (enacted === 'FASCIST' && actualReceived.includes('LIBERAL') && this.rng() < 0.72) {
      // Yalan söyle: "Bana 2 Faşist geldi!" -> ÇELİŞKİ!
      return ['FASCIST', 'FASCIST'];
    }
    return [...actualReceived];
  }

  chooseInvestigateTarget(bot: Player, candidates: Player[]): string {
    const valid = candidates.filter((p) => p.id !== bot.id && p.isAlive);
    if (valid.length === 0) throw new Error('Soruşturulacak aday yok.');
    const sorted = [...valid].sort(
      (a, b) => this.getSuspicion(bot.id, b.id) - this.getSuspicion(bot.id, a.id)
    );
    return sorted[0].id;
  }

  chooseSpecialElectionTarget(bot: Player, alivePlayers: Player[]): string {
    const valid = alivePlayers.filter((p) => p.id !== bot.id && p.isAlive);
    if (valid.length === 0) throw new Error('Özel seçim adayı yok.');
    if (bot.role === 'FASCIST') {
      const ally = valid.find((p) => p.role === 'FASCIST' || p.role === 'HITLER');
      if (ally) return ally.id;
    }
    const sorted = [...valid].sort(
      (a, b) => this.getSuspicion(bot.id, a.id) - this.getSuspicion(bot.id, b.id)
    );
    return sorted[0].id;
  }

  chooseExecutionTarget(bot: Player, aliveTargets: Player[]): string {
    const valid = aliveTargets.filter((p) => p.id !== bot.id && p.isAlive);
    if (valid.length === 0) {
      throw new Error('İnfaz edilebilecek hedef oyuncu yok.');
    }

    if (bot.role === 'LIBERAL') {
      const sorted = [...valid].sort(
        (a, b) => this.getSuspicion(bot.id, b.id) - this.getSuspicion(bot.id, a.id)
      );
      return sorted[0].id;
    }

    // Faşist: Hitler'i ve takım arkadaşlarını asla infaz etmez!
    const safeTargets =
      bot.role === 'FASCIST'
        ? valid.filter((p) => p.role === 'LIBERAL')
        : valid;
    const pool = safeTargets.length > 0 ? safeTargets : valid;
    return pool[Math.floor(this.rng() * pool.length)].id;
  }
}
