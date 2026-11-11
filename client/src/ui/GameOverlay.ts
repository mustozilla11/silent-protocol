import type { GameEngine, PlayerView, Policy } from '../engine/index.ts';

type PaceMode = 'slow' | 'normal' | 'manual' | 'fast';

const PACE_MULTIPLIER: Record<Exclude<PaceMode, 'manual'>, number> = {
  slow: 1.65,
  normal: 1.0,
  fast: 0.35,
};

interface EventToast {
  title: string;
  detail: string;
  tone: 'blue' | 'red' | 'amber' | 'emerald';
}

/**
 * 5–10 Kişilik Tam Kapasiteli Secret Hitler HTML/Tailwind UI Overlay Katmanı.
 * Okunabilir tempo (adım adım bot oylaması, duraklatma, hız ayarı, sonuç özeti ve canlı sayaç) içerir.
 */
export class GameOverlay {
  private readonly root: HTMLElement;
  private readonly engine: GameEngine;
  private roleEnvelopeOpen = false;
  private logsOpen = true;
  private botTimerId: number | null = null;
  private countdownIntervalId: number | null = null;
  private unsubscribers: Array<() => void> = [];
  private selectedCount: number;

  // Tempo & Okunabilirlik Durumu
  private paceMode: PaceMode = 'normal';
  private isPaused = false;
  private pendingUntilMs = 0;
  private pendingTotalMs = 0;
  private pendingStatusLabel = '';
  private lastEventToast: EventToast | null = null;
  private justResolvedElection = false;
  private justEnactedPolicy = false;

  // Geri sayım elemanları (tıklama/DOM yeniden çizimi bozmadan anlık güncellenir)
  private countdownTextEl: HTMLElement | null = null;
  private countdownBarEl: HTMLElement | null = null;

  // Beyan formu geçici seçimleri
  private claimDrawnLib = 1;
  private claimPassedLib = 1;
  private claimRecLib = 1;

  constructor(root: HTMLElement, engine: GameEngine) {
    this.root = root;
    this.engine = engine;
    this.selectedCount = engine.getState().playerCount;

    this.root.className =
      'fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-4 font-sans text-stone-100 select-none';

    this.unsubscribers.push(
      this.engine.events.on('ELECTION_RESOLVED', (res) => {
        this.justResolvedElection = true;
        this.lastEventToast = {
          title: res.passed ? '✓ HÜKÜMET ONAYLANDI' : '✕ HÜKÜMET REDDEDİLDİ',
          detail: `${res.jaCount} JA / ${res.neinCount} NEIN${
            !res.passed ? ` • Seçim Sayacı: ${res.electionTracker}/3` : ''
          }`,
          tone: res.passed ? 'emerald' : 'red',
        };
      }),
      this.engine.events.on('POLICY_ENACTED', (ev) => {
        this.justEnactedPolicy = true;
        this.lastEventToast = {
          title:
            ev.policy === 'LIBERAL'
              ? '🔵 LİBERAL POLİTİKA GEÇTİ!'
              : '🔴 FAŞİST POLİTİKA GEÇTİ!',
          detail: `${
            ev.viaChaos ? 'Kaos Kuralı (3/3 Red) ile indi! ' : ''
          }Liberal: ${ev.liberalPolicies}/5 • Faşist: ${ev.fascistPolicies}/6`,
          tone: ev.policy === 'LIBERAL' ? 'blue' : 'red',
        };
      }),
      this.engine.events.on('PLAYER_EXECUTED', (ev) => {
        const target = this.engine.getState().players.find((p) => p.id === ev.targetId);
        this.lastEventToast = {
          title: '💀 İDAM GERÇEKLEŞTİ',
          detail: `${target?.name ?? 'Oyuncu'} masadan kaldırıldı.`,
          tone: 'red',
        };
      }),
      this.engine.events.on('STATE_CHANGED', () => {
        this.render();
        this.scheduleBotsIfNeeded();
      })
    );

    this.countdownIntervalId = window.setInterval(() => this.updateCountdownUI(), 100);
    this.render();
    this.scheduleBotsIfNeeded();
  }

  private computeBotStepConfig(): { delayMs: number; label: string } | null {
    const s = this.engine.getState();
    if (s.phase === 'GAME_OVER' || s.phase === 'SETUP') return null;

    const president = this.engine.getCurrentPresident();
    const chancellor = s.players.find((p) => p.id === s.chancellorId);
    const mult = this.paceMode === 'manual' ? 1.0 : PACE_MULTIPLIER[this.paceMode];

    // Oylama sonucu veya yasa açıldıysa masadakileri incelemek için geniş okuma payı
    const postElectionBonus = this.justResolvedElection ? 5000 : 0;
    const postPolicyBonus = this.justEnactedPolicy ? 4000 : 0;
    const postEventBonus = Math.max(postElectionBonus, postPolicyBonus);

    if (s.phase === 'ELECTION_NOMINATION' && !president.isHuman) {
      return {
        delayMs: Math.round((4500 + postEventBonus) * mult),
        label: this.justResolvedElection
          ? `Son oylama gösteriliyor — Başkan ${president.name} hazırlanıyor`
          : `Başkan ${president.name} Şansölye adayını düşünüyor`,
      };
    }

    if (s.phase === 'ELECTION_VOTING') {
      const nextBot = this.engine.getAlivePlayers().find((p) => !p.isHuman && !s.votes[p.id]);
      if (!nextBot) return null;
      return {
        delayMs: Math.round(1800 * mult),
        label: `${nextBot.name} oyunu hazırlıyor`,
      };
    }

    if (s.phase === 'LEGISLATIVE_PRESIDENT' && !president.isHuman) {
      return {
        delayMs: Math.round((5000 + postElectionBonus) * mult),
        label: this.justResolvedElection
          ? `Oylama sonucu açıklandı — Başkan ${president.name} 3 kart çekiyor`
          : `Başkan ${president.name} 3 politika kartını inceliyor`,
      };
    }

    if (s.phase === 'LEGISLATIVE_CHANCELLOR' && chancellor && !chancellor.isHuman) {
      return {
        delayMs: Math.round(5200 * mult),
        label: `Şansölye ${chancellor.name} gelen 2 kartı inceliyor`,
      };
    }

    if (s.phase === 'LEGISLATIVE_VETO_RESPONSE' && !president.isHuman) {
      return {
        delayMs: Math.round(5000 * mult),
        label: `Başkan ${president.name} Veto talebini değerlendiriyor`,
      };
    }

    if (s.phase === 'CLAIM_DEBATE' && s.currentClaim) {
      const c = s.currentClaim;
      if (!c.presidentClaimed && !president.isHuman) {
        return {
          delayMs: Math.round(4200 * mult),
          label: `Başkan ${president.name} kart beyanını hazırlıyor`,
        };
      }
      if (!c.chancellorClaimed && chancellor && !chancellor.isHuman) {
        return {
          delayMs: Math.round(4200 * mult),
          label: `Şansölye ${chancellor.name} beyanını yanıtlıyor`,
        };
      }
      if (
        c.presidentClaimed &&
        c.chancellorClaimed &&
        !president.isHuman &&
        chancellor &&
        !chancellor.isHuman
      ) {
        const readPause = c.hasConflict ? 11500 : 8500;
        return {
          delayMs: Math.round(readPause * mult),
          label: c.hasConflict
            ? '⚡ Çelişki masada — inceleme süresi'
            : 'Beyanlar masada — okuma süresi',
        };
      }
      return null;
    }

    if (s.phase === 'EXECUTIVE_INVESTIGATE' && !president.isHuman) {
      return {
        delayMs: Math.round(6000 * mult),
        label: `Başkan ${president.name} soruşturma hedefi seçiyor`,
      };
    }

    if (s.phase === 'EXECUTIVE_SPECIAL_ELECTION' && !president.isHuman) {
      return {
        delayMs: Math.round(6000 * mult),
        label: `Başkan ${president.name} Özel Seçim adayı seçiyor`,
      };
    }

    if (s.phase === 'EXECUTIVE_PEEK' && !president.isHuman) {
      return {
        delayMs: Math.round(6000 * mult),
        label: `Başkan ${president.name} destenin üst 3 kartını inceliyor`,
      };
    }

    if (s.phase === 'EXECUTIVE_EXECUTION' && !president.isHuman) {
      return {
        delayMs: Math.round(6500 * mult),
        label: `Başkan ${president.name} idam kararını düşünüyor`,
      };
    }

    return null;
  }

