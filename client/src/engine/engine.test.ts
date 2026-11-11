import assert from 'node:assert/strict';
import { GameEngine } from './GameEngine.ts';
import type { GameState, Player, Policy } from './types.ts';

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function forceRolesAndDeck(
  engine: GameEngine,
  roles: Array<Player['role']>,
  deck: Policy[]
): void {
  // Testlerde deterministik senaryolar kurmak için iç state referansını güvenli kurulumla düzenleriz
  const internal = engine as unknown as { state: GameState };
  roles.forEach((role, idx) => {
    internal.state.players[idx].role = role;
  });
  internal.state.drawPile = [...deck];
  internal.state.discardPile = [];
}

function passCurrentElection(engine: GameEngine, nomineeId: string): void {
  const s = engine.getState();
  engine.nominateChancellor(s.presidentId, nomineeId);
  for (const p of engine.getAlivePlayers()) {
    engine.castVote(p.id, 'JA');
  }
}

function failCurrentElection(engine: GameEngine, nomineeId: string, tie = false): void {
  const s = engine.getState();
  engine.nominateChancellor(s.presidentId, nomineeId);
  const alive = engine.getAlivePlayers();
  alive.forEach((p, idx) => {
    if (tie && idx < Math.floor(alive.length / 2)) {
      engine.castVote(p.id, 'JA');
    } else {
      engine.castVote(p.id, 'NEIN');
    }
  });
}

function testInitialSetupAndPrivacy(): void {
  const engine = new GameEngine({
    rng: createSeededRng(42),
    startingPresidentIndex: 0,
  });
  const state = engine.getState();

  assert.equal(state.players.length, 5);
  assert.equal(state.players.filter((p) => p.role === 'LIBERAL').length, 3);
  assert.equal(state.players.filter((p) => p.role === 'FASCIST').length, 1);
  assert.equal(state.players.filter((p) => p.role === 'HITLER').length, 1);

  assert.equal(state.drawPile.length, 17);
  assert.equal(state.drawPile.filter((c) => c === 'LIBERAL').length, 6);
  assert.equal(state.drawPile.filter((c) => c === 'FASCIST').length, 11);
  assert.equal(state.phase, 'ELECTION_NOMINATION');
  assert.equal(state.presidentId, 'human');

  // Gizlilik sınırı: Liberal hiç kimsenin gizli rolünü göremez; Faşist & Hitler birbirini görür
  const liberal = state.players.find((p) => p.role === 'LIBERAL')!;
  const fascist = state.players.find((p) => p.role === 'FASCIST')!;
  const hitler = state.players.find((p) => p.role === 'HITLER')!;

  const libView = engine.getPlayerView(liberal.id);
  assert.equal(libView.knownFascists.length, 0);
  assert.equal(libView.knownHitlerId, null);

  const fascView = engine.getPlayerView(fascist.id);
  assert.deepEqual(fascView.knownFascists, [fascist.id]);
  assert.equal(fascView.knownHitlerId, hitler.id);

  const hitlerView = engine.getPlayerView(hitler.id);
  assert.deepEqual(hitlerView.knownFascists, [fascist.id]);
  assert.equal(hitlerView.knownHitlerId, hitler.id);

  console.log('✓ Test 1: 5 kişilik kurulum, deste dağılımı ve gizlilik görünümü doğrulandı.');
}

