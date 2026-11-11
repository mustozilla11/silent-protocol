import type { GameEngine, PlayerView, Policy } from '../engine/index.ts';

/**
 * Adım 4: Tam Ekran 3D Canvas Üzerine Oturan HTML/CSS (Tailwind) Overlay Katmanı.
 * Tüm metinler, gizli rol kartı, Ja/Nein oylama butonları, politika seçimleri
 * ve üst tur durum çubuğu WebGL dışındaki DOM üzerinde yaşar.
 */
export class GameOverlay {
  private readonly root: HTMLElement;
  private readonly engine: GameEngine;
  private roleCardOpen = false;
  private logsOpen = true;
  private botTimerId: number | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(root: HTMLElement, engine: GameEngine) {
    this.root = root;
    this.engine = engine;

    // #ui-overlay konumu position: absolute olarak 3D canvas üzerine tam oturur
    this.root.className =
      'fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5 font-sans text-stone-100 select-none';

    this.unsubscribe = this.engine.events.on('STATE_CHANGED', () => {
      this.render();
      this.scheduleBotsIfNeeded();
    });

    this.render();
    this.scheduleBotsIfNeeded();
  }

  private scheduleBotsIfNeeded(): void {
    if (this.botTimerId !== null) {
      window.clearTimeout(this.botTimerId);
      this.botTimerId = null;
    }

    const s = this.engine.getState();
    if (s.phase === 'GAME_OVER' || s.phase === 'SETUP') return;

    const president = this.engine.getCurrentPresident();
    const chancellor = s.players.find((p) => p.id === s.chancellorId);

    const needsBot =
      (s.phase === 'ELECTION_NOMINATION' && !president.isHuman) ||
      (s.phase === 'ELECTION_VOTING' &&
        this.engine.getAlivePlayers().some((p) => !p.isHuman && !s.votes[p.id])) ||
      (s.phase === 'LEGISLATIVE_PRESIDENT' && !president.isHuman) ||
      (s.phase === 'LEGISLATIVE_CHANCELLOR' && chancellor !== undefined && !chancellor.isHuman) ||
      (s.phase === 'EXECUTIVE_PEEK' && !president.isHuman) ||
      (s.phase === 'EXECUTIVE_EXECUTION' && !president.isHuman);

    if (!needsBot) return;

    // Oyuncunun aşamaları okuyabilmesi için doğal ~850ms bekleme payı
    this.botTimerId = window.setTimeout(() => {
      this.botTimerId = null;
      this.engine.stepBots();
    }, 850);
  }

  private getPhaseBannerText(view: PlayerView): string {
    const pres = view.players.find((p) => p.id === view.presidentId);
    const chanc = view.players.find((p) => p.id === view.chancellorId);
    const nom = view.players.find((p) => p.id === view.chancellorNomineeId);

    switch (view.phase) {
      case 'ELECTION_NOMINATION':
        return view.presidentId === view.yourId
          ? 'Başkansın — Şansölye adayını seç!'
          : `Başkan ${pres?.name ?? ''} Şansölye adayı seçiyor...`;
      case 'ELECTION_VOTING':
        return `Hükümet Oylaması: Başkan ${pres?.name ?? ''} & Şansölye Adayı ${nom?.name ?? ''}`;
      case 'LEGISLATIVE_PRESIDENT':
        return view.presidentId === view.yourId
          ? 'Başkansın — 3 karttan 1’ini ıskartaya at!'
          : `Başkan ${pres?.name ?? ''} kart seçiyor...`;
      case 'LEGISLATIVE_CHANCELLOR':
        return view.chancellorId === view.yourId
          ? 'Şansölyesin — 2 karttan 1’ini yasalaştır!'
          : `Şansölye ${chanc?.name ?? ''} kart seçiyor...`;
      case 'EXECUTIVE_PEEK':
        return view.presidentId === view.yourId
          ? 'Yetki: Destenin üstündeki 3 kartı incele'
          : `Başkan ${pres?.name ?? ''} destenin üstündeki kartlara göz atıyor...`;
      case 'EXECUTIVE_EXECUTION':
        return view.presidentId === view.yourId
          ? 'İnfaz Yetkisi — Masadan bir oyuncuyu seç!'
          : `Başkan ${pres?.name ?? ''} infaz kararı veriyor...`;
      case 'GAME_OVER':
        return view.winReason ? `Oyun Bitti: ${view.winner === 'LIBERAL' ? 'Liberaller Kazandı' : 'Faşistler Kazandı'}` : 'Oyun Bitti';
      default:
        return 'Masa Hazırlanıyor...';
    }
  }

