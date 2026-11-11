import assert from 'node:assert/strict';
import { GameEngine, getBoardPowersForPlayerCount } from './GameEngine.ts';
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
  const internal = engine as unknown as { state: GameState };
  roles.forEach((role, idx) => {
    internal.state.players[idx].role = role;
    internal.state.players[idx].partyMembership = role === 'LIBERAL' ? 'LIBERAL' : 'FASCIST';
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

function failCurrentElection(engine: GameEngine, nomineeId: string): void {
  const s = engine.getState();
  engine.nominateChancellor(s.presidentId, nomineeId);
  for (const p of engine.getAlivePlayers()) {
    engine.castVote(p.id, 'NEIN');
  }
}

function test5To10PlayerDistributionsAndSecrecy(): void {
  const expected: Array<[number, number, number]> = [
    [5, 3, 1],
    [6, 4, 1],
    [7, 4, 2],
    [8, 5, 2],
    [9, 5, 3],
    [10, 6, 3],
  ];

  for (const [count, libs, fascs] of expected) {
    const engine = new GameEngine({
      playerCount: count,
      rng: createSeededRng(count * 31),
      startingPresidentIndex: 0,
    });
    const s = engine.getState();
    assert.equal(s.players.length, count);
    assert.equal(s.players.filter((p) => p.role === 'LIBERAL').length, libs);
    assert.equal(s.players.filter((p) => p.role === 'FASCIST').length, fascs);
    assert.equal(s.players.filter((p) => p.role === 'HITLER').length, 1);

    const hitler = s.players.find((p) => p.role === 'HITLER')!;
    const fascist = s.players.find((p) => p.role === 'FASCIST')!;
    const liberal = s.players.find((p) => p.role === 'LIBERAL')!;

    // Hitler'in Parti Üyeliği kartı FAŞİST olmalıdır
    assert.equal(hitler.partyMembership, 'FASCIST');
    assert.equal(liberal.partyMembership, 'LIBERAL');

    const hitlerView = engine.getPlayerView(hitler.id);
    const fascView = engine.getPlayerView(fascist.id);

    // Faşist her zaman Hitler'i görür
    assert.equal(fascView.knownHitlerId, hitler.id);

    // 5-6 kişi: Hitler Faşistini görür. 7-10 kişi: Hitler takım arkadaşını GÖREMEZ!
    if (count <= 6) {
      assert.equal(hitlerView.hitlerKnowsAllies, true);
      assert.equal(hitlerView.knownFascists.length, fascs);
    } else {
      assert.equal(hitlerView.hitlerKnowsAllies, false);
      assert.equal(hitlerView.knownFascists.length, 0);
    }
  }

  assert.deepEqual(getBoardPowersForPlayerCount(5), ['NONE', 'NONE', 'POLICY_PEEK', 'EXECUTION', 'EXECUTION']);
  assert.deepEqual(getBoardPowersForPlayerCount(7), ['NONE', 'INVESTIGATE', 'SPECIAL_ELECTION', 'EXECUTION', 'EXECUTION']);
  assert.deepEqual(getBoardPowersForPlayerCount(9), ['INVESTIGATE', 'INVESTIGATE', 'SPECIAL_ELECTION', 'EXECUTION', 'EXECUTION']);

  console.log('✓ Test 1: 5–10 kişilik rol dağılımı, Parti Kartı ve 7-10 Hitler körlüğü doğrulandı.');
}

function testInvestigateAndSpecialElectionOrder(): void {
  // 8 kişilik oyunda 2. Faşist -> INVESTIGATE, 3. Faşist -> SPECIAL_ELECTION!
  const engine = new GameEngine({
    playerCount: 8,
    rng: createSeededRng(77),
    startingPresidentIndex: 0,
    enableClaimDebate: false,
  });
  forceRolesAndDeck(
    engine,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'FASCIST', 'HITLER'],
    Array<Policy>(17).fill('FASCIST')
  );

  // Tur 1: President human(0) -> Chancellor bot-1 -> 1. Faşist (yetki yok) -> sıradaki Başkan bot-1(1)
  passCurrentElection(engine, 'bot-1');
  engine.discardPolicyByPresident('human', 0);
  engine.enactPolicyByChancellor('bot-1', 0);
  assert.equal(engine.getState().fascistPolicies, 1);
  assert.equal(engine.getState().presidentIndex, 1);

  // Tur 2: President bot-1(1) -> Chancellor bot-2 -> 2. Faşist -> INVESTIGATE tetiklenmeli!
  passCurrentElection(engine, 'bot-2');
  engine.discardPolicyByPresident('bot-1', 0);
  engine.enactPolicyByChancellor('bot-2', 0);
  assert.equal(engine.getState().phase, 'EXECUTIVE_INVESTIGATE');

  // bot-1 Hitler'i (bot-7) soruşturursa Parti Kartı FASCIST görmeli (ve ikinci kez seçilememeli!)
  const party = engine.investigateLoyalty('bot-1', 'bot-7');
  assert.equal(party, 'FASCIST');
  assert.equal(engine.getInvestigablePlayers('bot-1').some((p) => p.id === 'bot-7'), false);
  assert.equal(engine.getState().presidentIndex, 2); // Sıra normalde bot-2(2)'ye geçti

  // Tur 3: President bot-2(2) -> Chancellor bot-3 -> 3. Faşist -> SPECIAL_ELECTION tetiklenmeli!
  passCurrentElection(engine, 'bot-3');
  engine.discardPolicyByPresident('bot-2', 0);
  engine.enactPolicyByChancellor('bot-3', 0);
  assert.equal(engine.getState().fascistPolicies, 3);
  assert.equal(engine.getState().phase, 'EXECUTIVE_SPECIAL_ELECTION');

  // bot-2(2), Özel Seçim ile bot-6(6)'yı Başkan seçer; normal sıra returnIndex = 3(bot-3) olmalı!
  engine.callSpecialElection('bot-2', 'bot-6');
  assert.equal(engine.getState().presidentIndex, 6);
  assert.equal(engine.getState().isSpecialElectionRound, true);
  assert.equal(engine.getState().specialElectionReturnIndex, 3);

  // Özel Seçim turu başarısız oylama ile geçsin -> sıra bot-7'ye değil bot-3(3)'e geri dönmeli!
  failCurrentElection(engine, 'bot-4');
  assert.equal(engine.getState().presidentIndex, 3);
  assert.equal(engine.getState().isSpecialElectionRound, false);

  console.log('✓ Test 2: 8 kişilikte Bağlılık Soruşturması ve Özel Seçim sıra dönüşü doğrulandı.');
}

function testVetoUnlockRejectAndAcceptChaos(): void {
  const engine = new GameEngine({
    playerCount: 5,
    rng: createSeededRng(55),
    startingPresidentIndex: 0,
    enableClaimDebate: false,
  });
  forceRolesAndDeck(
    engine,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'HITLER'],
    Array<Policy>(17).fill('FASCIST')
  );

  // 4 Faşist politika varken veto kilitli olmalı
  const internal = engine as unknown as { state: GameState };
  internal.state.fascistPolicies = 4;
  internal.state.vetoUnlocked = false;
  passCurrentElection(engine, 'bot-1');
  engine.discardPolicyByPresident('human', 0);
  assert.throws(() => engine.proposeVeto('bot-1'));

  // 5. Faşist politikayı geçirelim -> VETO AÇILMALI!
  engine.enactPolicyByChancellor('bot-1', 0);
  assert.equal(engine.getState().fascistPolicies, 5);
  assert.equal(engine.getState().vetoUnlocked, true);
  // İnfaz yetkisini atlatalım (bot-2 idam)
  engine.executePlayer('human', 'bot-2');

  // Şimdi bot-1 Başkan, human Şansölye -> human Veto teklif etsin, Başkan REDDETSİN!
  passCurrentElection(engine, 'human');
  engine.discardPolicyByPresident('bot-1', 0);
  engine.proposeVeto('human');
  assert.equal(engine.getState().phase, 'LEGISLATIVE_VETO_RESPONSE');
  engine.respondToVeto('bot-1', false);
  assert.equal(engine.getState().phase, 'LEGISLATIVE_CHANCELLOR');
  assert.equal(engine.getState().vetoRejectedThisTurn, true);
  assert.throws(() => engine.proposeVeto('human')); // Aynı tur tekrar veto istenemez!

  // Şansölye zorunlu olarak 1 Liberal yasalaştırsın (test için eli LIBERAL yapalım)
  internal.state.chancellorHand = ['LIBERAL', 'FASCIST'];
  engine.enactPolicyByChancellor('human', 0);
  assert.equal(engine.getState().liberalPolicies, 1);

  // Şimdi yeni turda Başkan bot-3, Şansölye bot-1 (Hitler olmayan!) -> Veto teklif edilir ve KABUL edilir!
  passCurrentElection(engine, 'bot-1');
  engine.discardPolicyByPresident('bot-3', 0);
  engine.proposeVeto('bot-1');
  engine.respondToVeto('bot-3', true);
  assert.equal(engine.getState().electionTracker, 1);
  assert.equal(engine.getState().liberalPolicies, 1);
  assert.equal(engine.getState().fascistPolicies, 5);

  console.log('✓ Test 3: 5. Faşist politika sonrası Veto açılışı, Ret zorunluluğu ve Kabul (+1 Sayaç) doğrulandı.');
}

