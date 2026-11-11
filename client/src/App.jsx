import React, { useState, useEffect, useRef } from "react";
import { CharacterAvatar } from "./components/Characters";
import Table3D from "./components/Table3D";

const APP_VERSION = "v0.7.0";

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [viewMeta, setViewMeta] = useState({
    your_id: "",
    your_role: "",
    known_allies: [],
    secret_leader_id: "",
    drawn_policies: [],
    peeked_policies: [],
  });
  const [connected, setConnected] = useState(false);

  const [playerId] = useState(() => {
    const saved = sessionStorage.getItem("sp_player_id");
    if (saved) return saved;
    const newId = "p_" + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem("sp_player_id", newId);
    return newId;
  });
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem("sp_player_name") || "Komutan"
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem("sp_theme") || "dark"
  );

  // Canlı 10 saniyelik tur sayacı (sunucu remaining süresine senkron)
  const [phaseTimer, setPhaseTimer] = useState(10);

  // Kamera Modu ("auto" = kart fazlarında masaya yaklaşır, "table" = masa/kartlar, "characters" = tüm oyuncular)
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

  const wsRef = useRef(null);
  const logsEndRef = useRef(null);
  const gestureTimeoutRef = useRef(null);

  // Tema senkronizasyonu
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.className = theme === "dark" ? "theme-dark" : "theme-light";
    localStorage.setItem("sp_theme", theme);
  }, [theme]);

  // WebSocket Bağlantısı (Açılışta otomatik bağlanıp Başlangıç Menüsü / Lobi gösterir)
  useEffect(() => {
    let closedByCleanup = false;
    let reconnectTimer = null;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?id=${encodeURIComponent(
      playerId
    )}`;

    function connect() {
      if (closedByCleanup) return;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        const savedName = localStorage.getItem("sp_player_name") || "Komutan";
        socket.send(
          JSON.stringify({
            type: "join",
            name: savedName,
            avatar: "🛡️",
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "state" && msg.payload) {
            const payload = msg.payload;
            setGameState(payload.public_state);
            setViewMeta({
              your_id: payload.your_id,
              your_role: payload.your_role || "",
              known_allies: payload.known_allies || [],
              secret_leader_id: payload.secret_leader_id || "",
              drawn_policies: payload.drawn_policies || [],
              peeked_policies: payload.peeked_policies || [],
            });
          }
        } catch (err) {
          console.error("WS parse hatası:", err);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (!closedByCleanup) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };
    }

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [playerId]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [gameState?.logs, hudTab]);

  // Faz değiştiğinde sunucunun verdiği süreden sayacı başlat
  useEffect(() => {
    const curPhase = gameState?.phase;
    if (!curPhase || curPhase === "LOBBY" || curPhase === "GAME_OVER") {
      setPhaseTimer(10);
      return;
    }

    const startVal =
      gameState?.phase_remaining > 0
        ? gameState.phase_remaining
        : gameState?.phase_duration || 10;
    setPhaseTimer(startVal);

    const interval = setInterval(() => {
      setPhaseTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.phase, gameState?.round]);

  // Varsayılan işaret hedefi seçili olsun
  useEffect(() => {
    const players = gameState?.players || [];
    if (players.length > 1) {
      const stillValid = players.some(
        (p) => p.id === selectedTargetId && p.is_alive && p.id !== playerId
      );
      if (!stillValid) {
        const other = players.find((p) => p.id !== playerId && p.is_alive);
        if (other) setSelectedTargetId(other.id);
      }
    }
  }, [gameState?.players, playerId, selectedTargetId]);

  // hub.go protokolü ile birebir uyumlu gönderici
  const sendAction = (type, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  };

  const sendGesture = (expression, bubble, targetIdOverride = undefined) => {
    const effectiveTarget =
      targetIdOverride !== undefined ? targetIdOverride : selectedTargetId;
    sendAction("gesture", {
      expression,
      bubble,
      target_id: effectiveTarget || "",
    });

    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    if (expression !== "neutral") {
      gestureTimeoutRef.current = setTimeout(() => {
        sendAction("gesture", {
          expression: "neutral",
          bubble: "",
          target_id: "",
        });
      }, 4500);
    }
  };

  // 3D Sahnede karaktere tıklanınca hedef seç & parmakla işaret et
  const handleSelectPlayerOnTable = (targetId) => {
    if (!targetId || targetId === playerId) return;
    setSelectedTargetId(targetId);
    const targetObj = gameState?.players?.find((p) => p.id === targetId);
    const tName = targetObj ? targetObj.name : "Sen";
    sendGesture("pointing", `👉 ${tName}!`, targetId);
  };

  // 3D Masadaki karta direkt tıklayınca ele veya yasalaştır
  const handleSelectCardOnTable = (cardIdx) => {
    if (!gameState) return;
    if (
      gameState.phase === "LEGISLATE_LEADER" &&
      gameState.leader_id === viewMeta.your_id
    ) {
      sendAction("leader_discard", { index: cardIdx });
    } else if (
      gameState.phase === "LEGISLATE_PARTNER" &&
      gameState.partner_id === viewMeta.your_id
    ) {
      sendAction("partner_enact", { index: cardIdx });
    }
  };

  const handleNameChange = (val) => {
    setPlayerName(val);
    localStorage.setItem("sp_player_name", val);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendAction("join", { name: val || "Komutan", avatar: "🛡️" });
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const isDark = theme === "dark";

  // --- BAĞLANTI BEKLENİYOR EKRANI ---
  if (!connected || !gameState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 sp-card border-0">
        <div className="w-12 h-12 rounded-full border-4 border-amber-500 border-t-transparent animate-spin mb-4" />
        <h1 className="text-2xl font-black tracking-widest uppercase">
          SILENT PROTOCOL
        </h1>
        <p className="text-sm sp-text-muted mt-2 font-mono">
          Masaya bağlanılıyor ({window.location.host})...
        </p>
        <span className="mt-4 px-3 py-1 rounded text-xs font-mono sp-btn-secondary">
          {APP_VERSION}
        </span>
      </div>
    );
  }

  const pub = gameState;
  const view = viewMeta;
  const yourId = view.your_id || playerId;
  const isLeader = pub.leader_id === yourId;
  const isPartner = pub.partner_id === yourId;
  const me = pub.players.find((p) => p.id === yourId);
  const otherPlayers = pub.players.filter((p) => p.id !== yourId);
  const mySuspicions = pub.suspicions?.[yourId] || {};

  // --- BAŞLANGIÇ MENÜSÜ / LOBİ (Klasik Menü) ---
  if (pub.phase === "LOBBY") {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sp-card border-x-0 border-t-0 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-black text-lg tracking-wider">
              SILENT PROTOCOL
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded sp-btn-secondary">
              {pub.version || APP_VERSION}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="sp-btn-secondary px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
            >
              {isDark ? "☀️ Beyaz Tema" : "🌙 Siyah Tema"}
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-4xl w-full sp-card rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="text-center mb-6">
              <span className="inline-block text-xs font-mono uppercase tracking-widest px-3 py-1 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 font-bold mb-2">
                3D Masabaşı Sosyal Çıkarım Oyunu
              </span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">
                SESSİZ PROTOKOL
              </h1>
              <p className="sp-text-muted text-sm max-w-xl mx-auto">
                Sözlü veya yazılı sohbet yok. Sadece{" "}
                <strong>3D parmakla işaret etme</strong>, sağa-sola bakışlar,
                mimikler ("Ha?!", "Aha!", "Hmm...") ve masadaki yasa kartları
                konuşur.
              </p>
            </div>

            {/* Oyuncu Adı & Tema Ayarı */}
            <div className="max-w-sm mx-auto mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider sp-text-muted mb-1.5">
                Masadaki Adın
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => handleNameChange(e.target.value)}
                className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold border focus:outline-none focus:border-amber-500 ${
                  isDark
                    ? "bg-black/30 border-white/15 text-white"
                    : "bg-zinc-100 border-zinc-300 text-zinc-900"
                }`}
                placeholder="Adını yaz..."
              />
            </div>

            {/* Masadaki Koltuklar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
              {pub.players.map((p, idx) => (
                <div
                  key={p.id}
                  className="sp-card rounded-xl p-3 flex flex-col items-center relative"
                >
                  {p.is_bot && (
                    <button
                      onClick={() =>
                        sendAction("remove_bot", { target_id: p.id })
                      }
                      title="Botu Masadan Kaldır"
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/15 hover:bg-red-500/30 text-red-500 text-xs font-bold flex items-center justify-center cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                  <CharacterAvatar
                    id={
                      p.is_bot
                        ? ["bot-1", "bot-2", "bot-3", "bot-4"][idx % 4]
                        : "player"
                    }
                    expression={p.expression || "neutral"}
                    className="w-16 h-16"
                  />
                  <span className="font-bold text-sm mt-1 truncate max-w-full">
                    {p.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider sp-text-muted mt-0.5">
                    {p.is_bot ? "Yapay Zeka Oyuncu" : "Sen (Masada)"}
                  </span>
                </div>
              ))}
            </div>

            {/* Başlat & Bot Ekle Butonları */}
            <div className="flex flex-wrap justify-center gap-3">
              {pub.players.length < 7 && (
                <button
                  onClick={() => sendAction("add_bot")}
                  className="sp-btn-secondary px-5 py-3 rounded-xl font-bold text-sm cursor-pointer"
                >
                  + Karakter Ekle ({pub.players.length}/7)
                </button>
              )}
              <button
                onClick={() => sendAction("start_game")}
                className="sp-btn-primary px-8 py-3 rounded-xl font-black text-sm shadow-xl cursor-pointer"
              >
                🎲 Masaya Otur ve Oyunu Başlat (
                {Math.max(5, pub.players.length)} Kişi)
              </button>
            </div>

            <div className="mt-6 pt-5 border-t border-neutral-500/20 grid sm:grid-cols-3 gap-3 text-xs sp-text-muted text-left">
              <div>
                <strong className="text-blue-500">🛡️ Koruyucular:</strong> 5
                Mavi Yasa çıkarır veya Gizli Lideri infaz ederse kazanır.
              </div>
              <div>
                <strong className="text-red-500">🚨 Casuslar & G.Lider:</strong>{" "}
                6 Kırmızı Yasa veya 3 Kırmızıdan sonra Gizli Lider Ortak
                seçilirse kazanır.
              </div>
              <div>
                <strong className="text-amber-500">🎭 Tam Ekran 3D:</strong>{" "}
                Kararlar, parmakla işaretler, mimikler ve kayıtlar sağ alttaki
                panelde!
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- TAM EKRAN 3D OYUN ALANI + SAĞ ALT BİRLEŞİK KUMANDA HUD ---
  const selectedTargetObj = pub.players.find((p) => p.id === selectedTargetId);
  const hudCardClass = isDark
    ? "bg-neutral-950/90 border-white/15 text-neutral-100"
    : "bg-white/95 border-neutral-300 text-neutral-900";
  const subBoxClass = isDark
    ? "bg-white/5 border-white/10"
    : "bg-neutral-100 border-neutral-300";

  return (
    <div
      className={`fixed inset-0 w-screen h-screen overflow-hidden select-none ${
        isDark ? "bg-[#221f1d]" : "bg-[#e5e7eb]"
      }`}
    >
      {/* 1. TAM EKRAN 3D MASA VE KARAKTERLER */}
      <div className="absolute inset-0 w-full h-full z-0">
        <Table3D
          pub={pub}
          view={view}
          theme={theme}
          cameraMode={cameraMode}
          selectedTargetId={selectedTargetId}
          onSelectPlayer={handleSelectPlayerOnTable}
          onSelectCard={handleSelectCardOnTable}
        />
      </div>

      {/* 2. ÜST İNCE DURUM ÇUBUĞU + KART ODAK BİLGİSİ (ASLA ÜST ÜSTE BİNMEZ) */}
      <div className="pointer-events-none fixed top-0 left-0 right-0 z-20 p-2.5 sm:px-4 flex flex-col items-center gap-1.5">
        <header className="w-full flex flex-wrap items-center justify-between gap-2">
          {/* Sol: Tur, Faz, 10sn Sayacı & Masadaki Yasa Durumu */}
          <div
            className={`pointer-events-auto flex flex-wrap items-center gap-1.5 backdrop-blur-md border px-3 py-1.5 rounded-xl shadow-xl text-[11px] ${hudCardClass}`}
          >
            <span className="font-black text-xs tracking-wider text-amber-500">
              SILENT PROTOCOL
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-500/20 opacity-80">
              {pub.version || APP_VERSION}
            </span>
            <span className="font-bold px-2 py-0.5 rounded bg-neutral-500/15">
              Tur #{pub.round}
            </span>
            <span className="font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/40">
              {translatePhase(pub.phase)}
            </span>
            {pub.phase !== "GAME_OVER" && (
              <span
                className={`font-mono font-extrabold px-2 py-0.5 rounded ${
                  phaseTimer <= 3
                    ? "bg-red-600 text-white animate-pulse"
                    : isDark
                    ? "bg-white/10 text-amber-300"
                    : "bg-neutral-200 text-amber-700"
                }`}
              >
                ⏱ {phaseTimer}s
              </span>
            )}

            <div className="h-3.5 w-[1px] bg-neutral-500/30 mx-0.5 hidden sm:block" />

            <div className="flex items-center gap-1 font-bold">
              <span className="px-1.5 py-0.5 rounded bg-blue-600/20 border border-blue-500/40 text-blue-500">
                🔵 {pub.blue_policies}/5
              </span>
              <span className="px-1.5 py-0.5 rounded bg-red-600/20 border border-red-500/40 text-red-500">
                🔴 {pub.red_policies}/6
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-500">
                ⚡ Kaos: {pub.chaos_counter}/3
              </span>
              <span className="text-[10px] opacity-70 font-mono hidden xl:inline ml-1">
                Deste:{pub.deck_count} | Iskarta:{pub.discard_count}
              </span>
            </div>
          </div>

          {/* Sağ: Kamera Açıları, Gizli Kimlik, Tema & Lobi */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
            <div
              className={`flex items-center backdrop-blur-md border rounded-xl p-0.5 text-[11px] shadow-xl ${hudCardClass}`}
            >
              <button
                onClick={() => setCameraMode("auto")}
                className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                  cameraMode === "auto"
                    ? "bg-amber-500 text-black"
                    : "hover:bg-neutral-500/20 opacity-80"
                }`}
                title="Kart çekilirken otomatik olarak masaya yaklaşır"
              >
                🎥 Oto
              </button>
              <button
                onClick={() => setCameraMode("table")}
                className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                  cameraMode === "table"
                    ? "bg-amber-500 text-black"
                    : "hover:bg-neutral-500/20 opacity-80"
                }`}
                title="Masadaki kartlara odaklan"
              >
                🃏 Masa
              </button>
              <button
                onClick={() => setCameraMode("characters")}
                className={`px-2 py-1 rounded-lg font-bold transition cursor-pointer ${
                  cameraMode === "characters"
                    ? "bg-amber-500 text-black"
                    : "hover:bg-neutral-500/20 opacity-80"
                }`}
                title="Masadaki karakterlere odaklan"
              >
                👥 Masaüstü
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowRoleSecret((prev) => !prev)}
                className={`backdrop-blur-md border px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xl cursor-pointer hover:border-amber-500 ${hudCardClass}`}
              >
                <span>🕵️ Rol:</span>
                <span
                  className={
                    showRoleSecret
                      ? view.your_role === "PROTECTOR"
                        ? "text-blue-500 font-black"
                        : "text-red-500 font-black"
                      : "blur-[4px] select-none"
                  }
                >
                  {translateRole(view.your_role)}
                </span>
                <span className="text-[10px] opacity-60">
                  ({showRoleSecret ? "Gizle" : "Aç"})
                </span>
              </button>

              {showRoleSecret && (
                <div
                  className={`absolute right-0 mt-2 w-64 border rounded-xl p-3 text-xs shadow-2xl z-30 ${hudCardClass}`}
                >
                  <div className="font-bold mb-1 text-amber-500">
                    Rolün: {translateRole(view.your_role)}
                  </div>
                  <p className="opacity-85 leading-relaxed">
                    {view.your_role === "PROTECTOR" &&
                      "5 Mavi Yasa çıkar veya Gizli Lideri tespit edip infaz et."}
                    {view.your_role === "SPY" &&
                      "Gizli Lideri koru ve 6 Kırmızı Yasa çıkarılmasına yardım et."}
                    {view.your_role === "SECRET_LEADER" &&
                      "Koruyucu gibi davran! 3 Kırmızı Yasadan sonra Ortak seçilirsen anında kazanırsın."}
                  </p>
                  {(view.your_role === "SPY" ||
                    view.your_role === "SECRET_LEADER") && (
                    <div className="mt-2 pt-2 border-t border-neutral-500/20 text-[11px] space-y-1">
                      {view.secret_leader_id && (
                        <div>
                          Gizli Lider:{" "}
                          <strong className="text-purple-500">
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
                          <strong className="text-red-500">
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
              className={`backdrop-blur-md border px-2.5 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer hover:border-amber-500 ${hudCardClass}`}
              title={isDark ? "Beyaz Temaya Geç" : "Siyah Temaya Geç"}
            >
              {isDark ? "☀️" : "🌙"}
            </button>

            <button
              onClick={() => sendAction("return_lobby")}
              className={`backdrop-blur-md border border-red-500/40 px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-red-500 cursor-pointer hover:bg-red-500/15 ${hudCardClass}`}
            >
              Menü
            </button>
          </div>
        </header>

        {/* Masa / Kart Odak Bilgi Şeridi (Sadece kart aşaması veya Masa kamerasında açılır) */}
        {(cameraMode === "table" ||
          (cameraMode === "auto" &&
            (pub.phase === "LEGISLATE_LEADER" ||
              pub.phase === "LEGISLATE_PARTNER" ||
              pub.phase === "POWERS_PEEK"))) && (
          <div
            className={`px-3.5 py-1 rounded-full text-[11px] font-bold shadow-lg border backdrop-blur-md ${hudCardClass} border-amber-500/50`}
          >
            <span className="text-amber-500">🃏 MASA KART ODAĞI:</span>{" "}
            <span className="font-normal opacity-90">
              {pub.phase === "LEGISLATE_LEADER"
                ? isLeader
                  ? "Masadaki 3 karttan ıskartaya atmak istediğine tıkla!"
                  : "Lider masadaki 3 karttan 1'ini eliyor..."
                : pub.phase === "LEGISLATE_PARTNER"
                ? isPartner
                  ? "Masadaki 2 karttan yürürlüğe koymak istediğine tıkla!"
                  : "Ortak masadaki 2 karttan 1'ini seçiyor..."
                : "Masadaki yasa kartları inceleniyor"}
            </span>
          </div>
        )}
      </div>

      {/* 3. SAĞ ALT BİRLEŞİK KUMANDA, MİMİK, PARMAKLA İŞARET VE KAYIT PANELİ */}
      <aside
        className={`pointer-events-auto fixed bottom-3 right-3 z-30 w-[calc(100vw-1.5rem)] sm:w-[390px] backdrop-blur-xl border rounded-2xl shadow-2xl flex flex-col transition-all duration-200 ${hudCardClass} ${
          hudMinimized ? "max-h-12" : "max-h-[76vh]"
        }`}
      >
        {/* Sekme Çubuğu */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-500/20 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setHudTab("controls");
                setHudMinimized(false);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                hudTab === "controls" && !hudMinimized
                  ? "bg-amber-500 text-black"
                  : "hover:bg-neutral-500/20 opacity-85"
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
                  : "hover:bg-neutral-500/20 opacity-85"
              }`}
            >
              <span>📋 Kayıtlar</span>
              <span className="text-[10px] px-1 rounded bg-neutral-500/25">
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
                  : "hover:bg-neutral-500/20 opacity-85"
              }`}
            >
              🗳️ Oylar ({pub.history?.length || 0})
            </button>
          </div>

          <button
            onClick={() => setHudMinimized((prev) => !prev)}
            className="px-2 py-1 rounded-lg text-xs font-bold hover:bg-neutral-500/20 opacity-85 cursor-pointer"
          >
            {hudMinimized ? "▲ Aç" : "▼ Küçült"}
          </button>
        </div>

        {/* Panel İçeriği */}
        {!hudMinimized && (
          <div className="p-3.5 overflow-y-auto space-y-3 text-xs">
            {hudTab === "controls" && (
              <>
                {/* BÖLÜM A: AKTİF FAZ KARARI */}
                <div className={`p-3 rounded-xl border space-y-2.5 ${subBoxClass}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase tracking-wider text-amber-500">
                      ⚡ {translatePhase(pub.phase)}
                    </span>
                    {pub.phase !== "GAME_OVER" && (
                      <span className="font-mono text-[11px] opacity-80">
                        Kalan: <strong>{phaseTimer} sn</strong>
                      </span>
                    )}
                  </div>

                  {/* 1. ORTAK SEÇİMİ */}
                  {pub.phase === "NOMINATION" && (
                    <div>
                      {isLeader ? (
                        <div className="space-y-2">
                          <p className="opacity-85">
                            Lider sensin! Yasaları birlikte çıkarmak için bir{" "}
                            <strong>Ortak (Partner)</strong> seç:
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
                                    sendAction("nominate", {
                                      candidate_id: p.id,
                                    });
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
                        <p className="opacity-85">
                          Lider{" "}
                          <strong className="text-amber-500">
                            {
                              pub.players.find((p) => p.id === pub.leader_id)
                                ?.name
                            }
                          </strong>{" "}
                          masadan bir Ortak adayı seçiyor...
                        </p>
                      )}
                    </div>
                  )}

                  {/* 2. HÜKÜMET OYLAMASI */}
                  {pub.phase === "VOTING" && (
                    <div className="space-y-2">
                      <p className="opacity-90">
                        Lider{" "}
                        <strong className="text-amber-500">
                          {
                            pub.players.find((p) => p.id === pub.leader_id)
                              ?.name
                          }
                        </strong>{" "}
                        & Ortak Adayı{" "}
                        <strong className="text-emerald-500">
                          {
                            pub.players.find((p) => p.id === pub.partner_id)
                              ?.name
                          }
                        </strong>{" "}
                        hükümetini onaylıyor musun?
                      </p>
                      {!me?.is_alive ? (
                        <div className="text-red-500 font-bold">
                          İnfaz edildiğin için oy kullanamazsın.
                        </div>
                      ) : pub.votes[yourId] ? (
                        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-500 font-bold text-center">
                          ✓ Oyun masaya bırakıldı. Diğer oyuncular bekleniyor...
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => sendAction("vote", { vote: "YES" })}
                            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition cursor-pointer shadow"
                          >
                            ✓ EVET (JA)
                          </button>
                          <button
                            onClick={() => sendAction("vote", { vote: "NO" })}
                            className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black transition cursor-pointer shadow"
                          >
                            ✕ HAYIR (NEIN)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. LİDER KART ELEMESİ */}
                  {pub.phase === "LEGISLATE_LEADER" && (
                    <div>
                      {isLeader && view.drawn_policies?.length > 0 ? (
                        <div className="space-y-2">
                          <p className="opacity-90">
                            Masadan 3 kart çektin.{" "}
                            <strong className="text-amber-500">
                              Iskartaya atmak istediğin 1 kartı seç
                            </strong>{" "}
                            (panelden veya doğrudan 3D masadaki karta tıkla):
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {view.drawn_policies.map((pol, idx) => (
                              <button
                                key={idx}
                                onClick={() =>
                                  sendAction("leader_discard", { index: idx })
                                }
                                className={`p-2.5 rounded-xl border-2 flex flex-col items-center justify-center gap-1 font-black transition hover:-translate-y-0.5 cursor-pointer text-white ${
                                  pol === "BLUE"
                                    ? "bg-blue-700 border-blue-400"
                                    : "bg-red-700 border-red-400"
                                }`}
                              >
                                <span className="text-sm">
                                  {pol === "BLUE" ? "🔵 MAVİ" : "🔴 KIRMIZI"}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/50">
                                  🗑️ Çöpe At
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="opacity-85">
                          🃏 Kamera masaya odaklandı: Lider{" "}
                          <strong className="text-amber-500">
                            {
                              pub.players.find((p) => p.id === pub.leader_id)
                                ?.name
                            }
                          </strong>{" "}
                          masadaki 3 gizli karttan 1'ini eliyor...
                        </p>
                      )}
                    </div>
                  )}

                  {/* 4. ORTAK YASA YÜRÜRLÜĞÜ */}
                  {pub.phase === "LEGISLATE_PARTNER" && (
                    <div>
                      {isPartner && view.drawn_policies?.length > 0 ? (
                        <div className="space-y-2">
                          <p className="opacity-90">
                            Lider masadan sana 2 yasa kartı verdi.{" "}
                            <strong className="text-emerald-500">
                              Yürürlüğe koymak istediğin kartı seç:
                            </strong>
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {view.drawn_policies.map((pol, idx) => (
                              <button
                                key={idx}
                                onClick={() =>
                                  sendAction("partner_enact", { index: idx })
                                }
                                className={`p-2.5 rounded-xl border-2 flex flex-col items-center justify-center gap-1 font-black transition hover:-translate-y-0.5 cursor-pointer text-white ${
                                  pol === "BLUE"
                                    ? "bg-blue-700 border-blue-400"
                                    : "bg-red-700 border-red-400"
                                }`}
                              >
                                <span className="text-sm">
                                  {pol === "BLUE" ? "🔵 MAVİ" : "🔴 KIRMIZI"}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-black/50">
                                  ✓ Yürürlüğe Koy
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="opacity-85">
                          🃏 Kamera masaya odaklandı: Ortak{" "}
                          <strong className="text-emerald-500">
                            {
                              pub.players.find((p) => p.id === pub.partner_id)
                                ?.name
                            }
                          </strong>{" "}
                          masadaki 2 karttan 1'ini seçiyor...
                        </p>
                      )}
                    </div>
                  )}

                  {/* 5. İDDİA & ÇELİŞKİ KONTROLÜ */}
                  {pub.phase === "CLAIMING" && pub.current_claim && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span>Masaya Koyulan Yasa:</span>
                        <span
                          className={`px-2 py-0.5 rounded font-black text-white ${
                            pub.current_claim.partner_enacted === "BLUE"
                              ? "bg-blue-600"
                              : "bg-red-600"
                          }`}
                        >
                          {pub.current_claim.partner_enacted === "BLUE"
                            ? "🔵 MAVİ YASA"
                            : "🔴 KIRMIZI YASA"}
                        </span>
                      </div>

                      {isLeader && !pub.current_claim.leader_claimed && (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                          <div className="font-bold text-amber-500">
                            Lider Beyanını Ver (Gerçek veya Blöf):
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              className={`border rounded p-1.5 text-xs ${
                                isDark
                                  ? "bg-neutral-900 border-white/20 text-white"
                                  : "bg-white border-neutral-300 text-neutral-900"
                              }`}
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
                              className={`border rounded p-1.5 text-xs ${
                                isDark
                                  ? "bg-neutral-900 border-white/20 text-white"
                                  : "bg-white border-neutral-300 text-neutral-900"
                              }`}
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
                              sendAction("leader_claim", {
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
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                          <div className="font-bold text-emerald-500">
                            Ortak Beyanı (Liderden Sana Ne Geldi?):
                          </div>
                          <select
                            className={`w-full border rounded p-1.5 text-xs ${
                              isDark
                                ? "bg-neutral-900 border-white/20 text-white"
                                : "bg-white border-neutral-300 text-neutral-900"
                            }`}
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
                              sendAction("partner_claim", {
                                received: partnerReceivedClaim,
                              })
                            }
                            className="w-full py-1.5 rounded-lg bg-emerald-500 text-black font-black cursor-pointer"
                          >
                            Beyanı Masaya Sun
                          </button>
                        </div>
                      )}

                      {!isLeader && !isPartner && (
                        <p className="opacity-80">
                          Lider ve Ortak masaya kart beyanlarını sunuyor...
                        </p>
                      )}

                      {pub.current_claim.has_conflict && (
                        <div className="p-2.5 rounded-lg bg-red-600 text-white font-bold stamp-conflict">
                          ⚡ {pub.current_claim.conflict_note}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 6. LİDER YETKİSİ: DESTEYE GÖZ ATMA */}
                  {pub.phase === "POWERS_PEEK" && (
                    <div>
                      {isLeader && view.peeked_policies?.length > 0 ? (
                        <div className="space-y-2">
                          <p className="opacity-90">
                            3. Kırmızı Yasa Yetkisi — Masadaki destenin en
                            üstündeki 3 kart:
                          </p>
                          <div className="flex gap-2">
                            {view.peeked_policies.map((pol, i) => (
                              <span
                                key={i}
                                className={`px-3 py-1.5 rounded-lg font-black text-white ${
                                  pol === "BLUE" ? "bg-blue-600" : "bg-red-600"
                                }`}
                              >
                                #{i + 1}: {pol === "BLUE" ? "MAVİ" : "KIRMIZI"}
                              </span>
                            ))}
                          </div>
                          <button
                            onClick={() => sendAction("close_peek")}
                            className="w-full py-2 rounded-lg bg-amber-500 text-black font-black cursor-pointer"
                          >
                            İncelemeyi Bitir
                          </button>
                        </div>
                      ) : (
                        <p className="opacity-85">
                          Lider destenin üstündeki 3 kartı inceliyor...
                        </p>
                      )}
                    </div>
                  )}

                  {/* 7. LİDER YETKİSİ: İNFAZ */}
                  {pub.phase === "POWERS_EXECUTION" && (
                    <div>
                      {isLeader ? (
                        <div className="space-y-2">
                          <p className="text-red-500 font-bold">
                            ⚖️ İnfaz Yetkisi: Masadan bir oyuncuyu infaz et!
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
                                    sendAction("execute_player", {
                                      target_id: p.id,
                                    });
                                  }}
                                  className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black cursor-pointer"
                                >
                                  💀 {p.name}
                                </button>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-red-500 font-bold">
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

                  {/* 8. ŞÜPHE, ÇELİŞKİ İNCELEME & İŞARET ETME */}
                  {pub.phase === "SUSPICION_MARKING" && (
                    <div className="space-y-2">
                      {pub.current_claim?.has_conflict ? (
                        <div className="p-2 rounded-lg bg-red-600 text-white font-bold stamp-conflict">
                          ⚡ {pub.current_claim.conflict_note}
                        </div>
                      ) : pub.current_claim ? (
                        <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 font-semibold">
                          ✓ {pub.current_claim.conflict_note}
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <span className="opacity-85">
                          Hedef seçip 3D parmağınla işaret et veya çip bırak.
                        </span>
                        <button
                          onClick={() => sendAction("finish_marking")}
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
                            ? "text-blue-500"
                            : "text-red-500"
                        }`}
                      >
                        {pub.winner === "PROTECTORS"
                          ? "🏆 KORUYUCULAR KAZANDI!"
                          : "🔥 CASUSLAR VE GİZLİ LİDER KAZANDI!"}
                      </div>
                      <p className="opacity-85">{pub.win_reason}</p>
                      <button
                        onClick={() => sendAction("start_game")}
                        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black cursor-pointer shadow-lg"
                      >
                        🔄 Yeni Oyun Başlat
                      </button>
                    </div>
                  )}
                </div>

                {/* BÖLÜM B: HEDEF SEÇİMİ, GERÇEK 3D PARMAKLA İŞARET & ÇİPLER */}
                <div className={`p-3 rounded-xl border space-y-2 ${subBoxClass}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider opacity-75">
                      🫵 Parmakla İşaret Et & Şüphe Çipi
                    </span>
                    {selectedTargetObj && (
                      <span className="text-[11px] text-amber-500 font-bold">
                        Hedef: {selectedTargetObj.name}
                      </span>
                    )}
                  </div>

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
                              ? "opacity-35 line-through border-neutral-500/20"
                              : isSel
                              ? "bg-amber-500 text-black border-amber-300 shadow"
                              : isDark
                              ? "bg-white/10 text-white border-white/15 hover:bg-white/20"
                              : "bg-white text-neutral-900 border-neutral-300 hover:bg-neutral-200"
                          }`}
                        >
                          <span>🫵 {p.name}</span>
                          {(chip === "SUSPECT" || chip === "SUSPICIOUS") && (
                            <span>🔴</span>
                          )}
                          {chip === "TRUSTED" && <span>🟢</span>}
                        </button>
                      );
                    })}
                  </div>

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
                        className="py-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/50 text-amber-500 font-bold cursor-pointer"
                      >
                        🫵 İşaret Et
                      </button>
                      <button
                        onClick={() =>
                          sendAction("toggle_suspicion", {
                            target_id: selectedTargetObj.id,
                            chip: "SUSPECT",
                          })
                        }
                        className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border ${
                          mySuspicions[selectedTargetObj.id] === "SUSPECT" ||
                          mySuspicions[selectedTargetObj.id] === "SUSPICIOUS"
                            ? "bg-red-600 text-white border-red-400"
                            : "bg-red-500/15 hover:bg-red-500/30 text-red-500 border-red-500/30"
                        }`}
                      >
                        🔴 Şüpheli
                      </button>
                      <button
                        onClick={() =>
                          sendAction("toggle_suspicion", {
                            target_id: selectedTargetObj.id,
                            chip: "TRUSTED",
                          })
                        }
                        className={`py-1.5 px-2 rounded-lg font-bold cursor-pointer border ${
                          mySuspicions[selectedTargetObj.id] === "TRUSTED"
                            ? "bg-emerald-600 text-white border-emerald-400"
                            : "bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-500 border-emerald-500/30"
                        }`}
                      >
                        🟢 Güvenilir
                      </button>
                    </div>
                  )}
                </div>

                {/* BÖLÜM C: MİMİKLER VE SAĞA-SOLA BAKIŞLAR */}
                <div className={`p-3 rounded-xl border space-y-2 ${subBoxClass}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider opacity-75">
                      👀 Bakışlar & Mimik Tepkileri
                    </span>
                    {me?.bubble && (
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px]">
                        Sen: "{me.bubble}"
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      ["thinking", "Hmm...", "🤔 Hmm..."],
                      ["surprised", "Ha?!", "😲 Ha?!"],
                      ["eureka", "Aha!", "💡 Aha!"],
                      ["look_left", "👈...", "👈 Sola Bak"],
                      ["look_right", "...👉", "👉 Sağa Bak"],
                      ["neutral", "", "😐 Normal"],
                    ].map(([exprKey, bub, label]) => (
                      <button
                        key={exprKey}
                        onClick={() =>
                          sendGesture(
                            exprKey,
                            bub,
                            exprKey === "neutral" ? "" : undefined
                          )
                        }
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold cursor-pointer border transition whitespace-nowrap ${
                          me?.expression === exprKey && exprKey !== "neutral"
                            ? "bg-amber-500 text-black border-amber-300"
                            : isDark
                            ? "bg-white/10 hover:bg-white/20 text-white border-white/10"
                            : "bg-white hover:bg-neutral-200 text-neutral-900 border-neutral-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Son 2 Olay Kaydı Özeti */}
                  <div className="pt-2 border-t border-neutral-500/20 space-y-1">
                    {(pub.logs || []).slice(-2).map((l, i) => (
                      <div key={i} className="text-[11px] opacity-85 truncate">
                        <span className="font-mono opacity-60 mr-1.5">
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
                        ? "bg-red-600/25 border-red-500/60 font-bold"
                        : log.type === "alert"
                        ? "bg-amber-500/20 border-amber-500/50 font-semibold"
                        : log.type === "policy"
                        ? "bg-blue-500/15 border-blue-500/40"
                        : subBoxClass
                    }`}
                  >
                    <span className="font-mono text-[10px] opacity-60 mr-2">
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
                  <p className="opacity-70 italic">
                    Henüz tamamlanmış bir oylama yok.
                  </p>
                )}
                {(pub.history || [])
                  .slice()
                  .reverse()
                  .map((h, i) => {
                    return (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg border space-y-1.5 ${subBoxClass}`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-amber-500">
                            Tur #{h.round}: {h.leader_name} & {h.partner_name}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                              h.passed
                                ? "bg-emerald-500/20 text-emerald-500"
                                : "bg-red-500/20 text-red-500"
                            }`}
                          >
                            {h.passed ? "ONAYLANDI" : "REDDEDİLDİ"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(h.votes || {}).map(([pid, v]) => {
                            const voter = pub.players.find(
                              (p) => p.id === pid
                            )?.name;
                            return (
                              <span
                                key={pid}
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  v === "YES"
                                    ? "bg-emerald-500/20 text-emerald-500"
                                    : "bg-red-500/20 text-red-500"
                                }`}
                              >
                                {voter}: {v === "YES" ? "EVET" : "HAYIR"}
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
      return "Başlangıç Menüsü";
    case "NOMINATION":
      return "Ortak Seçimi";
    case "VOTING":
      return "Masa Oylaması";
    case "LEGISLATE_LEADER":
      return "Lider Kart Elemesi";
    case "LEGISLATE_PARTNER":
      return "Ortak Kart Seçimi";
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