function testElectionTermLimitsAndVoting(): void {
  const engine = new GameEngine({
    rng: createSeededRng(7),
    startingPresidentIndex: 0,
  });
  forceRolesAndDeck(
    engine,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'HITLER'],
    ['LIBERAL', 'LIBERAL', 'FASCIST', 'LIBERAL', 'FASCIST', 'LIBERAL']
  );

  // Başkan (human) kendini aday gösteremez
  assert.throws(() => engine.nominateChancellor('human', 'human'));

  // Tur 1: bot-1 Şansölye seçilir ve Liberal politika geçer
  passCurrentElection(engine, 'bot-1');
  let s = engine.getState();
  assert.equal(s.phase, 'LEGISLATIVE_PRESIDENT');
  assert.equal(engine.getPlayerView('human').presidentHand?.length, 3);
  assert.equal(engine.getPlayerView('bot-1').presidentHand, null);

  // Başkan 1 Faşist (index 2) eleyip 2 Liberal iletiyor
  engine.discardPolicyByPresident('human', 2);
  s = engine.getState();
  assert.equal(s.phase, 'LEGISLATIVE_CHANCELLOR');
  assert.equal(engine.getPlayerView('bot-1').chancellorHand?.length, 2);

  engine.enactPolicyByChancellor('bot-1', 0);
  s = engine.getState();
  assert.equal(s.liberalPolicies, 1);
  assert.equal(s.discardPile.length, 2);
  assert.equal(s.phase, 'ELECTION_NOMINATION');
  assert.equal(s.presidentId, 'bot-1');

  // Dönem Sınırı: Son Şansölye (bot-1) ya da mevcut Başkan kendini seçemez;
  // bot-1 başkan, eski Şansölye bot-1 zaten kendisi; Tur 2'de bot-2 seçilirse Tur 3'te bot-2 yasak olmalı!
  passCurrentElection(engine, 'bot-2');
  engine.discardPolicyByPresident('bot-1', 0);
  engine.enactPolicyByChancellor('bot-2', 0);

  s = engine.getState();
  assert.equal(s.presidentId, 'bot-2');
  assert.equal(s.lastElectedChancellorId, 'bot-2');

  // Eşit oyda (ör. 2 JA, 2 NEIN, ama 5 canlıda 2-3 veya bot-3 başkanlığında 2-3):
  const eligible = engine.getEligibleChancellorNominees().map((p) => p.id);
  assert.equal(eligible.includes('bot-2'), false);
  // 5 canlı oyuncuda önceki Başkan (bot-1) aday gösterilebilir!
  assert.equal(eligible.includes('bot-1'), true);

  console.log('✓ Test 2: Oylama, yasama kart aktarımı ve dönem sınırları doğrulandı.');
}

function testChaosPolicyAndReshuffle(): void {
  const engine = new GameEngine({
    rng: createSeededRng(100),
    startingPresidentIndex: 0,
  });
  // Destedeki üst 3 kart: FASCIST, LIBERAL, FASCIST; toplam 2 kart kalsın ki yeniden karıştırma tetiklensin
  forceRolesAndDeck(
    engine,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'HITLER'],
    ['FASCIST', 'LIBERAL', 'FASCIST', 'LIBERAL']
  );

  let chaosEvents = 0;
  engine.events.on('POLICY_ENACTED', (ev) => {
    if (ev.viaChaos) chaosEvents++;
  });

  // 3 başarısız oylama -> Kaos!
  failCurrentElection(engine, 'bot-1');
  assert.equal(engine.getState().electionTracker, 1);
  failCurrentElection(engine, 'bot-2');
  assert.equal(engine.getState().electionTracker, 2);
  failCurrentElection(engine, 'bot-3');

  const s = engine.getState();
  assert.equal(chaosEvents, 1);
  assert.equal(s.electionTracker, 0);
  assert.equal(s.fascistPolicies, 1);
  assert.equal(s.drawPile.length, 3);

  // Destedeki 3 kartı kullanarak oynayalım; ardından discard'dan otomatik reshuffle test edelim
  passCurrentElection(engine, 'bot-4');
  engine.discardPolicyByPresident('bot-3', 0);
  engine.enactPolicyByChancellor('bot-4', 0);
  assert.equal(engine.getState().drawPile.length, 0);
  assert.equal(engine.getState().discardPile.length, 2);

  // Şimdi 3 kart daha çekileceğinde 2 discard yetersiz (ama kaos + normalde 3 gerekiyorsa) test etmek için discard'a 3 kart ekleyip yeni seçim yapalım
  const internal = engine as unknown as { state: GameState };
  internal.state.discardPile.push('LIBERAL');
  passCurrentElection(engine, 'human');
  const afterReshuffle = engine.getState();
  assert.equal(afterReshuffle.phase, 'LEGISLATIVE_PRESIDENT');
  assert.equal(afterReshuffle.presidentHand.length, 3);
  assert.equal(afterReshuffle.discardPile.length, 0);

  console.log('✓ Test 3: 3/3 Kaos yasa geçirimi ve ıskarta destesi yeniden karıştırması doğrulandı.');
}