function testClaimContradictionDetection(): void {
  const engine = new GameEngine({
    playerCount: 5,
    rng: createSeededRng(33),
    startingPresidentIndex: 0,
    enableClaimDebate: true,
  });
  forceRolesAndDeck(
    engine,
    ['LIBERAL', 'LIBERAL', 'LIBERAL', 'FASCIST', 'HITLER'],
    ['LIBERAL', 'FASCIST', 'FASCIST', ...Array<Policy>(14).fill('LIBERAL')]
  );

  passCurrentElection(engine, 'bot-1');
  engine.discardPolicyByPresident('human', 1); // [LIBERAL, FASCIST] kaldı
  engine.enactPolicyByChancellor('bot-1', 1); // FASCIST geçirdi!

  assert.equal(engine.getState().phase, 'CLAIM_DEBATE');
  let conflictsTriggered = 0;
  engine.events.on('CLAIM_SUBMITTED', (ev) => {
    if (ev.hasConflict) conflictsTriggered++;
  });

  // Başkan doğruyu söyler: 1L 1F verdim; Şansölye yalan söyler: Bana 2F geldi!
  engine.submitPresidentClaim('human', ['LIBERAL', 'FASCIST', 'FASCIST'], ['LIBERAL', 'FASCIST']);
  engine.submitChancellorClaim('bot-1', ['FASCIST', 'FASCIST']);

  const s = engine.getState();
  assert.equal(conflictsTriggered, 1);
  assert.equal(s.currentClaim?.hasConflict, true);
  engine.finishClaimDebate();
  assert.equal(engine.getState().phase, 'ELECTION_NOMINATION');

  console.log('✓ Test 4: Yasama sonrası Beyan (Claim) çelişki tespiti doğrulandı.');
}