  private render(): void {
    const view = this.engine.getPlayerView('human');
    this.root.replaceChildren();

    // =========================================================================
    // 1. ÜST BAR (Tur Durumu, Politika Sayaçları, Kaos ve Hızlı Kontroller)
    // =========================================================================
    const topWrapper = document.createElement('div');
    topWrapper.className = 'w-full flex items-start justify-between gap-2';

    // Sol Üst: Gizli Kimlik Butonu & Açılır Rol Kartı
    const leftControls = document.createElement('div');
    leftControls.className = 'pointer-events-auto flex flex-col items-start gap-2 shrink-0';

    const roleBtn = document.createElement('button');
    roleBtn.type = 'button';
    roleBtn.className =
      'px-3 py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-amber-500/40 text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap';
    const lockIcon = document.createElement('span');
    lockIcon.textContent = this.roleCardOpen ? '👁️' : '🕵️';
    const btnLabel = document.createElement('span');
    btnLabel.textContent = this.roleCardOpen ? 'Rolü Gizle' : 'Gizli Rolüm';
    roleBtn.append(lockIcon, btnLabel);
    roleBtn.addEventListener('click', () => {
      this.roleCardOpen = !this.roleCardOpen;
      this.render();
    });
    leftControls.appendChild(roleBtn);

    if (this.roleCardOpen) {
      leftControls.appendChild(this.buildSecretRoleCard(view));
    }
    topWrapper.appendChild(leftControls);

    // Orta Üst: Tur Durumu & Skor Çubuğu
    const statusBar = document.createElement('div');
    statusBar.className =
      'pointer-events-auto mx-auto px-3.5 py-2 rounded-2xl bg-stone-950/90 border border-stone-700/80 backdrop-blur-md shadow-2xl flex flex-wrap items-center justify-center gap-2 text-xs';

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
    fascBadge.textContent = `Faşist: ${view.fascistPolicies}/6`;

    const chaosBadge = document.createElement('span');
    chaosBadge.className = `px-2 py-0.5 rounded border font-bold ${
      view.electionTracker >= 2
        ? 'bg-amber-900/70 border-amber-400 text-amber-200 animate-pulse'
        : 'bg-stone-900 border-stone-700 text-stone-300'
    }`;
    chaosBadge.textContent = `Kaos: ${view.electionTracker}/3`;

    const deckBadge = document.createElement('span');
    deckBadge.className = 'text-[11px] font-mono text-stone-400';
    deckBadge.textContent = `Deste: ${view.drawPileCount} • Iskarta: ${view.discardPileCount}`;

    statusBar.append(
      roundBadge,
      phaseText,
      divider,
      libBadge,
      fascBadge,
      chaosBadge,
      deckBadge
    );
    topWrapper.appendChild(statusBar);

    // Sağ Üst: Yeniden Başlat
    const rightControls = document.createElement('div');
    rightControls.className = 'pointer-events-auto flex items-center gap-2 shrink-0';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className =
      'px-3 py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 border border-stone-700 text-xs font-bold text-stone-200 shadow-xl backdrop-blur-md transition cursor-pointer whitespace-nowrap';
    resetBtn.textContent = '↻ Yeni Oyun';
    resetBtn.addEventListener('click', () => {
      this.roleCardOpen = false;
      this.engine.startNewGame({ humanName: 'Sen' });
    });
    rightControls.appendChild(resetBtn);
    topWrapper.appendChild(rightControls);

    this.root.appendChild(topWrapper);

    // =========================================================================
    // 2. ALT ALAN: OYUNCU DURUMLARI + AKTİF KARAR PANELİ + CANLI KAYITLAR
    // =========================================================================
    const bottomWrapper = document.createElement('div');
    bottomWrapper.className = 'w-full flex flex-col md:flex-row items-end justify-between gap-3';

    // Sol Alt: Masadaki 5 Oyuncunun Rol/Başkan/Şansölye/Oy Durumu Rozetleri
    bottomWrapper.appendChild(this.buildPlayersStrip(view));

    // Orta: Aktif Faz Aksiyon Paneli (Ja/Nein oylama, Aday seçimi, Kart seçimi, Peek/İnfaz, GameOver)
    const actionPanel = this.buildPhaseActionPanel(view);
    if (actionPanel) {
      bottomWrapper.appendChild(actionPanel);
    }

    // Sağ Alt: Açılır/Kapanır Masa Olay Kayıtları
    bottomWrapper.appendChild(this.buildLogsPanel(view));

    this.root.appendChild(bottomWrapper);
  }