function testExecutivePeekAndExecutionHitlerWin(): void {
  const engine = new GameEngine({
    rng: createSeededRng(99),
    startingPresidentIndex: 0,
  });
  forceRolesAndDeck(
    engine,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'HITLER'],
    [
      'FASCIST', 'FASCIST', 'FASCIST',
      'FASCIST', 'FASCIST', 'FASCIST',
      'FASCIST', 'FASCIST', 'FASCIST',
      'LIBERAL', 'FASCIST', 'LIBERAL',
      'FASCIST', 'FASCIST', 'FASCIST',
    ]
  );

  // 1. ve 2. Faşist politika (yetki yok)
  for (let i = 0; i < 2; i++) {
    const s = engine.getState();
    const nom = engine.getEligibleChancellorNominees()[0].id;
    passCurrentElection(engine, nom);
    engine.discardPolicyByPresident(s.presidentId, 0);
    engine.enactPolicyByChancellor(nom, 0);
  }
  assert.equal(engine.getState().fascistPolicies, 2);

  // 3. Faşist politika -> POLICY_PEEK tetiklenmeli!
  let s = engine.getState();
  const nom3 = engine.getEligibleChancellorNominees()[0].id;
  passCurrentElection(engine, nom3);
  engine.discardPolicyByPresident(s.presidentId, 0);
  engine.enactPolicyByChancellor(nom3, 0);

  s = engine.getState();
  assert.equal(s.fascistPolicies, 3);
  assert.equal(s.phase, 'EXECUTIVE_PEEK');
  assert.equal(engine.getPlayerView(s.presidentId).peekedCards?.length, 3);
  engine.completePolicyPeek(s.presidentId);
  assert.equal(engine.getState().phase, 'ELECTION_NOMINATION');

  // 3+ Faşist politikadan sonra Hitler Dışında birini seçip 4. Faşisti çıkaralım -> EXECUTION!
  s = engine.getState();
  const nonHitler = engine
    .getEligibleChancellorNominees()
    .find((p) => p.role !== 'HITLER')!.id;
  passCurrentElection(engine, nonHitler);
  engine.discardPolicyByPresident(s.presidentId, 0);
  engine.enactPolicyByChancellor(nonHitler, 0);

  s = engine.getState();
  assert.equal(s.fascistPolicies, 4);
  assert.equal(s.phase, 'EXECUTIVE_EXECUTION');

  // Hitler (bot-4) infaz edilirse Liberaller ANINDA kazanmalı!
  const hitler = s.players.find((p) => p.role === 'HITLER')!;
  if (s.presidentId !== hitler.id) {
    engine.executePlayer(s.presidentId, hitler.id);
    const fin = engine.getState();
    assert.equal(fin.phase, 'GAME_OVER');
    assert.equal(fin.winner, 'LIBERAL');
    assert.equal(fin.winReason, 'HITLER_EXECUTED');
  }

  console.log('✓ Test 4: 3. Faşist (Peek) ve 4. Faşist (İnfaz ile Hitler avı zaferi) doğrulandı.');
}

function testHitlerChancellorVictoryAndBoardVictory(): void {
  // Senaryo A: 3+ Faşist politikadan sonra Hitler Şansölye seçilirse Faşistler kazanır
  const g1 = new GameEngine({
    rng: createSeededRng(12),
    startingPresidentIndex: 0,
  });
  forceRolesAndDeck(
    g1,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'HITLER'],
    Array<Policy>(17).fill('LIBERAL')
  );
  (g1 as unknown as { state: GameState }).state.fascistPolicies = 3;
  passCurrentElection(g1, 'bot-4'); // bot-4 = HITLER
  assert.equal(g1.getState().phase, 'GAME_OVER');
  assert.equal(g1.getState().winner, 'FASCIST');
  assert.equal(g1.getState().winReason, 'HITLER_CHANCELLOR');

  // Senaryo B: 5 Liberal politika -> Liberal zaferi
  const g2 = new GameEngine({
    rng: createSeededRng(13),
    startingPresidentIndex: 0,
  });
  forceRolesAndDeck(
    g2,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'HITLER'],
    Array<Policy>(17).fill('LIBERAL')
  );
  for (let i = 0; i < 5; i++) {
    const s = g2.getState();
    const nom = g2.getEligibleChancellorNominees()[0].id;
    passCurrentElection(g2, nom);
    g2.discardPolicyByPresident(s.presidentId, 0);
    g2.enactPolicyByChancellor(nom, 0);
  }
  assert.equal(g2.getState().phase, 'GAME_OVER');
  assert.equal(g2.getState().winner, 'LIBERAL');
  assert.equal(g2.getState().winReason, 'LIBERAL_POLICIES');

  // Senaryo C: 6 Faşist politika -> Faşist zaferi
  const g3 = new GameEngine({
    rng: createSeededRng(14),
    startingPresidentIndex: 0,
  });
  forceRolesAndDeck(
    g3,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'HITLER'],
    Array<Policy>(17).fill('FASCIST')
  );
  let safety = 0;
  while (g3.getState().phase !== 'GAME_OVER' && safety < 20) {
    safety++;
    const s = g3.getState();
    const nonHitler = engineNonHitlerCandidate(g3);
    passCurrentElection(g3, nonHitler);
    if (g3.getState().phase === 'GAME_OVER') break;
    g3.discardPolicyByPresident(s.presidentId, 0);
    g3.enactPolicyByChancellor(nonHitler, 0);
    const after = g3.getState();
    if (after.phase === 'EXECUTIVE_PEEK') {
      g3.completePolicyPeek(after.presidentId);
    } else if (after.phase === 'EXECUTIVE_EXECUTION') {
      const target = after.players.find(
        (p) => p.isAlive && p.id !== after.presidentId && p.role !== 'HITLER'
      )!;
      g3.executePlayer(after.presidentId, target.id);
    }
  }
  assert.equal(g3.getState().phase, 'GAME_OVER');
  assert.equal(g3.getState().winner, 'FASCIST');
  assert.equal(g3.getState().winReason, 'FASCIST_POLICIES');

  console.log('✓ Test 5: 5 Liberal, 6 Faşist ve 3+ sonrası Hitler Şansölye zaferleri doğrulandı.');
}