function testStaggeredBotStepping(): void {
  const engine = new GameEngine({
    playerCount: 5,
    rng: createSeededRng(88),
    startingPresidentIndex: 0,
  });
  passCurrentElectionStepByStep(engine, 'bot-1');
  assert.equal(engine.getState().phase, 'LEGISLATIVE_PRESIDENT');
  console.log('✓ Test 6: Sırayla tekil bot oylama adımı (stepNextBot) doğrulandı.');
}

function passCurrentElectionStepByStep(engine: GameEngine, nomineeId: string): void {
  engine.nominateChancellor('human', nomineeId);
  engine.castVote('human', 'JA');
  let votesCastByBots = 0;
  while (engine.getState().phase === 'ELECTION_VOTING') {
    const res = engine.stepNextBot();
    assert.equal(res, 'VOTED');
    votesCastByBots++;
  }
  assert.equal(votesCastByBots, 4);
}

function testFullOfflineSimulations5And8Players(): void {
  for (const count of [5, 8]) {
    const sim = new GameEngine({
      playerCount: count,
      rng: createSeededRng(1000 + count),
      humanName: 'TestKomutan',
      enableClaimDebate: true,
    });

    let steps = 0;
    while (sim.getState().phase !== 'GAME_OVER' && steps < 400) {
      steps++;
      if (sim.stepBots()) continue;

      const s = sim.getState();
      switch (s.phase) {
        case 'ELECTION_NOMINATION': {
          const nom = sim.getEligibleChancellorNominees()[0].id;
          sim.nominateChancellor('human', nom);
          break;
        }
        case 'ELECTION_VOTING': {
          sim.castVote('human', 'JA');
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
        case 'LEGISLATIVE_VETO_RESPONSE': {
          sim.respondToVeto('human', true);
          break;
        }
        case 'CLAIM_DEBATE': {
          if (s.currentClaim && !s.currentClaim.presidentClaimed && s.currentClaim.presidentId === 'human') {
            sim.submitPresidentClaim('human', s.actualPresidentDrawn, s.presidentHand);
          } else if (s.currentClaim && !s.currentClaim.chancellorClaimed && s.currentClaim.chancellorId === 'human') {
            sim.submitChancellorClaim('human', s.presidentHand);
          } else {
            sim.finishClaimDebate();
          }
          break;
        }
        case 'EXECUTIVE_INVESTIGATE': {
          const t = sim.getInvestigablePlayers('human')[0].id;
          sim.investigateLoyalty('human', t);
          break;
        }
        case 'EXECUTIVE_SPECIAL_ELECTION': {
          const t = sim.getAlivePlayers().find((p) => p.id !== 'human')!.id;
          sim.callSpecialElection('human', t);
          break;
        }
        case 'EXECUTIVE_PEEK': {
          sim.completePolicyPeek('human');
          break;
        }
        case 'EXECUTIVE_EXECUTION': {
          const t = sim.getAlivePlayers().find((p) => p.id !== 'human')!.id;
          sim.executePlayer('human', t);
          break;
        }
      }
    }

    const end = sim.getState();
    assert.equal(end.phase, 'GAME_OVER');
    assert.ok(end.winner === 'LIBERAL' || end.winner === 'FASCIST');
    console.log(
      `✓ Test 5 (${count} Kişilik Simülasyon): ${end.round} turda bitti -> ${end.winner} (${end.winReason}) L:${end.liberalPolicies}/5, F:${end.fascistPolicies}/6`
    );
  }
}

console.log('=== Secret Hitler Tam Kural Motoru (5–10 Kişi + Veto + Yetkiler) Testleri ===');
test5To10PlayerDistributionsAndSecrecy();
testInvestigateAndSpecialElectionOrder();
testVetoUnlockRejectAndAcceptChaos();
testClaimContradictionDetection();
testFullOfflineSimulations5And8Players();
testStaggeredBotStepping();
console.log('=== TÜM TESTLER BAŞARIYLA GEÇTİ ===');