  private buildSecretRoleCard(view: PlayerView): HTMLElement {
    const card = document.createElement('div');
    const roleColor =
      view.yourRole === 'LIBERAL'
        ? 'border-blue-500/70 bg-slate-950/95 text-blue-100'
        : view.yourRole === 'FASCIST'
        ? 'border-red-500/70 bg-stone-950/95 text-red-100'
        : 'border-purple-500/70 bg-stone-950/95 text-purple-100';

    card.className = `w-64 p-3.5 rounded-2xl border-2 shadow-2xl backdrop-blur-md space-y-2 text-xs ${roleColor}`;

    const title = document.createElement('div');
    title.className = 'text-sm font-black tracking-wide uppercase';
    title.textContent =
      view.yourRole === 'LIBERAL'
        ? '🕊️ LIBERAL'
        : view.yourRole === 'FASCIST'
        ? '🔥 FAŞİST'
        : '💀 HITLER';

    const desc = document.createElement('p');
    desc.className = 'text-[11px] opacity-85 leading-relaxed';
    desc.textContent =
      view.yourRole === 'LIBERAL'
        ? '5 Liberal politika geçir veya Hitler’i tespit edip infaz ettir.'
        : view.yourRole === 'FASCIST'
        ? 'Hitler’i koru! 6 Faşist politika geçir ya da 3+ sonrası Hitler’i Şansölye yap.'
        : 'Liberal gibi davran! 3+ Faşist politikadan sonra Şansölye seçilirsen kazanırsın.';

    card.append(title, desc);

    if (view.yourRole === 'FASCIST' || view.yourRole === 'HITLER') {
      const secretBox = document.createElement('div');
      secretBox.className = 'pt-2 border-t border-white/15 space-y-1 text-[11px]';

      const fascistNames = view.knownFascists
        .filter((id) => id !== view.yourId)
        .map((id) => view.players.find((p) => p.id === id)?.name)
        .filter(Boolean);

      if (fascistNames.length > 0) {
        const fLine = document.createElement('div');
        fLine.textContent = `Faşist Ortağın: ${fascistNames.join(', ')}`;
        secretBox.appendChild(fLine);
      }

      if (view.knownHitlerId && view.knownHitlerId !== view.yourId) {
        const hName = view.players.find((p) => p.id === view.knownHitlerId)?.name;
        const hLine = document.createElement('div');
        hLine.textContent = `Hitler: ${hName ?? ''}`;
        secretBox.appendChild(hLine);
      }

      card.appendChild(secretBox);
    }

    return card;
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

      pill.className = `px-2.5 py-1.5 rounded-xl border text-[11px] flex flex-col gap-0.5 ${
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
      nameRow.textContent = p.isHuman && p.name !== 'Sen' ? `${p.name} (Sen)` : p.name;
      pill.appendChild(nameRow);

      const metaRow = document.createElement('div');
      metaRow.className = 'flex items-center gap-1 text-[10px]';

      if (isPres) {
        const badge = document.createElement('span');
        badge.className = 'px-1 rounded bg-amber-500 text-black font-black';
        badge.textContent = 'BAŞKAN';
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
        vSpan.textContent = voted ? '• Oy Verdi' : '• Düşünüyor';
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
      'pointer-events-auto p-4 rounded-2xl bg-stone-950/95 border border-stone-700 shadow-2xl backdrop-blur-md min-w-[290px] max-w-md space-y-3';

    // 1. BAŞKAN ADAY SEÇİYOR (Sen Başkansan)
    if (view.phase === 'ELECTION_NOMINATION') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent =
        view.presidentId === view.yourId
          ? 'Şansölye Adayı Seç'
          : 'Aday Bekleniyor';
      panel.appendChild(title);

      if (view.presidentId === view.yourId) {
        const eligible = this.engine.getEligibleChancellorNominees();
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-2';

        for (const cand of eligible) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-xs transition cursor-pointer';
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
      }
      return panel;
    }

    // 2. OYLAMA ZAMANI AÇILAN 'JA / NEIN' BUTONLARI
    if (view.phase === 'ELECTION_VOTING') {
      const presName = view.players.find((p) => p.id === view.presidentId)?.name ?? '';
      const nomName =
        view.players.find((p) => p.id === view.chancellorNomineeId)?.name ?? '';

      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = 'Güven Oylaması';

      const subtitle = document.createElement('p');
      subtitle.className = 'text-xs text-stone-200';
      subtitle.textContent = `Başkan ${presName} + Şansölye Adayı ${nomName} hükümetini onaylıyor musun?`;
      panel.append(title, subtitle);

      const me = view.players.find((p) => p.id === view.yourId);
      const alreadyVoted = view.votedPlayerIds.includes(view.yourId);

      if (!me?.isAlive) {
        const deadMsg = document.createElement('div');
        deadMsg.className = 'text-xs text-red-400 font-bold';
        deadMsg.textContent = 'İnfaz edildiğin için oylamaya katılamazsın.';
        panel.appendChild(deadMsg);
      } else if (alreadyVoted) {
        const waitMsg = document.createElement('div');
        waitMsg.className =
          'p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold text-center';
        waitMsg.textContent = 'Oyun kaydedildi, diğer oyuncular bekleniyor...';
        panel.appendChild(waitMsg);
      } else {
        const btnRow = document.createElement('div');
        btnRow.className = 'grid grid-cols-2 gap-2.5';

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

    // 3. BAŞKAN 3 KARTTAN 1'İNİ ELEYECEK
    if (view.phase === 'LEGISLATIVE_PRESIDENT') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = 'Yasama — Başkan Seçimi';
      panel.appendChild(title);

      if (view.presidentId === view.yourId && view.presidentHand) {
        const hint = document.createElement('p');
        hint.className = 'text-xs text-stone-300';
        hint.textContent =
          'Çekilen 3 karttan ıskartaya atmak istediğin 1 kartı seç (diğer 2 kart Şansölyeye gider):';
        panel.appendChild(hint);

        panel.appendChild(
          this.buildPolicyChoiceRow(view.presidentHand, 'Iskartaya At', (idx) => {
            this.engine.discardPolicyByPresident(view.yourId, idx);
          })
        );
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
      }
      return panel;
    }

    // 4. ŞANSÖLYE 2 KARTTAN 1'İNİ YASALAŞTIRACAK
    if (view.phase === 'LEGISLATIVE_CHANCELLOR') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-emerald-400';
      title.textContent = 'Yasama — Şansölye Seçimi';
      panel.appendChild(title);

      if (view.chancellorId === view.yourId && view.chancellorHand) {
        const hint = document.createElement('p');
        hint.className = 'text-xs text-stone-300';
        hint.textContent = 'Başkandan gelen 2 karttan yürürlüğe koymak istediğini seç:';
        panel.appendChild(hint);

        panel.appendChild(
          this.buildPolicyChoiceRow(view.chancellorHand, 'Yasalaştır', (idx) => {
            this.engine.enactPolicyByChancellor(view.yourId, idx);
          })
        );
      } else {
        const wait = document.createElement('p');
        wait.className = 'text-xs text-stone-300';
        wait.textContent = this.getPhaseBannerText(view);
        panel.appendChild(wait);
      }
      return panel;
    }

    // 5. YETKİ: DESTEYE GÖZ ATMA (3. FAŞİST)
    if (view.phase === 'EXECUTIVE_PEEK') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-amber-400';
      title.textContent = 'Başkan Yetkisi — Deste İnceleme';
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
      }
      return panel;
    }

    // 6. YETKİ: İNFAZ (4. VE 5. FAŞİST)
    if (view.phase === 'EXECUTIVE_EXECUTION') {
      const title = document.createElement('div');
      title.className = 'text-xs font-black uppercase tracking-wider text-red-400';
      title.textContent = 'Başkan Yetkisi — İnfaz';
      panel.appendChild(title);

      if (view.presidentId === view.yourId) {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-2';
        for (const target of view.players) {
          if (!target.isAlive || target.id === view.yourId) continue;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition cursor-pointer';
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
      }
      return panel;
    }

    // 7. OYUN SONU
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
        this.roleCardOpen = false;
        this.engine.startNewGame({ humanName: 'Sen' });
      });

      panel.append(title, reason, againBtn);
      return panel;
    }

    return null;
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
      const recent = view.logs.slice(-10);
      for (const entry of recent) {
        const line = document.createElement('div');
        line.className =
          entry.category === 'victory'
            ? 'text-amber-300 font-bold'
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

  private translateWinReason(reason: PlayerView['winReason']): string {
    switch (reason) {
      case 'LIBERAL_POLICIES':
        return '5 Liberal politika başarıyla yasalaştı!';
      case 'FASCIST_POLICIES':
        return '6 Faşist politika yürürlüğe girdi!';
      case 'HITLER_CHANCELLOR':
        return '3+ Faşist politika sonrası Hitler Şansölye seçildi!';
      case 'HITLER_EXECUTED':
        return 'Hitler tespit edilip infaz edildi!';
      default:
        return '';
    }
  }

  dispose(): void {
    if (this.botTimerId !== null) {
      window.clearTimeout(this.botTimerId);
      this.botTimerId = null;
    }
    this.unsubscribe?.();
    this.root.replaceChildren();
  }
}