function engineNonHitlerCandidate(engine: GameEngine): string {
  const elig = engine.getEligibleChancellorNominees();
  return (elig.find((p) => p.role !== 'HITLER') ?? elig[0]).id;
}

function testFullOfflineSimulatedGame(): void {
  const sim = new GameEngine({
    rng: createSeededRng(2026),
    humanName: 'TestKomutan',
  });

  const eventsObserved: string[] = [];
  sim.events.on('PHASE_CHANGED', (e) => eventsObserved.push(e.phase));

  let steps = 0;
  while (sim.getState().phase !== 'GAME_OVER' && steps < 200) {
    steps++;
    const progressedByBots = sim.stepBots();
    if (progressedByBots) continue;

    // Sıra insan oyuncudaysa (offline simülasyon kararı verelim)
    const s = sim.getState();
    switch (s.phase) {
      case 'ELECTION_NOMINATION': {
        const nom = sim.getEligibleChancellorNominees()[0].id;
        sim.nominateChancellor('human', nom);
        break;
      }
      case 'ELECTION_VOTING': {
        sim.castVote('human', s.round % 3 === 0 ? 'NEIN' : 'JA');
        break;
      }
      case 'LEGISLATIVE_PRESIDENT': {
        const idx = s.presidentHand.indexOf('FASCIST');
        sim.discardPolicyByPresident('human', idx >= 0 ? idx : 0);
        break;
      }
      case 'LEGISLATIVE_CHANCELLOR': {
        const idx = s.chancellorHand.indexOf('LIBERAL');
        sim.enactPolicyByChancellor('human', idx >= 0 ? idx : 0);
        break;
      }
      case 'EXECUTIVE_PEEK': {
        sim.completePolicyPeek('human');
        break;
      }
      case 'EXECUTIVE_EXECUTION': {
        const target = sim.getAlivePlayers().find((p) => p.id !== 'human')!;
        sim.executePlayer('human', target.id);
        break;
      }
    }
  }

  const endState = sim.getState();
  assert.equal(endState.phase, 'GAME_OVER');
  assert.ok(endState.winner === 'LIBERAL' || endState.winner === 'FASCIST');
  assert.ok(eventsObserved.length > 5);

  console.log(
    `✓ Test 6: Tam oyun simülasyonu ${endState.round} turda bitti! Kazanan: ${endState.winner} (${endState.winReason}) — Skor L:${endState.liberalPolicies}/5, F:${endState.fascistPolicies}/6`
  );
}

console.log('=== Secret Hitler Headless Engine (/engine) Test Paketi ===');
testInitialSetupAndPrivacy();
testElectionTermLimitsAndVoting();
testChaosPolicyAndReshuffle();
testExecutivePeekAndExecutionHitlerWin();
testHitlerChancellorVictoryAndBoardVictory();
testFullOfflineSimulatedGame();
console.log('=== TÜM BAŞSIZ OYUN MOTORU TESTLERİ BAŞARIYLA GEÇTİ ===');