  private scheduleBotsIfNeeded(): void {
    this.clearBotTimer();

    if (this.isPaused) {
      this.pendingUntilMs = 0;
      this.pendingTotalMs = 0;
      this.pendingStatusLabel = '⏸ Oyun Duraklatıldı';
      this.updateCountdownUI();
      return;
    }

    const cfg = this.computeBotStepConfig();
    if (!cfg) {
      this.justResolvedElection = false;
      this.justEnactedPolicy = false;
      this.pendingUntilMs = 0;
      this.pendingTotalMs = 0;
      this.pendingStatusLabel = '';
      this.updateCountdownUI();
      return;
    }

    if (this.paceMode === 'manual') {
      this.pendingUntilMs = 0;
      this.pendingTotalMs = 0;
      this.pendingStatusLabel = `✋ Manuel mod: ${cfg.label} ("▶ Sonraki Adım" tıkla)`;
      this.updateCountdownUI();
      return;
    }

    this.pendingTotalMs = cfg.delayMs;
    this.pendingUntilMs = performance.now() + cfg.delayMs;
    this.pendingStatusLabel = cfg.label;
    this.updateCountdownUI();

    this.botTimerId = window.setTimeout(() => {
      this.botTimerId = null;
      this.justResolvedElection = false;
      this.justEnactedPolicy = false;
      this.engine.stepNextBot();
    }, cfg.delayMs);
  }

  private triggerNextBotImmediately(): void {
    this.clearBotTimer();
    this.justResolvedElection = false;
    this.justEnactedPolicy = false;
    this.engine.stepNextBot();
  }

  private clearBotTimer(): void {
    if (this.botTimerId !== null) {
      window.clearTimeout(this.botTimerId);
      this.botTimerId = null;
    }
  }

  private updateCountdownUI(): void {
    if (!this.countdownTextEl && !this.countdownBarEl) return;

    if (this.isPaused) {
      if (this.countdownTextEl) this.countdownTextEl.textContent = '⏸ Duraklatıldı';
      if (this.countdownBarEl) this.countdownBarEl.style.width = '100%';
      return;
    }

    if (this.paceMode === 'manual' && this.pendingStatusLabel) {
      if (this.countdownTextEl) this.countdownTextEl.textContent = this.pendingStatusLabel;
      if (this.countdownBarEl) this.countdownBarEl.style.width = '100%';
      return;
    }

    if (this.pendingUntilMs <= 0 || this.pendingTotalMs <= 0) return;

    const remMs = Math.max(0, this.pendingUntilMs - performance.now());
    const remSec = Math.ceil(remMs / 1000);
    const pct = Math.max(0, Math.min(100, (remMs / this.pendingTotalMs) * 100));

    if (this.countdownTextEl) {
      this.countdownTextEl.textContent = `⏳ ${this.pendingStatusLabel}... (${remSec}s)`;
    }
    if (this.countdownBarEl) {
      this.countdownBarEl.style.width = `${pct}%`;
    }
  }

  private getPhaseBannerText(view: PlayerView): string {
    const pres = view.players.find((p) => p.id === view.presidentId);
    const chanc = view.players.find((p) => p.id === view.chancellorId);
    const nom = view.players.find((p) => p.id === view.chancellorNomineeId);

    switch (view.phase) {
      case 'ELECTION_NOMINATION':
        return view.presidentId === view.yourId
          ? `${view.isSpecialElectionRound ? 'Özel Başkan Sensin' : 'Başkansın'} — Şansölye adayını seç!`
          : `${view.isSpecialElectionRound ? 'Özel Başkan' : 'Başkan'} ${pres?.name ?? ''} Şansölye adayı seçiyor...`;
      case 'ELECTION_VOTING':
        return `Hükümet Oylaması: Başkan ${pres?.name ?? ''} & Şansölye Adayı ${nom?.name ?? ''}`;
      case 'LEGISLATIVE_PRESIDENT':
        return view.presidentId === view.yourId
          ? 'Başkansın — 3 karttan 1’ini kapalı çöpe at!'
          : `Başkan ${pres?.name ?? ''} 3 kartı inceliyor...`;
      case 'LEGISLATIVE_CHANCELLOR':
        return view.chancellorId === view.yourId
          ? 'Şansölyesin — 2 karttan 1’ini geçir!'
          : `Şansölye ${chanc?.name ?? ''} kart seçiyor...`;
      case 'LEGISLATIVE_VETO_RESPONSE':
        return view.presidentId === view.yourId
          ? 'Şansölye Veto teklif etti! Kabul ediyor musun?'
          : `Başkan ${pres?.name ?? ''} Veto kararını veriyor...`;
      case 'CLAIM_DEBATE':
        return 'Yasama Sonrası Tartışma & Kart Beyanları';
      case 'EXECUTIVE_INVESTIGATE':
        return view.presidentId === view.yourId
          ? 'Soruşturma Yetkisi: Bir oyuncunun Parti Üyeliğine bak!'
          : `Başkan ${pres?.name ?? ''} bağlılık soruşturması yapıyor...`;
      case 'EXECUTIVE_SPECIAL_ELECTION':
        return view.presidentId === view.yourId
          ? 'Özel Seçim: Sıradaki Başkan adayını bizzat seç!'
          : `Başkan ${pres?.name ?? ''} Özel Seçim yapıyor...`;
      case 'EXECUTIVE_PEEK':
        return view.presidentId === view.yourId
          ? 'Yetki: Destenin üstündeki 3 kartı gizlice incele'
          : `Başkan ${pres?.name ?? ''} destenin üstündeki 3 kartı inceliyor...`;
      case 'EXECUTIVE_EXECUTION':
        return view.presidentId === view.yourId
          ? 'İdam Yetkisi — Masadan bir oyuncuyu infaz et!'
          : `Başkan ${pres?.name ?? ''} idam kararı veriyor...`;
      case 'GAME_OVER':
        return view.winner === 'LIBERAL'
          ? 'Oyun Bitti: LİBERALLER KAZANDI!'
          : 'Oyun Bitti: FAŞİSTLER KAZANDI!';
      default:
        return 'Masa Hazırlanıyor...';
    }
  }

