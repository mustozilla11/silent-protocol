import type { GameState, Player, Policy, Vote } from './types.ts';

/**
 * Tek oyunculu offline modda 4 yapay zeka / mock botun kararlarını üretir.
 * Tamamen saf mantıktır; yan etki veya görsel katman bağımlılığı yoktur.
 */
export class BotController {
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  chooseChancellorNominee(
    bot: Player,
    eligibleCandidates: Player[],
    state: GameState
  ): string {
    if (eligibleCandidates.length === 0) {
      throw new Error('Seçilebilir Şansölye adayı kalmadı.');
    }

    // 3+ Faşist politika çıkmışsa, Faşist bot Hitler'i Şansölye yaparak kazanmayı hedefler
    if (bot.role === 'FASCIST' && state.fascistPolicies >= 3) {
      const hitler = eligibleCandidates.find((p) => p.role === 'HITLER');
      if (hitler) return hitler.id;
    }

    // Hitler mümkünse şüphe çekmemek için Liberal görünen veya müttefik olmayan birini aday gösterir
    if (bot.role === 'FASCIST') {
      const nonHitler = eligibleCandidates.filter((p) => p.role !== 'HITLER');
      if (nonHitler.length > 0 && state.fascistPolicies < 3) {
        return nonHitler[Math.floor(this.rng() * nonHitler.length)].id;
      }
    }

    const idx = Math.floor(this.rng() * eligibleCandidates.length);
    return eligibleCandidates[idx].id;
  }

  chooseVote(bot: Player, state: GameState): Vote {
    const nominee = state.players.find((p) => p.id === state.chancellorNomineeId);
    const president = state.players.find((p) => p.id === state.presidentId);

    if (bot.role === 'FASCIST' || bot.role === 'HITLER') {
      // Hükümette bir müttefik varsa destekle; 3+ Faşist politikada Hitler aday ise kesin JA!
      if (nominee?.role === 'HITLER' && state.fascistPolicies >= 3) {
        return 'JA';
      }
      if (
        president?.role === 'FASCIST' ||
        president?.role === 'HITLER' ||
        nominee?.role === 'FASCIST' ||
        nominee?.role === 'HITLER'
      ) {
        return this.rng() < 0.85 ? 'JA' : 'NEIN';
      }
      // Kaos sayacı 2'deyken veya erken turlarda şüphe çekmemek için çoğunlukla JA verir
      return this.rng() < 0.55 ? 'JA' : 'NEIN';
    }

    // Liberal bot: Eğer aday veya başkan daha önce Faşist yasa geçirdiyse hafif şüpheyle yaklaş
    if (state.electionTracker >= 2) {
      // Kaos riskinde Liberal genellikle onaylamaya eğilimli değildir ama denge için %50
      return this.rng() < 0.55 ? 'JA' : 'NEIN';
    }
    return this.rng() < 0.72 ? 'JA' : 'NEIN';
  }

  choosePresidentDiscardIndex(bot: Player, hand: readonly Policy[]): number {
    if (bot.role === 'LIBERAL') {
      const fascistIdx = hand.indexOf('FASCIST');
      return fascistIdx >= 0 ? fascistIdx : 0;
    }

    // Faşist veya Hitler: Liberal kartı elemeye çalışır
    const liberalIdx = hand.indexOf('LIBERAL');
    return liberalIdx >= 0 ? liberalIdx : 0;
  }

  chooseChancellorEnactIndex(bot: Player, hand: readonly Policy[]): number {
    if (bot.role === 'LIBERAL') {
      const liberalIdx = hand.indexOf('LIBERAL');
      return liberalIdx >= 0 ? liberalIdx : 0;
    }

    // Faşist veya Hitler: Faşist politika yasalaştırmayı hedefler
    const fascistIdx = hand.indexOf('FASCIST');
    return fascistIdx >= 0 ? fascistIdx : 0;
  }

  chooseExecutionTarget(bot: Player, aliveTargets: Player[]): string {
    const valid = aliveTargets.filter((p) => p.id !== bot.id && p.isAlive);
    if (valid.length === 0) {
      throw new Error('İnfaz edilebilecek hedef oyuncu yok.');
    }

    if (bot.role === 'LIBERAL') {
      // Liberal bot rastgele olmayan adayları değerlendirir; simülasyonda rastgele ama Hitler dışındaki şüpheliler
      return valid[Math.floor(this.rng() * valid.length)].id;
    }

    // Faşist veya Hitler asla kendi takım arkadaşını (özellikle Hitler'i) infaz etmez!
    const liberals = valid.filter((p) => p.role === 'LIBERAL');
    if (liberals.length > 0) {
      return liberals[Math.floor(this.rng() * liberals.length)].id;
    }
    return valid[Math.floor(this.rng() * valid.length)].id;
  }
}
