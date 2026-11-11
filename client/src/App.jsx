import React, { useState, useEffect, useRef } from "react";
import { CharacterAvatar } from "./components/Characters";
import Table3D from "./components/Table3D";

const APP_VERSION = "v0.6.0";

const PHASE_DURATION = {
  NOMINATION: 10,
  VOTING: 10,
  LEGISLATE_LEADER: 10,
  LEGISLATE_PARTNER: 10,
  CLAIMING: 10,
  POWERS_PEEK: 8,
  POWERS_EXECUTION: 10,
  SUSPICION_MARKING: 7,
};

export default function App() {
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState(() => {
    const saved = sessionStorage.getItem("sp_player_id");
    if (saved) return saved;
    const newId = "p_" + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem("sp_player_id", newId);
    return newId;
  });
  const [playerName, setPlayerName] = useState("Sen");
  const [joined, setJoined] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("sp_theme") || "dark"
  );

  // Tur içi zamanlayıcı (10 saniyelik karar süresi)
  const [phaseTimer, setPhaseTimer] = useState(10);

  // Kamera Modu ("auto" = kart fazlarında masaya yaklaşır, "table" = sürekli masa/kart odaklı, "characters" = sürekli geniş açı)
  const [cameraMode, setCameraMode] = useState("auto");

  // Parmakla işaret etme ve çip koyma için seçili hedef oyuncu ID'si
  const [selectedTargetId, setSelectedTargetId] = useState("");

  // Sağ alt panel sekme ve küçültme durumu
  const [hudTab, setHudTab] = useState("controls"); // "controls" | "logs" | "history"
  const [hudMinimized, setHudMinimized] = useState(false);
  const [showRoleSecret, setShowRoleSecret] = useState(false);

  // Lider & Ortak Beyan Formu Seçimleri
  const [leaderDrawnClaim, setLeaderDrawnClaim] = useState([
    "BLUE",
    "RED",
    "RED",
  ]);
  const [leaderPassedClaim, setLeaderPassedClaim] = useState(["BLUE", "RED"]);
  const [partnerReceivedClaim, setPartnerReceivedClaim] = useState([
    "BLUE",
    "RED",
  ]);

  const logsEndRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("sp_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [gameState?.public?.logs, hudTab]);

  // Faz değiştiğinde sayacı sıfırla
  useEffect(() => {
    const currentPhase = gameState?.public?.phase;
    if (!currentPhase || currentPhase === "LOBBY" || currentPhase === "GAME_OVER")
      return;

    const maxSec = PHASE_DURATION[currentPhase] || 10;
    setPhaseTimer(maxSec);

    const interval = setInterval(() => {
      setPhaseTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.public?.phase, gameState?.public?.round]);

  // Oyuncular yüklendiğinde varsayılan bir hedef seçili olsun (parmakla işaret etmek için hazır)
  useEffect(() => {
    const players = gameState?.public?.players || [];
    if (players.length > 1 && !selectedTargetId) {
      const other = players.find((p) => p.id !== playerId && p.is_alive);
      if (other) setSelectedTargetId(other.id);
    }
  }, [gameState?.public?.players, playerId, selectedTargetId]);

  const connectToServer = (nameToJoin) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?id=${encodeURIComponent(
      playerId
    )}&name=${encodeURIComponent(nameToJoin)}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setConnected(true);
      setJoined(true);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "STATE_UPDATE") {
          setGameState(msg.payload);
        }
      } catch (err) {
        console.error("WS parse hatası:", err);
      }
    };

    socket.onclose = () => {
      setConnected(false);
    };

    setWs(socket);
  };

  const sendAction = (action, data = {}) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, data }));
    }
  };

  const sendGesture = (expression, bubble, targetIdOverride = undefined) => {
    const effectiveTarget =
      targetIdOverride !== undefined ? targetIdOverride : selectedTargetId;
    sendAction("SET_EXPRESSION", {
      expression,
      bubble,
      target_id: effectiveTarget,
    });
  };

  // 3D sahnede bir karaktere tıklandığında hem hedef seç hem de parmakla işaret et!
  const handleSelectPlayerOnTable = (targetId) => {
    if (!targetId || targetId === playerId) return;
    setSelectedTargetId(targetId);
    const targetObj = gameState?.public?.players?.find((p) => p.id === targetId);
    const tName = targetObj ? targetObj.name : "Sen";
    sendAction("SET_EXPRESSION", {
      expression: "pointing",
      bubble: `👉 ${tName}!`,
      target_id: targetId,
    });
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const leaveTable = () => {
    if (ws) ws.close();
    setWs(null);
    setJoined(false);
    setGameState(null);
  };

  // --- GİRİŞ EKRANI ---
  if (!joined || !gameState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-5 right-5 flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="sp-btn-secondary px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            {theme === "dark" ? "☀️ Açık Tema (Beyaz)" : "🌙 Koyu Tema (Siyah)"}
          </button>
        </div>

        <div className="max-w-md w-full sp-card rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-widest px-2.5 py-1 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold">
              3D Masaüstü Sosyal Çıkarım
            </span>
            <span className="text-xs font-mono sp-text-muted">{APP_VERSION}</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            SILENT PROTOCOL
          </h1>
          <p className="sp-text-muted text-sm mb-6 leading-relaxed">
            Bir masanın etrafında toplanmış karakterler. Sözlü veya yazılı
            sohbet yok; sadece <strong>3D parmakla işaret etme</strong>,{" "}
            <strong>bakışlar</strong>, <strong>mimikler</strong> ("Ha?!", "Aha!",
            "Hmm...") ve <strong>masadaki yasa kartları</strong> konuşur.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider sp-text-muted mb-2">
                Masadaki Adın
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-black/20 border border-neutral-500/30 rounded-xl px-4 py-3 font-medium focus:outline-none focus:border-amber-500 transition"
                placeholder="Örn: Mustafa"
              />
            </div>

            <button
              onClick={() => connectToServer(playerName || "Oyuncu")}
              className="w-full sp-btn-primary font-bold py-3.5 rounded-xl transition shadow-lg cursor-pointer"
            >
              Masaya Otur
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-neutral-500/20 text-xs sp-text-muted space-y-2">
            <div className="font-bold uppercase tracking-wider">
              Nasıl Oynanır?
            </div>
            <p>
              • <strong>Koruyucular (Mavi):</strong> 5 Mavi Yasa çıkarmalı veya
              Gizli Lideri infaz etmelidir.
            </p>
            <p>
              • <strong>Casuslar & Gizli Lider (Kırmızı):</strong> 6 Kırmızı
              Yasa çıkarmalı veya 3 Kırmızı Yasadan sonra Gizli Lideri Ortak
              seçtirmelidir.
            </p>
            <p>
              • <strong>Tam Ekran 3D Masa & Sağ Alt Kumanda:</strong> Tüm
              mimikler, parmakla işaret etme, kart seçimleri ve kayıtlar sağ
              alttaki birleşik kumanda panelindedir.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const pub = gameState.public;
  const view = gameState;
  const isLeader = pub.leader_id === view.your_id;
  const isPartner = pub.partner_id === view.your_id;
  const me = pub.players.find((p) => p.id === view.your_id);
  const otherPlayers = pub.players.filter((p) => p.id !== view.your_id);
  const mySuspicions = pub.suspicions?.[view.your_id] || {};

  // --- LOBİ EKRANI (BAŞLANGIÇ MENÜSÜ) ---
  if (pub.phase === "LOBBY") {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sp-card border-x-0 border-t-0 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-black text-lg tracking-wider">
              SILENT PROTOCOL
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-500/15 sp-text-muted">
              {pub.version || APP_VERSION}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="sp-btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
            >
              {theme === "dark" ? "☀️ Beyaz Tema" : "🌙 Siyah Tema"}
            </button>
            <button
              onClick={leaveTable}
              className="sp-btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 cursor-pointer"
            >
              Çıkış
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-3xl w-full sp-card rounded-2xl p-8 text-center shadow-xl">
            <h2 className="text-2xl font-extrabold mb-2">
              Masa Hazırlanıyor (Lobi)
            </h2>
            <p className="sp-text-muted text-sm mb-6">
              Oyunu başlatmak için en az 5 kişi (oyuncu + bot) masada olmalı.
              İstediğin kadar bot ekleyip çıkarabilirsin.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
              {pub.players.map((p, idx) => (
                <div
                  key={p.id}
                  className="sp-card rounded-xl p-3 flex flex-col items-center relative"
                >
                  {p.is_bot && (
                    <button
                      onClick={() =>
                        sendAction("REMOVE_BOT", { target_id: p.id })
                      }
                      title="Botu Masadan Kaldır"
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/15 hover:bg-red-500/30 text-red-500 text-xs font-bold flex items-center justify-center cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                  <CharacterAvatar
                    id={p.avatar || idx + 1}
                    expression={p.expression || "neutral"}
                    className="w-20 h-20"
                  />
                  <span className="font-bold text-sm mt-1">{p.name}</span>
                  <span className="text-[10px] uppercase tracking-wider sp-text-muted mt-0.5">
                    {p.is_bot ? "Yapay Zeka Bot" : "Gerçek Oyuncu"}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-4">
              {pub.players.length < 7 && (
                <button
                  onClick={() => sendAction("ADD_BOT")}
                  className="sp-btn-secondary px-5 py-3 rounded-xl font-bold text-sm transition cursor-pointer"
                >
                  + Masaya Karakter (Bot) Ekle ({pub.players.length}/7)
                </button>
              )}
              <button
                onClick={() => sendAction("START_GAME")}
                disabled={pub.players.length < 5}
                className="sp-btn-primary disabled:opacity-40 px-8 py-3 rounded-xl font-bold text-sm transition shadow-lg cursor-pointer"
              >
                Oyunu Başlat ({pub.players.length} Kişi)
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- TAM EKRAN 3D OYUN ALANI VE SAĞ ALT BİRLEŞİK KUMANDA PANELİ ---
  const selectedTargetObj = pub.players.find((p) => p.id === selectedTargetId);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#0c0b0a] select-none">
      {/* 1. TAM EKRAN 3D MASA SAHNESİ */}
      <div className="absolute inset-0 w-full h-full z-0">
        <Table3D
          pub={pub}
          view={view}
          theme={theme}
          phaseTimer={phaseTimer}
          cameraMode={cameraMode}
          selectedTargetId={selectedTargetId}
          onSelectPlayer={handleSelectPlayerOnTable}
        />
      </div>

      {/* 2. ÜST İNCE DURUM ÇUBUĞU (YÜZEN TRANSPARAN HUD) */}
      <header className="pointer-events-none absolute top-0 left-0 right-0 z-20 p-3 sm:px-5 flex flex-wrap items-center justify-between gap-2">
        {/* Sol: Tur, Aşama, Süre ve Yasa Durumu */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-black/80 backdrop-blur-md border border-white/15 px-3.5 py-2 rounded-2xl text-white shadow-2xl">
          <span className="font-black text-sm tracking-wider text-amber-400">
            SILENT PROTOCOL
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">
            {pub.version || APP_VERSION}
          </span>
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/10">
            Tur #{pub.round}
          </span>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {translatePhase(pub.phase)}
          </span>
          {pub.phase !== "GAME_OVER" && (
            <span
              className={`text-xs font-mono font-extrabold px-2 py-0.5 rounded ${
                phaseTimer <= 3
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-white/10 text-amber-300"
              }`}
            >
              ⏱ {phaseTimer}s
            </span>
          )}

          <div className="h-4 w-[1px] bg-white/15 mx-1 hidden sm:block" />

          {/* Masa Üstü Yasa & Deste Sayaçları */}
          <div className="flex items-center gap-2 text-xs font-bold">
            <span
              className="px-2 py-0.5 rounded bg-blue-600/30 border border-blue-400/40 text-blue-300"
              title="Yürürlükteki Mavi Yasalar (Hedef: 5)"
            >
              🔵 Mavi: {pub.blue_policies}/5
            </span>
            <span
              className="px-2 py-0.5 rounded bg-red-600/30 border border-red-400/40 text-red-300"
              title="Yürürlükteki Kırmızı Yasalar (Hedef: 6)"
            >
              🔴 Kırmızı: {pub.red_policies}/6
            </span>
            <span
              className="px-2 py-0.5 rounded bg-amber-600/25 border border-amber-400/30 text-amber-300"
              title="Kaos Sayacı (3 olursa en üstteki kart zorla yasalaşır)"
            >
              ⚡ Kaos: {pub.chaos_counter}/3
            </span>
            <span className="text-[11px] text-neutral-400 font-mono hidden md:inline">
              🃏 Deste:{pub.deck_count} | Iskarta:{pub.discard_count}
            </span>
          </div>
        </div>

        {/* Sağ: Kamera Açısı Seçici, Gizli Kimlik Rozeti, Tema & Çıkış */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {/* Kamera Kontrol Butonları */}
          <div className="flex items-center bg-black/80 backdrop-blur-md border border-white/15 rounded-xl p-1 text-xs text-white shadow-xl">
            <button
              onClick={() => setCameraMode("auto")}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                cameraMode === "auto"
                  ? "bg-amber-500 text-black"
                  : "text-neutral-300 hover:bg-white/10"
              }`}
              title="Kart çekilirken otomatik olarak masaya yaklaşır"
            >
              🎥 Otomatik
            </button>
            <button
              onClick={() => setCameraMode("table")}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                cameraMode === "table"
                  ? "bg-amber-500 text-black"
                  : "text-neutral-300 hover:bg-white/10"
              }`}
              title="Kamerayı masadaki kartlara odakla"
            >
              🃏 Masa
            </button>
            <button
              onClick={() => setCameraMode("characters")}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                cameraMode === "characters"
                  ? "bg-amber-500 text-black"
                  : "text-neutral-300 hover:bg-white/10"
              }`}
              title="Kamerayı masadaki karakterlere odakla"
            >
              👥 Karakterler
            </button>
          </div>

          {/* Gizli Kimlik Rozeti (Tıkla veya Üzerine Gel) */}
          <div className="relative">
            <button
              onClick={() => setShowRoleSecret((prev) => !prev)}
              className="bg-black/80 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-xl cursor-pointer hover:border-amber-400"
            >
              <span>🕵️ Kimliğin:</span>
              <span
                className={
                  showRoleSecret
                    ? view.your_role === "PROTECTOR"
                      ? "text-blue-400 font-black"
                      : "text-red-400 font-black"
                    : "blur-[4px] select-none"
                }
              >
                {translateRole(view.your_role)}
              </span>
              <span className="text-[10px] text-neutral-400">
                ({showRoleSecret ? "Gizle" : "Göster"})
              </span>
            </button>

            {showRoleSecret && (
              <div className="absolute right-0 mt-2 w-64 bg-black/95 border border-white/20 rounded-xl p-3 text-xs text-white shadow-2xl z-30">
                <div className="font-bold mb-1 text-amber-400">
                  Rolün: {translateRole(view.your_role)}
                </div>
                <p className="text-neutral-300 leading-relaxed">
                  {view.your_role === "PROTECTOR" &&
                    "5 Mavi Yasa çıkar veya Gizli Lideri tespit edip infaz et."}
                  {view.your_role === "SPY" &&
                    "Gizli Lideri koru ve 6 Kırmızı Yasa çıkarılmasına yardım et."}
                  {view.your_role === "SECRET_LEADER" &&
                    "Koruyucu gibi davran! 3 Kırmızı Yasadan sonra Ortak seçilirsen anında kazanırsın."}
                </p>
                {(view.your_role === "SPY" ||
                  view.your_role === "SECRET_LEADER") && (
                  <div className="mt-2 pt-2 border-t border-white/10 text-[11px] space-y-1">
                    {view.secret_leader_id && (
                      <div>
                        Gizli Lider:{" "}
                        <strong className="text-purple-400">
                          {
                            pub.players.find(
                              (p) => p.id === view.secret_leader_id
                            )?.name
                          }
                        </strong>
                      </div>
                    )}
                    {view.known_allies?.length > 0 && (
                      <div>
                        Casus Ortağın:{" "}
                        <strong className="text-red-400">
                          {view.known_allies
                            .map(
                              (id) =>
                                pub.players.find((p) => p.id === id)?.name
                            )
                            .join(", ")}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={toggleTheme}
            className="bg-black/80 backdrop-blur-md border border-white/15 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer hover:bg-white/10"
            title="Tema Değiştir"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <button
            onClick={leaveTable}
            className="bg-black/80 backdrop-blur-md border border-red-500/40 px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 cursor-pointer hover:bg-red-500/20"
          >
            Çıkış
          </button>
        </div>
      </header>

      {/* 3. SAĞ ALT BİRLEŞİK KUMANDA, MİMİK, İŞARET ETME VE MASA KAYITLARI PANELİ */}
      <aside
        className={`pointer-events-auto fixed bottom-3 right-3 z-30 w-[calc(100vw-1.5rem)] sm:w-[430px] md:w-[460px] bg-black/88 backdrop-blur-xl border border-white/20 rounded-2xl text-white shadow-2xl flex flex-col transition-all duration-200 ${
          hudMinimized ? "max-h-14" : "max-h-[82vh]"
        }`}
      >
        {/* Panel Üst Başlık ve Sekmeler */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/15 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setHudTab("controls");
                setHudMinimized(false);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                hudTab === "controls" && !hudMinimized
                  ? "bg-amber-500 text-black"
                  : "text-neutral-300 hover:bg-white/10"
              }`}
            >
              🎭 Karar & Mimik
            </button>
            <button
              onClick={() => {
                setHudTab("logs");
                setHudMinimized(false);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                hudTab === "logs" && !hudMinimized
                  ? "bg-amber-500 text-black"
                  : "text-neutral-300 hover:bg-white/10"
              }`}
            >
              <span>📋 Kayıtlar</span>
              <span className="text-[10px] px-1 rounded bg-white/20">
                {pub.logs?.length || 0}
              </span>
            </button>
            <button
              onClick={() => {
                setHudTab("history");
                setHudMinimized(false);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                hudTab === "history" && !hudMinimized
                  ? "bg-amber-500 text-black"
                  : "text-neutral-300 hover:bg-white/10"
              }`}
            >
              🗳️ Oylar ({pub.history?.length || 0})
            </button>
          </div>

          <button
            onClick={() => setHudMinimized((prev) => !prev)}
            className="px-2 py-1 rounded-lg text-xs font-bold text-neutral-300 hover:bg-white/10 cursor-pointer"
            title={hudMinimized ? "Paneli Aç" : "Paneli Küçült"}
          >
            {hudMinimized ? "▲ Aç" : "▼ Küçült"}
          </button>
        </div>

        {/* Panel İçeriği */}
        {!hudMinimized && (
          <div className="p-3.5 overflow-y-auto space-y-3.5 text-xs">
            {hudTab === "controls" && (
              <>
                {/* BÖLÜM A: AKTİF OYUN AŞAMASI KARAR ALANI */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase tracking-wider text-amber-400">
                      ⚡ {translatePhase(pub.phase)}
                    </span>
                    {pub.phase !== "GAME_OVER" && (
                      <span className="font-mono text-[11px] text-neutral-300">
                        Kalan: <strong>{phaseTimer} sn</strong>
                      </span>
                    )}
                  </div>

                  {/* 1. ORTAK ADAYI SEÇİMİ */}
                  {pub.phase === "NOMINATION" && (
                    <div>
                      {isLeader ? (
                        <div className="space-y-2">
                          <p className="text-neutral-300">
                            Masার Lideri sensin! Yasaları birlikte çıkarmak için
                            bir <strong>Ortak (Partner)</strong> seç:
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {otherPlayers
                              .filter(
                                (p) => p.is_alive && p.id !== pub.prev_partner_id
                              )
                              .map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => {
                                    setSelectedTargetId(p.id);
                                    sendGesture(
                                      "pointing",
                                      `👉 Adayım ${p.name}!`,
                                      p.id
                                    );
                                    sendAction("NOMINATE", { target_id: p.id });
                                  }}
                                  className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition cursor-pointer text-left flex items-center justify-between"
                                >
                                  <span>{p.name}</span>
                                  <span>👉 Seç</span>
                                </button>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-neutral-300">
                          Lider{" "}
                          <strong className="text-amber-300">
                            {
                              pub.players.find((p) => p.id === pub.leader_id)
                                ?.name
                            }
                          </strong>{" "}
                          masadan bir Ortak adayı düşünüyor...
                        </p>
                      )}
                    </div>
                  )}

                  {/* 2. HÜKÜMET OYLAMASI */}
                  {pub.phase === "VOTING" && (
                    <div className="space-y-2">
                      <p className="text-neutral-200">
                        Lider{" "}
                        <strong className="text-amber-300">
                          {
                            pub.players.find((p) => p.id === pub.leader_id)
                              ?.name
                          }
                        </strong>{" "}
                        & Ortak Adayı{" "}
                        <strong className="text-emerald-300">
                          {
                            pub.players.find((p) => p.id === pub.partner_id)
                              ?.name
                          }
                        </strong>{" "}
                        hükümetini onaylıyor musun?
                      </p>
                      {!me?.is_alive ? (
                        <div className="text-red-400 font-bold">
                          İnfaz edildiğin için oy kullanamazsın.
                        </div>
                      ) : pub.votes[view.your_id] ? (
                        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 font-bold text-center">
                          Oyun kaydedildi. Diğer oyuncular bekleniyor...
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => sendAction("VOTE", { vote: "YES" })}
                            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition cursor-pointer shadow"
                          >
                            ✓ EVET (JA)
                          </button>
                          <button
                            onClick={() => sendAction("VOTE", { vote: "NO" })}
                            className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black transition cursor-pointer shadow"
                          >
                            ✕ HAYIR (NEIN)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. LİDER YASA ELEMESİ (MASADAKİ 3 KART) */}
                  {pub.phase === "LEGISLATE_LEADER" && (
                    <div>
                      {isLeader && view.drawn_policies ? (
                        <div className="space-y-2">
                          <p className="text-neutral-200">
                            Masadaki desteden 3 yasa çektin.{" "}
                            <strong className="text-amber-300">
                              1 tanesini ıskartaya çıkarmak için tıkla
                            </strong>{" "}
                            (kalan 2 kart Ortağa gidecek):
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {view.drawn_policies.map((pol, idx) => (
                              <button
                                key={idx}
                                onClick={() =>
                                  sendAction("LEADER_DISCARD", { index: idx })
                                }
                                className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1 font-black transition hover:-translate-y-0.5 cursor-pointer ${
                                  pol === "BLUE"
                                    ? "bg-blue-950/90 border-blue-400 text-blue-200"
                                    : "bg-red-950/90 border-red-400 text-red-200"
                                }`}
                              >
                                <span className="text-base">
                                  {pol === "BLUE" ? "🔵 MAVİ" : "🔴 KIRMIZI"}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">
                                  🗑️ Çöpe At
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-neutral-300">
                          🃏 Kamera masaya odaklandı: Lider{" "}
                          <strong className="text-amber-300">
                            {
                              pub.players.find((p) => p.id === pub.leader_id)
                                ?.name
                            }
                          </strong>{" "}
                          masadaki 3 gizli yasa kartından birini ıskartaya
                          ayırıyor...
                        </p>
                      )}
                    </div>
                  )}

                  {/* 4. ORTAK YASA YÜRÜRLÜĞÜ (MASADAKİ 2 KART) */}
                  {pub.phase === "LEGISLATE_PARTNER" && (
                    <div>
                      {isPartner && view.drawn_policies ? (
                        <div className="space-y-2">
                          <p className="text-neutral-200">
                            Lider masadan sana 2 yasa kartı uzattı.{" "}
                            <strong className="text-emerald-300">
                              Yürürlüğe koymak istediğin yasayı seç:
                            </strong>
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {view.drawn_policies.map((pol, idx) => (
                              <button
                                key={idx}
                                onClick={() =>
                                  sendAction("PARTNER_ENACT", { index: idx })
                                }
                                className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1 font-black transition hover:-translate-y-0.5 cursor-pointer ${
                                  pol === "BLUE"
                                    ? "bg-blue-950/90 border-blue-400 text-blue-200"
                                    : "bg-red-950/90 border-red-400 text-red-200"
                                }`}
                              >
                                <span className="text-base">
                                  {pol === "BLUE" ? "🔵 MAVİ" : "🔴 KIRMIZI"}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-black/50 text-white">
                                  ✓ Yürürlüğe Koy
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-neutral-300">
                          🃏 Kamera masaya odaklandı: Ortak{" "}
                          <strong className="text-emerald-300">
                            {
                              pub.players.find((p) => p.id === pub.partner_id)
                                ?.name
                            }
                          </strong>{" "}
                          masadaki 2 yasa kartından birini yürürlüğe koyuyor...
                        </p>
                      )}
                    </div>
                  )}

                  {/* 5. YAPILANDIRILMIŞ BEYAN & ÇELİŞKİ KONTROLÜ */}
                  {pub.phase === "CLAIMING" && pub.current_claim && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span>Yürürlüğe Giren Yasa:</span>
                        <span
                          className={`px-2 py-0.5 rounded font-black ${
                            pub.current_claim.partner_enacted === "BLUE"
                              ? "bg-blue-600 text-white"
                              : "bg-red-600 text-white"
                          }`}
                        >
                          {pub.current_claim.partner_enacted === "BLUE"
                            ? "🔵 MAVİ YASA"
                            : "🔴 KIRMIZI YASA"}
                        </span>
                      </div>

                      {isLeader && !pub.current_claim.leader_claimed && (
                        <div className="p-2.5 rounded-lg bg-black/50 border border-white/15 space-y-2">
                          <div className="font-bold text-amber-300">
                            Lider Beyanı Ver (Gerçek veya Blöf):
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              className="bg-neutral-900 border border-white/20 rounded p-1.5 text-xs"
                              onChange={(e) =>
                                setLeaderDrawnClaim(e.target.value.split(","))
                              }
                              defaultValue="BLUE,RED,RED"
                            >
                              <option value="BLUE,BLUE,BLUE">
                                Çekilen: 3 Mavi
                              </option>
                              <option value="BLUE,BLUE,RED">
                                Çekilen: 2 Mavi, 1 Kırmızı
                              </option>
                              <option value="BLUE,RED,RED">
                                Çekilen: 1 Mavi, 2 Kırmızı
                              </option>
                              <option value="RED,RED,RED">
                                Çekilen: 3 Kırmızı
                              </option>
                            </select>
                            <select
                              className="bg-neutral-900 border border-white/20 rounded p-1.5 text-xs"
                              onChange={(e) =>
                                setLeaderPassedClaim(e.target.value.split(","))
                              }
                              defaultValue="BLUE,RED"
                            >
                              <option value="BLUE,BLUE">
                                İletilen: 2 Mavi
                              </option>
                              <option value="BLUE,RED">
                                İletilen: 1 Mavi, 1 Kırmızı
                              </option>
                              <option value="RED,RED">
                                İletilen: 2 Kırmızı
                              </option>
                            </select>
                          </div>
                          <button
                            onClick={() =>
                              sendAction("CLAIM_LEADER", {
                                drawn: leaderDrawnClaim,
                                passed: leaderPassedClaim,
                              })
                            }
                            className="w-full py-1.5 rounded-lg bg-amber-500 text-black font-black cursor-pointer"
                          >
                            Beyanı Masaya Sun
                          </button>
                        </div>
                      )}

                      {isPartner && !pub.current_claim.partner_claimed && (
                        <div className="p-2.5 rounded-lg bg-black/50 border border-white/15 space-y-2">
                          <div className="font-bold text-emerald-300">
                            Ortak Beyanı (Liderden Sana Ne Geldi?):
                          </div>
                          <select
                            className="w-full bg-neutral-900 border border-white/20 rounded p-1.5 text-xs"
                            onChange={(e) =>
                              setPartnerReceivedClaim(e.target.value.split(","))
                            }
                            defaultValue="BLUE,RED"
                          >
                            <option value="BLUE,BLUE">2 Mavi Geldi</option>
                            <option value="BLUE,RED">
                              1 Mavi, 1 Kırmızı Geldi
                            </option>
                            <option value="RED,RED">2 Kırmızı Geldi</option>
                          </select>
                          <button
                            onClick={() =>
                              sendAction("CLAIM_PARTNER", {
                                received: partnerReceivedClaim,
                              })
                            }
                            className="w-full py-1.5 rounded-lg bg-emerald-500 text-black font-black cursor-pointer"
                          >
                            Beyanı Masaya Sun
                          </button>
                        </div>
                      )}

                      {pub.current_claim.has_conflict && (
                        <div className="p-2 rounded-lg bg-red-600/30 border border-red-500 text-red-200 font-bold animate-pulse">
                          ⚡ {pub.current_claim.conflict_note}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 6. LİDER YETKİSİ: DESTEYE GÖZ ATMA (PEEK) */}
                  {pub.phase === "POWERS_PEEK" && (
                    <div>
                      {isLeader && view.peeked_policies ? (
                        <div className="space-y-2">
                          <p className="text-neutral-200">
                            3. Kırmızı Yasa Yetkisi: Masadaki destenin en üstündeki
                            3 kart:
                          </p>
                          <div className="flex gap-2">
                            {view.peeked_policies.map((pol, i) => (
                              <span
                                key={i}
                                className={`px-3 py-1.5 rounded-lg font-black ${
                                  pol === "BLUE"
                                    ? "bg-blue-600 text-white"
                                    : "bg-red-600 text-white"
                                }`}
                              >
                                #{i + 1}: {pol === "BLUE" ? "MAVİ" : "KIRMIZI"}
                              </span>
                            ))}
                          </div>
                          <button
                            onClick={() => sendAction("CLOSE_PEEK")}
                            className="w-full py-2 rounded-lg bg-amber-500 text-black font-black cursor-pointer"
                          >
                            İncelemeyi Bitir
                          </button>
                        </div>
                      ) : (
                        <p className="text-neutral-300">
                          Lider destenin üstündeki 3 kartı gizlice inceliyor...
                        </p>
                      )}
                    </div>
                  )}

                  {/* 7. LİDER YETKİSİ: İNFAZ */}
                  {pub.phase === "POWERS_EXECUTION" && (
                    <div>
                      {isLeader ? (
                        <div className="space-y-2">
                          <p className="text-red-300 font-bold">
                            ⚖️ İnfaz Yetkisi: Masadan bir oyuncuyu kalıcı olarak
                            infaz et!
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {otherPlayers
                              .filter((p) => p.is_alive)
                              .map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => {
                                    sendGesture(
                                      "pointing",
                                      `👉 İnfaz: ${p.name}!`,
                                      p.id
                                    );
                                    sendAction("EXECUTE", { target_id: p.id });
                                  }}
                                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black cursor-pointer"
                                >
                                  💀 {p.name}
                                </button>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-red-300 font-bold">
                          ⚖️ Lider{" "}
                          {
                            pub.players.find((p) => p.id === pub.leader_id)
                              ?.name
                          }{" "}
                          masadan birini infaz etmek üzere!
                        </p>
                      )}
                    </div>
                  )}

                  {/* 8. ŞÜPHE İŞARETLEME & SONRAKİ TUR */}
                  {pub.phase === "SUSPICION_MARKING" && (
                    <div className="space-y-2">
                      {pub.current_claim?.has_conflict && (
                        <div className="p-2 rounded-lg bg-red-600/30 border border-red-500 text-red-200 font-bold">
                          ⚡ {pub.current_claim.conflict_note}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-300">
                          Aşağıdan bir oyuncuyu parmakla işaret edebilir veya
                          şüphe çipi bırakabilirsin.
                        </span>
                        <button
                          onClick={() => sendAction("NEXT_ROUND")}
                          className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black cursor-pointer"
                        >
                          Sonraki Tur →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 9. OYUN SONU */}
                  {pub.phase === "GAME_OVER" && (
                    <div className="space-y-2 text-center">
                      <div
                        className={`text-base font-black ${
                          pub.winner === "PROTECTORS"
                            ? "text-blue-400"
                            : "text-red-400"
                        }`}
                      >
                        {pub.winner === "PROTECTORS"
                          ? "🏆 KORUYUCULAR KAZANDI!"
                          : "🔥 CASUSLAR VE GİZLİ LİDER KAZANDI!"}
                      </div>
                      <p className="text-neutral-300">{pub.win_reason}</p>
                      <button
                        onClick={() => sendAction("RESTART_GAME")}
                        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black cursor-pointer shadow-lg"
                      >
                        🔄 Yeni Oyun Başlat
                      </button>
                    </div>
                  )}
                </div>

                {/* BÖLÜM B: HEDEF SEÇİMİ, 3D PARMAKLA İŞARET ETME & ŞÜPHE ÇİPLERİ */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-neutral-300">
                      🫵 Hedef Kişi Seç & Parmakla Göster
                    </span>
                    {selectedTargetObj && (
                      <span className="text-[11px] text-amber-400 font-bold">
                        Seçili: {selectedTargetObj.name}
                      </span>
                    )}
                  </div>

                  {/* Oyuncu Seçim Butonları */}
                  <div className="flex flex-wrap gap-1.5">
                    {otherPlayers.map((p) => {
                      const isSel = selectedTargetId === p.id;
                      const chip = mySuspicions[p.id];
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedTargetId(p.id);
                            sendGesture("pointing", `👉 ${p.name}!`, p.id);
                          }}
                          disabled={!p.is_alive}
                          className={`px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 border ${
                            !p.is_alive
                              ? "opacity-35 line-through border-white/10"
                              : isSel
                              ? "bg-amber-500 text-black border-amber-300 shadow"
                              : "bg-white/10 text-white border-white/15 hover:bg-white/20"
                          }`}
                        >
                          <span>🫵 {p.name}</span>
                          {chip === "SUSPECT" && <span>🔴</span>}
                          {chip === "TRUSTED" && <span>🟢</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Seçili Oyuncuya Hızlı İşaret Etme & Çip Koyma */}
                  {selectedTargetObj && (
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button
                        onClick={() =>
                          sendGesture(
                            "pointing",
                            `👉 ${selectedTargetObj.name} şüpheli!`,
                            selectedTargetObj.id
                          )
                        }
                        className="py-1.5 px-2 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/50 text-amber-200 font-bold cursor-pointer"
                      >
                        🫵 İşaret Et ({selectedTargetObj.name})
                      </button>
                      <button
                        onClick={() =>
                          sendAction("SET_SUSPICION", {
                            target_id: selectedTargetObj.id,
                            chip: "SUSPECT",
                          })
                        }
                        className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border ${
                          mySuspicions[selectedTargetObj.id] === "SUSPECT"
                            ? "bg-red-600 text-white border-red-300"
                            : "bg-red-500/15 hover:bg-red-500/30 text-red-300 border-red-500/30"
                        }`}
                      >
                        🔴 Şüpheli Çipi
                      </button>
                      <button
                        onClick={() =>
                          sendAction("SET_SUSPICION", {
                            target_id: selectedTargetObj.id,
                            chip: "TRUSTED",
                          })
                        }
                        className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border ${
                          mySuspicions[selectedTargetObj.id] === "TRUSTED"
                            ? "bg-emerald-600 text-white border-emerald-300"
                            : "bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        🟢 Güven Çipi
                      </button>
                    </div>
                  )}
                </div>

                {/* BÖLÜM C: MİMİKLER VE SAĞA-SOLA BAKIŞ KONTROLLERİ */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-neutral-300">
                      👀 Bakışlar & Mimik Tepkileri
                    </span>
                    {me?.bubble && (
                      <span className="px-2 py-0.5 rounded bg-white text-black font-black text-[10px]">
                        Sen: "{me.bubble}"
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    <button
                      onClick={() => sendGesture("thinking", "Hmm...")}
                      className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border transition ${
                        me?.expression === "thinking"
                          ? "bg-amber-500 text-black border-amber-300"
                          : "bg-white/10 hover:bg-white/20 text-white border-white/10"
                      }`}
                    >
                      🤔 Hmm...
                    </button>
                    <button
                      onClick={() => sendGesture("surprised", "Ha?!")}
                      className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border transition ${
                        me?.expression === "surprised"
                          ? "bg-amber-500 text-black border-amber-300"
                          : "bg-white/10 hover:bg-white/20 text-white border-white/10"
                      }`}
                    >
                      😲 Ha?!
                    </button>
                    <button
                      onClick={() => sendGesture("eureka", "Aha!")}
                      className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border transition ${
                        me?.expression === "eureka"
                          ? "bg-amber-500 text-black border-amber-300"
                          : "bg-white/10 hover:bg-white/20 text-white border-white/10"
                      }`}
                    >
                      💡 Aha!
                    </button>
                    <button
                      onClick={() => sendGesture("look_left", "👈...")}
                      className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border transition ${
                        me?.expression === "look_left"
                          ? "bg-amber-500 text-black border-amber-300"
                          : "bg-white/10 hover:bg-white/20 text-white border-white/10"
                      }`}
                    >
                      👈 Sola Bak
                    </button>
                    <button
                      onClick={() => sendGesture("look_right", "...👉")}
                      className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border transition ${
                        me?.expression === "look_right"
                          ? "bg-amber-500 text-black border-amber-300"
                          : "bg-white/10 hover:bg-white/20 text-white border-white/10"
                      }`}
                    >
                      👉 Sağa Bak
                    </button>
                    <button
                      onClick={() => sendGesture("neutral", "", "")}
                      className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 border border-white/10 font-bold cursor-pointer"
                    >
                      😐 Normal
                    </button>
                  </div>

                  {/* Son 2 Kayıt Özeti (Hızlı Bakış) */}
                  <div className="pt-2 border-t border-white/10 space-y-1">
                    {(pub.logs || []).slice(-2).map((l, i) => (
                      <div
                        key={i}
                        className="text-[11px] text-neutral-300 truncate"
                      >
                        <span className="font-mono text-neutral-500 mr-1.5">
                          [{l.timestamp}]
                        </span>
                        <span>{l.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* SEKME 2: CANLI MASA KAYITLARI */}
            {hudTab === "logs" && (
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                {(pub.logs || []).map((log, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg border text-xs ${
                      log.type === "conflict"
                        ? "bg-red-950/60 border-red-500/50 text-red-200 font-bold"
                        : log.type === "alert"
                        ? "bg-amber-950/50 border-amber-500/40 text-amber-200 font-semibold"
                        : log.type === "success"
                        ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-200"
                        : "bg-white/5 border-white/10 text-neutral-200"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-neutral-400 mr-2">
                      [{log.timestamp}]
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}

            {/* SEKME 3: OYLAMA GEÇMİŞİ */}
            {hudTab === "history" && (
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {(!pub.history || pub.history.length === 0) && (
                  <p className="text-neutral-400 italic">
                    Henüz tamamlanmış bir oylama yok.
                  </p>
                )}
                {(pub.history || [])
                  .slice()
                  .reverse()
                  .map((h, i) => {
                    const lName = pub.players.find(
                      (p) => p.id === h.leader_id
                    )?.name;
                    const pName = pub.players.find(
                      (p) => p.id === h.partner_id
                    )?.name;
                    return (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1.5"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-amber-300">
                            Tur #{h.round}: {lName} & {pName}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                              h.approved
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-red-500/20 text-red-300"
                            }`}
                          >
                            {h.approved ? "ONAYLANDI" : "REDDEDİLDİ"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(h.votes).map(([pid, v]) => {
                            const voter = pub.players.find(
                              (p) => p.id === pid
                            )?.name;
                            return (
                              <span
                                key={pid}
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  v === "YES"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-red-500/20 text-red-300"
                                }`}
                              >
                                {voter}: {v === "YES" ? "E" : "H"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function translatePhase(phase) {
  switch (phase) {
    case "LOBBY":
      return "Lobi";
    case "NOMINATION":
      return "Ortak Seçimi";
    case "VOTING":
      return "Masa Oylaması";
    case "LEGISLATE_LEADER":
      return "Lider Yasa Elemesi";
    case "LEGISLATE_PARTNER":
      return "Ortak Yasa Seçimi";
    case "CLAIMING":
      return "Beyan & Çelişki";
    case "POWERS_PEEK":
      return "Deste İnceleme";
    case "POWERS_EXECUTION":
      return "İnfaz Kararı";
    case "SUSPICION_MARKING":
      return "Şüphe & İşaret Aşaması";
    case "GAME_OVER":
      return "Oyun Sonu";
    default:
      return phase;
  }
}

function translateRole(role) {
  switch (role) {
    case "PROTECTOR":
      return "KORUYUCU (MAVİ)";
    case "SPY":
      return "CASUS (KIRMIZI)";
    case "SECRET_LEADER":
      return "GİZLİ LİDER";
    default:
      return "BİLİNMİYOR";
  }
}