  private render(): void {
    const view = this.engine.getPlayerView('human');
    this.selectedCount = view.playerCount;
    this.countdownTextEl = null;
    this.countdownBarEl = null;
    this.root.replaceChildren();

    // =========================================================================
    // 1. ÜST BAR (Gizli Zarf + Tur/Pano Skorları + Hız/Duraklat/Kişi Sayısı)
    // =========================================================================
    const topWrapper = document.createElement('div');
    topWrapper.className = 'w-full flex items-start justify-between gap-2';

    const leftControls = document.createElement('div');
    leftControls.className = 'pointer-events-auto flex flex-col items-start gap-2 shrink-0';

    const roleBtn = document.createElement('button');
    roleBtn.type = 'button';
    roleBtn.className =
      'px-3 py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-amber-500/40 text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap';
    roleBtn.textContent = this.roleEnvelopeOpen ? '👁️ Zarfı Kapat' : '🕵️ Gizli Zarfım';
    roleBtn.addEventListener('click', () => {
      this.roleEnvelopeOpen = !this.roleEnvelopeOpen;
      this.render();
    });
    leftControls.appendChild(roleBtn);

    if (this.roleEnvelopeOpen) {
      leftControls.appendChild(this.buildSecretEnvelopeCard(view));
    }
    if (view.lastInvestigation && view.lastInvestigation.investigatorId === view.yourId) {
      leftControls.appendChild(this.buildInvestigationBadge(view));
    }
    topWrapper.appendChild(leftControls);

    // Orta Üst: Tur Durumu & Skor Çubuğu + Son Olay Özeti
    const centerTopCol = document.createElement('div');
    centerTopCol.className = 'flex flex-col items-center gap-1.5 mx-auto';

    const statusBar = document.createElement('div');
    statusBar.className =
      'pointer-events-auto px-3.5 py-2 rounded-2xl bg-stone-950/90 border border-stone-700/80 backdrop-blur-md shadow-2xl flex flex-wrap items-center justify-center gap-2 text-xs';

    const modeBadge = document.createElement('span');
    modeBadge.className =
      'px-2 py-0.5 rounded bg-stone-800 border border-stone-700 font-mono font-bold text-stone-300';
    modeBadge.textContent = `${view.playerCount} Kişi`;

    const roundBadge = document.createElement('span');
    roundBadge.className =
      'px-2 py-0.5 rounded bg-stone-800 border border-stone-700 font-mono font-bold text-amber-400';
    roundBadge.textContent = `Tur #${view.round}`;

    const phaseText = document.createElement('span');
    phaseText.className = 'font-bold text-sm text-stone-100';
    phaseText.textContent = this.getPhaseBannerText(view);

    const divider = document.createElement('span');
    divider.className = 'text-stone-600 hidden sm:inline';
    divider.textContent = '|';

    const libBadge = document.createElement('span');
    libBadge.className =
      'px-2 py-0.5 rounded bg-blue-950/80 border border-blue-500/50 text-blue-300 font-bold';
    libBadge.textContent = `Liberal: ${view.liberalPolicies}/5`;

    const fascBadge = document.createElement('span');
    fascBadge.className =
      'px-2 py-0.5 rounded bg-red-950/80 border border-red-500/50 text-red-300 font-bold';
    fascBadge.textContent = `Faşist: ${view.fascistPolicies}/6${view.vetoUnlocked ? ' (Veto Açık)' : ''}`;

    const chaosBadge = document.createElement('span');
    chaosBadge.className = `px-2 py-0.5 rounded border font-bold ${
      view.electionTracker >= 2
        ? 'bg-amber-900/70 border-amber-400 text-amber-200 animate-pulse'
        : 'bg-stone-900 border-stone-700 text-stone-300'
    }`;
    chaosBadge.textContent = `Sayaç: ${view.electionTracker}/3`;

    const deckBadge = document.createElement('span');
    deckBadge.className = 'text-[11px] font-mono text-stone-400';
    deckBadge.textContent = `Deste: ${view.drawPileCount} • Çöp: ${view.discardPileCount}`;

    statusBar.append(
      modeBadge,
      roundBadge,
      phaseText,
      divider,
      libBadge,
      fascBadge,
      chaosBadge,
      deckBadge
    );
    centerTopCol.appendChild(statusBar);

    // Son önemli olay bildirimi (Oylama kabul/red, çıkan politika vb. anlık okunur)
    if (this.lastEventToast) {
      const toneMap: Record<EventToast['tone'], string> = {
        blue: 'bg-blue-950/90 border-blue-400 text-blue-100',
        red: 'bg-red-950/90 border-red-400 text-red-100',
        emerald: 'bg-emerald-950/90 border-emerald-400 text-emerald-100',
        amber: 'bg-amber-950/90 border-amber-400 text-amber-100',
      };
      const toastEl = document.createElement('div');
      toastEl.className = `pointer-events-auto px-3.5 py-1 rounded-full border text-xs font-bold shadow-lg backdrop-blur-md flex items-center gap-2 ${
        toneMap[this.lastEventToast.tone]
      }`;
      toastEl.textContent = `${this.lastEventToast.title} — ${this.lastEventToast.detail}`;
      centerTopCol.appendChild(toastEl);
    }

    topWrapper.appendChild(centerTopCol);

    // Sağ Üst: Oyun Hızı (Yavaş/Normal/Hızlı) + Duraklat + Kişi Sayısı + Yeni Oyun
    const rightControls = document.createElement('div');
    rightControls.className = 'pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 shrink-0';

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = `px-2.5 py-2 rounded-xl border text-xs font-bold shadow-xl backdrop-blur-md cursor-pointer transition ${
      this.isPaused
        ? 'bg-amber-500 text-stone-950 border-amber-300'
        : 'bg-stone-900/90 hover:bg-stone-800 border-stone-700 text-stone-200'
    }`;
    pauseBtn.textContent = this.isPaused ? '▶ Devam' : '⏸ Duraklat';
    pauseBtn.title = 'Akışı durdurup oy ve kayıtları rahatça okuyabilirsin';
    pauseBtn.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      this.render();
      this.scheduleBotsIfNeeded();
    });

    const paceSelect = document.createElement('select');
    paceSelect.className =
      'px-2 py-2 rounded-xl bg-stone-900/90 border border-stone-700 text-xs font-bold text-stone-200 shadow-xl backdrop-blur-md cursor-pointer focus:outline-none focus:border-amber-500';
    paceSelect.title = 'Bot & Oyun Akış Hızı';
    [
      ['manual', '✋ Manuel (Tıkla İlerle)'],
      ['slow', '🐢 Çok Yavaş'],
      ['normal', '⚖️ Rahat (Varsayılan)'],
      ['fast', '⚡ Hızlı'],
    ].forEach(([val, lbl]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = lbl;
      if (val === this.paceMode) opt.selected = true;
      paceSelect.appendChild(opt);
    });
    paceSelect.addEventListener('change', () => {
      this.paceMode = paceSelect.value as PaceMode;
      this.scheduleBotsIfNeeded();
    });

    const countSelect = document.createElement('select');
    countSelect.className =
      'px-2 py-2 rounded-xl bg-stone-900/90 border border-stone-700 text-xs font-bold text-stone-200 shadow-xl backdrop-blur-md cursor-pointer focus:outline-none focus:border-amber-500';
    countSelect.title = 'Masadaki Kişi Sayısı (5-10)';
    for (let n = 5; n <= 10; n++) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = `${n} Kişi`;
      if (n === this.selectedCount) opt.selected = true;
      countSelect.appendChild(opt);
    }
    countSelect.addEventListener('change', () => {
      this.selectedCount = Number(countSelect.value);
      this.roleEnvelopeOpen = false;
      this.lastEventToast = null;
      this.isPaused = false;
      this.engine.startNewGame({ playerCount: this.selectedCount, humanName: 'Sen' });
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className =
      'px-2.5 py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-stone-700 text-xs font-bold text-stone-200 shadow-xl backdrop-blur-md transition cursor-pointer whitespace-nowrap';
    resetBtn.textContent = '↻ Yeni';
    resetBtn.addEventListener('click', () => {
      this.roleEnvelopeOpen = false;
      this.lastEventToast = null;
      this.isPaused = false;
      this.engine.startNewGame({ playerCount: this.selectedCount, humanName: 'Sen' });
    });

    rightControls.append(pauseBtn, paceSelect, countSelect, resetBtn);
    topWrapper.appendChild(rightControls);
    this.root.appendChild(topWrapper);

    // =========================================================================
    // 2. ALT ALAN: OYUNCU DURUMLARI + AKTİF KARAR / BEKLEME PANELİ + KAYITLAR
    // =========================================================================
    const bottomWrapper = document.createElement('div');
    bottomWrapper.className = 'w-full flex flex-col md:flex-row items-end justify-between gap-2.5';

    bottomWrapper.appendChild(this.buildPlayersStrip(view));

    const actionPanel = this.buildPhaseActionPanel(view);
    if (actionPanel) {
      bottomWrapper.appendChild(actionPanel);
    }

    bottomWrapper.appendChild(this.buildLogsPanel(view));
    this.root.appendChild(bottomWrapper);
    this.updateCountdownUI();
  }

  private buildBotWaitFooter(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'pt-2 border-t border-stone-800 space-y-1.5';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-center justify-between gap-2 text-[11px]';

    const statusText = document.createElement('span');
    statusText.className = 'text-amber-300 font-semibold';
    this.countdownTextEl = statusText;

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className =
      'shrink-0 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-[10px] font-black text-stone-950 cursor-pointer';
    skipBtn.textContent = this.paceMode === 'manual' ? '▶ Sonraki Adım' : '⏭ Geç';
    skipBtn.addEventListener('click', () => this.triggerNextBotImmediately());

    topRow.append(statusText, skipBtn);

    const barTrack = document.createElement('div');
    barTrack.className = 'w-full h-1.5 bg-stone-800 rounded-full overflow-hidden';

    const barFill = document.createElement('div');
    barFill.className = 'h-full bg-amber-500 transition-[width] duration-100';
    this.countdownBarEl = barFill;

    barTrack.appendChild(barFill);
    wrap.append(topRow, barTrack);
    return wrap;
  }

  private buildSecretEnvelopeCard(view: PlayerView): HTMLElement {
    const card = document.createElement('div');
    const roleColor =
      view.yourRole === 'LIBERAL'
        ? 'border-blue-500/70 bg-slate-950/95 text-blue-100'
        : view.yourRole === 'FASCIST'
        ? 'border-red-500/70 bg-stone-950/95 text-red-100'
        : 'border-purple-500/70 bg-stone-950/95 text-purple-100';

    card.className = `w-72 p-3.5 rounded-2xl border-2 shadow-2xl backdrop-blur-md space-y-2.5 text-xs ${roleColor}`;

    const roleHeader = document.createElement('div');
    roleHeader.className = 'flex items-center justify-between gap-2';

    const roleTitle = document.createElement('span');
    roleTitle.className = 'text-sm font-black tracking-wide uppercase';
    roleTitle.textContent =
      view.yourRole === 'LIBERAL'
        ? '🕊️ GİZLİ ROL: LİBERAL'
        : view.yourRole === 'FASCIST'
        ? '🔥 GİZLİ ROL: FAŞİST'
        : '💀 GİZLİ ROL: HITLER';

    const partyPill = document.createElement('span');
    partyPill.className = `px-2 py-0.5 rounded font-black text-[10px] border ${
      view.yourParty === 'LIBERAL'
        ? 'bg-blue-700/80 border-blue-400 text-white'
        : 'bg-red-700/80 border-red-400 text-white'
    }`;
    partyPill.textContent = `PARTİ: ${view.yourParty === 'LIBERAL' ? 'LİBERAL' : 'FAŞİST'}`;

    roleHeader.append(roleTitle, partyPill);

    const desc = document.createElement('p');
    desc.className = 'text-[11px] opacity-85 leading-relaxed';
    desc.textContent =
      view.yourRole === 'LIBERAL'
        ? '5 Liberal politika geçir veya Hitler’i tespit edip idam ettir. Parti kartın: Liberal.'
        : view.yourRole === 'FASCIST'
        ? 'Hitler’i koru! 6 Faşist politika geçir ya da 3+ Faşist karttan sonra Hitler’i Şansölye yaptır.'
        : 'Parti kartında da "Faşist" yazar! 3+ Faşist politikadan sonra Şansölye seçilirsen kazanırsın.';

    card.append(roleHeader, desc);

    const nightBox = document.createElement('div');
    nightBox.className = 'pt-2 border-t border-white/15 space-y-1 text-[11px]';

    if (view.yourRole === 'LIBERAL') {
      nightBox.textContent = '🌙 Gece Fazı: Liberaller kimlerin ne olduğunu bilmez.';
    } else if (view.yourRole === 'FASCIST') {
      const allyNames = view.knownFascists
        .filter((id) => id !== view.yourId)
        .map((id) => view.players.find((p) => p.id === id)?.name)
        .filter(Boolean);
      const hName = view.players.find((p) => p.id === view.knownHitlerId)?.name ?? '';
      nightBox.textContent =
        allyNames.length > 0
          ? `🌙 Gece Fazı: Faşist Ortakların: ${allyNames.join(', ')} • Hitler: ${hName}`
          : `🌙 Gece Fazı: Hitler: ${hName}`;
    } else {
      if (view.hitlerKnowsAllies) {
        const allyNames = view.knownFascists
          .map((id) => view.players.find((p) => p.id === id)?.name)
          .filter(Boolean);
        nightBox.textContent = `🌙 5–6 Kişi Kuralı: Faşist ortağını tanıyorsun -> ${allyNames.join(', ')}`;
      } else {
        nightBox.textContent =
          '🌙 7–10 Kişi Kuralı (Kör Hitler): Takım arkadaşlarını BİLMİYORSUN! Faşistler seni koruyana dek saf Liberal gibi oyna.';
      }
    }

    card.appendChild(nightBox);
    return card;
  }

  private buildInvestigationBadge(view: PlayerView): HTMLElement {
    const inv = view.lastInvestigation!;
    const targetName = view.players.find((p) => p.id === inv.targetId)?.name ?? '';
    const badge = document.createElement('div');
    badge.className = `px-3 py-2 rounded-xl border text-xs font-bold shadow-xl backdrop-blur-md ${
      inv.partyMembership === 'FASCIST'
        ? 'bg-red-950/90 border-red-500 text-red-200'
        : 'bg-blue-950/90 border-blue-500 text-blue-200'
    }`;
    badge.textContent = `🔍 Soruşturma (Tur #${inv.round}): ${targetName} Parti Kartı = ${
      inv.partyMembership === 'FASCIST' ? 'FAŞİST' : 'LİBERAL'
    }`;
    return badge;
  }

  private buildPlayersStrip(view: PlayerView): HTMLElement {
    const strip = document.createElement('div');
    strip.className =
      'pointer-events-auto flex flex-wrap gap-1.5 bg-stone-950/85 border border-stone-800 p-2 rounded-2xl backdrop-blur-md shadow-xl max-w-md';

    for (const p of view.players) {
      const pill = document.createElement('div');
      const isPres = p.id === view.presidentId;
      const isChanc = p.id === view.chancellorId;
      const isNom = p.id === view.chancellorNomineeId;

      pill.className = `px-2 py-1 rounded-xl border text-[11px] flex flex-col gap-0.5 ${
        !p.isAlive
          ? 'opacity-40 line-through border-stone-800 bg-stone-900'
          : isPres
          ? 'border-amber-500/80 bg-amber-950/40'
          : isChanc || isNom
          ? 'border-emerald-500/70 bg-emerald-950/30'
          : 'border-stone-700/70 bg-stone-900/80'
      }`;

      const nameRow = document.createElement('div');
      nameRow.className = 'font-bold flex items-center gap-1';
      nameRow.textContent =
        (p.isHuman && p.name !== 'Sen' ? `${p.name} (Sen)` : p.name) +
        (p.wasInvestigated ? ' 🔍' : '');
      pill.appendChild(nameRow);

      const metaRow = document.createElement('div');
      metaRow.className = 'flex items-center gap-1 text-[10px]';

      if (isPres) {
        const badge = document.createElement('span');
        badge.className = 'px-1 rounded bg-amber-500 text-black font-black';
        badge.textContent = view.isSpecialElectionRound ? 'Ö.BAŞKAN' : 'BAŞKAN';
        metaRow.appendChild(badge);
      }
      if (isChanc) {
        const badge = document.createElement('span');
        badge.className = 'px-1 rounded bg-emerald-500 text-black font-black';
        badge.textContent = 'ŞANSÖLYE';
        metaRow.appendChild(badge);
      } else if (isNom) {
        const badge = document.createElement('span');
        badge.className = 'px-1 rounded bg-emerald-700 text-white font-bold';
        badge.textContent = 'ADAY';
        metaRow.appendChild(badge);
      }

      if (view.phase === 'ELECTION_VOTING') {
        const voted = view.votedPlayerIds.includes(p.id);
        const vSpan = document.createElement('span');
        vSpan.className = voted ? 'text-amber-400 font-bold' : 'text-stone-500';
        vSpan.textContent = voted ? '• Oy Verdi' : '• Bekliyor';
        metaRow.appendChild(vSpan);
      } else if (view.revealedVotes?.[p.id]) {
        const v = view.revealedVotes[p.id];
        const vSpan = document.createElement('span');
        vSpan.className = `px-1 rounded font-bold ${
          v === 'JA' ? 'bg-emerald-600/80 text-white' : 'bg-red-700/80 text-white'
        }`;
        vSpan.textContent = v;
        metaRow.appendChild(vSpan);
      }

      if (p.revealedRole && view.phase === 'GAME_OVER') {
        const rSpan = document.createElement('span');
        rSpan.className =
          p.revealedRole === 'LIBERAL'
            ? 'text-blue-400 font-bold'
            : p.revealedRole === 'HITLER'
            ? 'text-purple-400 font-bold'
            : 'text-red-400 font-bold';
        rSpan.textContent = p.revealedRole;
        metaRow.appendChild(rSpan);
      }

      pill.appendChild(metaRow);
      strip.appendChild(pill);
    }

    return strip;
  }

  private buildPhaseActionPanel(view: PlayerView): HTMLElement | null {
    const panel = document.createElement('div');
    panel.className =
      'pointer-events-auto p-3.5 rounded-2xl bg-stone-950/95 border border-stone-700 shadow-2xl backdrop-blur-md min-w-[310px] max-w-md space-y-2.5';

    const botStep = this.computeBotStepConfig();
    const attachBotWaitIfNeeded = () => {
      if (botStep || this.isPaused) {
        panel.appendChild(this.buildBotWaitFooter());
      }
    };

    // 1. BAŞKAN ADAY SEÇİYOR
    if (view.phase === 'ELECTION_NOMINATION') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent =
        view.presidentId === view.yourId ? 'Şansölye Adayı Seç' : 'Yeni Tur — Aday Belirleniyor';
      panel.appendChild(title);

      if (view.presidentId === view.yourId) {
        const eligible = this.engine.getEligibleChancellorNominees();
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-1.5';

        for (const cand of eligible) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'px-2.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-xs transition cursor-pointer';
          btn.textContent = `${cand.name} (Seç)`;
          btn.addEventListener('click', () => {
            this.engine.nominateChancellor(view.yourId, cand.id);
          });
          grid.appendChild(btn);
        }
        panel.appendChild(grid);
      } else {
        const info = document.createElement('p');
        info.className = 'text-xs text-stone-300';
        info.textContent = this.getPhaseBannerText(view);
        panel.appendChild(info);
        attachBotWaitIfNeeded();
      }
      return panel;
    }

    // 2. OYLAMA (JA / NEIN)
    if (view.phase === 'ELECTION_VOTING') {
      const presName = view.players.find((p) => p.id === view.presidentId)?.name ?? '';
      const nomName =
        view.players.find((p) => p.id === view.chancellorNomineeId)?.name ?? '';

      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = `Güven Oylaması (${view.votedPlayerIds.length}/${
        view.players.filter((p) => p.isAlive).length
      })`;

      const subtitle = document.createElement('p');
      subtitle.className = 'text-xs text-stone-200';
      subtitle.textContent = `Başkan ${presName} & Şansölye Adayı ${nomName} hükümetini onaylıyor musun?`;
      panel.append(title, subtitle);

      const me = view.players.find((p) => p.id === view.yourId);
      const alreadyVoted = view.votedPlayerIds.includes(view.yourId);

      if (!me?.isAlive) {
        const deadMsg = document.createElement('div');
        deadMsg.className = 'text-xs text-red-400 font-bold';
        deadMsg.textContent = 'İdam edildiğin için oylamaya katılamazsın.';
        panel.appendChild(deadMsg);
        attachBotWaitIfNeeded();
      } else if (alreadyVoted) {
        const waitMsg = document.createElement('div');
        waitMsg.className =
          'p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold text-center';
        waitMsg.textContent = 'Oyun kaydedildi — masadaki oylar sırayla açılıyor...';
        panel.appendChild(waitMsg);
        attachBotWaitIfNeeded();
      } else {
        const btnRow = document.createElement('div');
        btnRow.className = 'grid grid-cols-2 gap-2';

        const jaBtn = document.createElement('button');
        jaBtn.type = 'button';
        jaBtn.className =
          'py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-lg transition cursor-pointer';
        jaBtn.textContent = '✓ JA! (Evet)';
        jaBtn.addEventListener('click', () => {
          this.engine.castVote(view.yourId, 'JA');
        });

        const neinBtn = document.createElement('button');
        neinBtn.type = 'button';
        neinBtn.className =
          'py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm shadow-lg transition cursor-pointer';
        neinBtn.textContent = '✕ NEIN! (Hayır)';
        neinBtn.addEventListener('click', () => {
          this.engine.castVote(view.yourId, 'NEIN');
        });

        btnRow.append(jaBtn, neinBtn);
        panel.appendChild(btnRow);
      }
      return panel;
    }

    // 3. YASAMA — BAŞKAN
    if (view.phase === 'LEGISLATIVE_PRESIDENT') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = 'Yasama — Başkan Seçimi (İletişim Yasak)';
      panel.appendChild(title);

      if (view.presidentId === view.yourId && view.presidentHand) {
        const hint = document.createElement('p');
        hint.className = 'text-xs text-stone-300';
        hint.textContent =
          'Çekilen 3 karttan kapalı çöpe atmak istediğin 1 kartı seç (kalan 2’si Şansölyeye gider):';
        panel.appendChild(hint);

        panel.appendChild(
          this.buildPolicyChoiceRow(view.presidentHand, 'Çöpe At', (idx) => {
            this.engine.discardPolicyByPresident(view.yourId, idx);
          })
        );
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
        attachBotWaitIfNeeded();
      }
      return panel;
    }

    // 4. YASAMA — ŞANSÖLYE
    if (view.phase === 'LEGISLATIVE_CHANCELLOR') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-emerald-400';
      title.textContent = 'Yasama — Şansölye Seçimi (İletişim Yasak)';
      panel.appendChild(title);

      if (view.chancellorId === view.yourId && view.chancellorHand) {
        const hint = document.createElement('p');
        hint.className = 'text-xs text-stone-300';
        hint.textContent = view.vetoRejectedThisTurn
          ? 'Başkan Vetoyu reddetti — 2 karttan birini yasalaştırmak zorundasın:'
          : 'Başkandan gelen 2 karttan panoya koymak istediğini seç:';
        panel.appendChild(hint);

        panel.appendChild(
          this.buildPolicyChoiceRow(view.chancellorHand, 'Yasalaştır', (idx) => {
            this.engine.enactPolicyByChancellor(view.yourId, idx);
          })
        );

        if (view.vetoUnlocked && !view.vetoRejectedThisTurn) {
          const vetoBtn = document.createElement('button');
          vetoBtn.type = 'button';
          vetoBtn.className =
            'w-full py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500 text-amber-300 font-black text-xs cursor-pointer transition';
          vetoBtn.textContent = '⚖️ Veto Teklif Et (Başkan Onaylarsa Kartlar Çöpe Gider)';
          vetoBtn.addEventListener('click', () => {
            this.engine.proposeVeto(view.yourId);
          });
          panel.appendChild(vetoBtn);
        }
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
        attachBotWaitIfNeeded();
      }
      return panel;
    }

    // 5. VETO YANIT
    if (view.phase === 'LEGISLATIVE_VETO_RESPONSE') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = '⚖️ Veto Talebi';
      panel.appendChild(title);

      if (view.presidentId === view.yourId) {
        const p = document.createElement('p');
        p.className = 'text-xs text-stone-300';
        p.textContent =
          'Şansölye elindeki 2 kartı veto etmek istiyor. Kabul edersen her iki kart çöpe gider ve Seçim Sayacı +1 ilerler.';
        const row = document.createElement('div');
        row.className = 'grid grid-cols-2 gap-2';

        const acc = document.createElement('button');
        acc.type = 'button';
        acc.className =
          'py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs cursor-pointer';
        acc.textContent = '✓ Vetoyu Kabul Et';
        acc.addEventListener('click', () => this.engine.respondToVeto(view.yourId, true));

        const rej = document.createElement('button');
        rej.type = 'button';
        rej.className =
          'py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs cursor-pointer';
        rej.textContent = '✕ Vetoyu Reddet';
        rej.addEventListener('click', () => this.engine.respondToVeto(view.yourId, false));

        row.append(acc, rej);
        panel.append(p, row);
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
        attachBotWaitIfNeeded();
      }
      return panel;
    }

    // 6. KART SONRASI BEYAN & ÇELİŞKİ TARTIŞMASI
    if (view.phase === 'CLAIM_DEBATE' && view.currentClaim) {
      const c = view.currentClaim;
      const presName = view.players.find((p) => p.id === c.presidentId)?.name ?? '';
      const chancName = view.players.find((p) => p.id === c.chancellorId)?.name ?? '';

      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = '💬 Tartışma & Kart Beyanları';
      panel.appendChild(title);

      const summary = document.createElement('div');
      summary.className = 'text-[11px] space-y-1 bg-stone-900/90 p-2.5 rounded-xl border border-stone-800';
      const line1 = document.createElement('div');
      line1.textContent = c.presidentClaimed
        ? `• Başkan ${presName}: "${this.formatHandText(c.presidentDrawn!)} çektim, ${this.formatHandText(c.presidentPassed!)} verdim."`
        : `• Başkan ${presName} beyan hazırlıyor...`;
      const line2 = document.createElement('div');
      line2.textContent = c.chancellorClaimed
        ? `• Şansölye ${chancName}: "Bana ${this.formatHandText(c.chancellorReceived!)} geldi."`
        : `• Şansölye ${chancName} beyan hazırlıyor...`;
      summary.append(line1, line2);
      panel.appendChild(summary);

      if (c.hasConflict) {
        const alert = document.createElement('div');
        alert.className =
          'p-2 rounded-xl bg-red-600/30 border border-red-500 text-red-200 text-xs font-black';
        alert.textContent = `⚡ ${c.conflictSummary}`;
        panel.appendChild(alert);
      }

      if (c.presidentId === view.yourId && !c.presidentClaimed) {
        panel.appendChild(this.buildPresidentClaimForm(view.yourId));
      } else if (c.chancellorId === view.yourId && !c.chancellorClaimed) {
        panel.appendChild(this.buildChancellorClaimForm(view.yourId));
      } else if (c.presidentClaimed && c.chancellorClaimed) {
        const contBtn = document.createElement('button');
        contBtn.type = 'button';
        contBtn.className =
          'w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs cursor-pointer';
        contBtn.textContent = 'Tartışmayı Bitir / Devam Et →';
        contBtn.addEventListener('click', () => {
          this.clearBotTimer();
          this.engine.finishClaimDebate();
        });
        panel.appendChild(contBtn);
        attachBotWaitIfNeeded();
      } else {
        attachBotWaitIfNeeded();
      }

      return panel;
    }

    // 7. YETKİ: BAĞLILIK SORUŞTURMASI
    if (view.phase === 'EXECUTIVE_INVESTIGATE') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-purple-400';
      title.textContent = '🔍 Bağlılık Soruşturması';
      panel.appendChild(title);

      if (view.presidentId === view.yourId) {
        const hint = document.createElement('p');
        hint.className = 'text-[11px] text-stone-300';
        hint.textContent =
          'Parti Üyeliği kartını görmek istediğin oyuncuyu seç (Hitler de Faşist görünür):';
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-1.5';
        for (const t of this.engine.getInvestigablePlayers(view.yourId)) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'px-2.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer';
          btn.textContent = `🔍 ${t.name}`;
          btn.addEventListener('click', () => {
            this.engine.investigateLoyalty(view.yourId, t.id);
          });
          grid.appendChild(btn);
        }
        panel.append(hint, grid);
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
        attachBotWaitIfNeeded();
      }
      return panel;
    }

    // 8. YETKİ: ÖZEL SEÇİM
    if (view.phase === 'EXECUTIVE_SPECIAL_ELECTION') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = '🗳️ Özel Seçim Yetkisi';
      panel.appendChild(title);

      if (view.presidentId === view.yourId) {
        const hint = document.createElement('p');
        hint.className = 'text-[11px] text-stone-300';
        hint.textContent = 'Sıradaki turun Başkan adayını seç (sonrasında normal sıra devam eder):';
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-1.5';
        for (const t of view.players) {
          if (!t.isAlive || t.id === view.yourId) continue;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'px-2.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs cursor-pointer';
          btn.textContent = `★ ${t.name}`;
          btn.addEventListener('click', () => {
            this.engine.callSpecialElection(view.yourId, t.id);
          });
          grid.appendChild(btn);
        }
        panel.append(hint, grid);
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
        attachBotWaitIfNeeded();
      }
      return panel;
    }

    // 9. YETKİ: DESTEYE GÖZ ATMA
    if (view.phase === 'EXECUTIVE_PEEK') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = '👁️ Kart İnceleme (Üst 3 Kart)';
      panel.appendChild(title);

      if (view.presidentId === view.yourId && view.peekedCards) {
        const row = document.createElement('div');
        row.className = 'flex gap-2';
        view.peekedCards.forEach((pol, i) => {
          const pill = document.createElement('div');
          pill.className = `flex-1 py-2 px-2 rounded-xl text-center text-xs font-black border ${
            pol === 'LIBERAL'
              ? 'bg-blue-700 border-blue-400 text-white'
              : 'bg-red-700 border-red-400 text-white'
          }`;
          pill.textContent = `#${i + 1}: ${pol}`;
          row.appendChild(pill);
        });
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className =
          'w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs cursor-pointer';
        doneBtn.textContent = 'İncelemeyi Tamamla';
        doneBtn.addEventListener('click', () => {
          this.engine.completePolicyPeek(view.yourId);
        });
        panel.append(row, doneBtn);
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
        attachBotWaitIfNeeded();
      }
      return panel;
    }

    // 10. YETKİ: İDAM
    if (view.phase === 'EXECUTIVE_EXECUTION') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-red-400';
      title.textContent = '💀 İdam Yetkisi';
      panel.appendChild(title);

      if (view.presidentId === view.yourId) {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-1.5';
        for (const target of view.players) {
          if (!target.isAlive || target.id === view.yourId) continue;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'px-2.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition cursor-pointer';
          btn.textContent = `💀 ${target.name}`;
          btn.addEventListener('click', () => {
            this.engine.executePlayer(view.yourId, target.id);
          });
          grid.appendChild(btn);
        }
        panel.appendChild(grid);
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
        attachBotWaitIfNeeded();
      }
      return panel;
    }

    // 11. OYUN SONU
    if (view.phase === 'GAME_OVER') {
      const isLibWin = view.winner === 'LIBERAL';
      const title = document.createElement('div');
      title.className = `text-base font-black text-center ${
        isLibWin ? 'text-blue-400' : 'text-red-400'
      }`;
      title.textContent = isLibWin ? '🏆 LİBERALLER KAZANDI!' : '🔥 FAŞİSTLER KAZANDI!';

      const reason = document.createElement('p');
      reason.className = 'text-xs text-stone-300 text-center';
      reason.textContent = this.translateWinReason(view.winReason);

      const againBtn = document.createElement('button');
      againBtn.type = 'button';
      againBtn.className =
        'w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs cursor-pointer';
      againBtn.textContent = '🔄 Yeniden Oyna';
      againBtn.addEventListener('click', () => {
        this.roleEnvelopeOpen = false;
        this.lastEventToast = null;
        this.isPaused = false;
        this.engine.startNewGame({ playerCount: this.selectedCount, humanName: 'Sen' });
      });

      panel.append(title, reason, againBtn);
      return panel;
    }

    return null;
  }

  private buildPresidentClaimForm(presidentId: string): HTMLElement {
    const box = document.createElement('div');
    box.className = 'space-y-2 text-xs';

    const row = document.createElement('div');
    row.className = 'grid grid-cols-2 gap-1.5';

    const drawnSel = document.createElement('select');
    drawnSel.className = 'bg-stone-900 border border-stone-700 rounded-lg p-1.5 text-xs';
    [
      [3, 'Çekilen: 3L, 0F'],
      [2, 'Çekilen: 2L, 1F'],
      [1, 'Çekilen: 1L, 2F'],
      [0, 'Çekilen: 0L, 3F'],
    ].forEach(([val, lbl]) => {
      const o = document.createElement('option');
      o.value = String(val);
      o.textContent = String(lbl);
      if (val === this.claimDrawnLib) o.selected = true;
      drawnSel.appendChild(o);
    });
    drawnSel.addEventListener('change', () => {
      this.claimDrawnLib = Number(drawnSel.value);
    });

    const passedSel = document.createElement('select');
    passedSel.className = 'bg-stone-900 border border-stone-700 rounded-lg p-1.5 text-xs';
    [
      [2, 'Verilen: 2L, 0F'],
      [1, 'Verilen: 1L, 1F'],
      [0, 'Verilen: 0L, 2F'],
    ].forEach(([val, lbl]) => {
      const o = document.createElement('option');
      o.value = String(val);
      o.textContent = String(lbl);
      if (val === this.claimPassedLib) o.selected = true;
      passedSel.appendChild(o);
    });
    passedSel.addEventListener('change', () => {
      this.claimPassedLib = Number(passedSel.value);
    });

    row.append(drawnSel, passedSel);

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className =
      'w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs cursor-pointer';
    submit.textContent = 'Başkan Beyanını Masaya Sun';
    submit.addEventListener('click', () => {
      const drawn: Policy[] = [
        ...Array<Policy>(this.claimDrawnLib).fill('LIBERAL'),
        ...Array<Policy>(3 - this.claimDrawnLib).fill('FASCIST'),
      ];
      const passed: Policy[] = [
        ...Array<Policy>(this.claimPassedLib).fill('LIBERAL'),
        ...Array<Policy>(2 - this.claimPassedLib).fill('FASCIST'),
      ];
      this.engine.submitPresidentClaim(presidentId, drawn, passed);
    });

    box.append(row, submit);
    return box;
  }

  private buildChancellorClaimForm(chancellorId: string): HTMLElement {
    const box = document.createElement('div');
    box.className = 'space-y-2 text-xs';

    const sel = document.createElement('select');
    sel.className = 'w-full bg-stone-900 border border-stone-700 rounded-lg p-1.5 text-xs';
    [
      [2, 'Bana 2 Liberal Geldi'],
      [1, 'Bana 1 Liberal, 1 Faşist Geldi'],
      [0, 'Bana 2 Faşist Geldi'],
    ].forEach(([val, lbl]) => {
      const o = document.createElement('option');
      o.value = String(val);
      o.textContent = String(lbl);
      if (val === this.claimRecLib) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      this.claimRecLib = Number(sel.value);
    });

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className =
      'w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs cursor-pointer';
    submit.textContent = 'Şansölye Beyanını Masaya Sun';
    submit.addEventListener('click', () => {
      const received: Policy[] = [
        ...Array<Policy>(this.claimRecLib).fill('LIBERAL'),
        ...Array<Policy>(2 - this.claimRecLib).fill('FASCIST'),
      ];
      this.engine.submitChancellorClaim(chancellorId, received);
    });

    box.append(sel, submit);
    return box;
  }

  private buildPolicyChoiceRow(
    cards: Policy[],
    actionLabel: string,
    onPick: (index: number) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'grid gap-2';
    row.style.gridTemplateColumns = `repeat(${cards.length}, minmax(0, 1fr))`;

    cards.forEach((pol, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `p-2.5 rounded-xl border-2 flex flex-col items-center gap-1 font-black text-xs transition hover:-translate-y-0.5 cursor-pointer ${
        pol === 'LIBERAL'
          ? 'bg-blue-700 hover:bg-blue-600 border-blue-400 text-white'
          : 'bg-red-700 hover:bg-red-600 border-red-400 text-white'
      }`;

      const name = document.createElement('span');
      name.textContent = pol === 'LIBERAL' ? 'LİBERAL' : 'FAŞİST';

      const sub = document.createElement('span');
      sub.className = 'text-[10px] px-1.5 py-0.5 rounded bg-black/40 font-semibold';
      sub.textContent = actionLabel;

      btn.append(name, sub);
      btn.addEventListener('click', () => onPick(idx));
      row.appendChild(btn);
    });

    return row;
  }

  private buildLogsPanel(view: PlayerView): HTMLElement {
    const box = document.createElement('div');
    box.className =
      'pointer-events-auto w-full sm:w-80 rounded-2xl bg-stone-950/90 border border-stone-800 backdrop-blur-md shadow-2xl overflow-hidden';

    const header = document.createElement('button');
    header.type = 'button';
    header.className =
      'w-full px-3 py-2 flex items-center justify-between text-xs font-bold border-b border-stone-800 hover:bg-stone-900 cursor-pointer';

    const label = document.createElement('span');
    label.className = 'text-amber-400 uppercase tracking-wider';
    label.textContent = `📋 Masa Kayıtları (${view.logs.length})`;

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'text-stone-400';
    toggleIcon.textContent = this.logsOpen ? '▼' : '▲';

    header.append(label, toggleIcon);
    header.addEventListener('click', () => {
      this.logsOpen = !this.logsOpen;
      this.render();
    });
    box.appendChild(header);

    if (this.logsOpen) {
      const list = document.createElement('div');
      list.className = 'max-h-36 overflow-y-auto p-2.5 space-y-1 text-[11px] font-mono';
      const recent = view.logs.slice(-12);
      for (const entry of recent) {
        const line = document.createElement('div');
        line.className =
          entry.category === 'victory'
            ? 'text-amber-300 font-bold'
            : entry.category === 'claim'
            ? 'text-rose-300 font-semibold'
            : entry.category === 'executive'
            ? 'text-red-300'
            : entry.category === 'legislative'
            ? 'text-blue-300'
            : 'text-stone-300';
        line.textContent = `[T${entry.round}] ${entry.message}`;
        list.appendChild(line);
      }
      box.appendChild(list);
      list.scrollTop = list.scrollHeight;
    }

    return box;
  }

  private formatHandText(cards: Policy[]): string {
    const lib = cards.filter((c) => c === 'LIBERAL').length;
    const fasc = cards.length - lib;
    return `${lib}L / ${fasc}F`;
  }

  private translateWinReason(reason: PlayerView['winReason']): string {
    switch (reason) {
      case 'LIBERAL_POLICIES':
        return 'Liberal panosuna 5 Liberal politika yerleştirildi!';
      case 'FASCIST_POLICIES':
        return 'Faşist panosuna 6 Faşist politika yerleştirildi!';
      case 'HITLER_CHANCELLOR':
        return '3+ Faşist politika sonrası Hitler Şansölye olarak seçildi!';
      case 'HITLER_EXECUTED':
        return 'İdam yetkisiyle Hitler öldürüldü!';
      default:
        return '';
    }
  }

  dispose(): void {
    this.clearBotTimer();
    if (this.countdownIntervalId !== null) {
      window.clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.root.replaceChildren();
  }
}
