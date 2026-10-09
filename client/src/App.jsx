import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Skull, 
  Crown, 
  Vote, 
  AlertTriangle, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Sun, 
  Moon, 
  History, 
  Sparkles,
  Flame,
  FileText,
  UserX,
  Briefcase,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { CharacterAvatar, ReactionBubble } from './components/Characters';
import { Table3D } from './components/Table3D';

const VERSION = "v0.4.0";
const ROUND_TIME_LIMIT = 12; // 12 saniyelik gerilim süresi

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [yourId, setYourId] = useState("");
  const [yourRole, setYourRole] = useState("");
  const [knownAllies, setKnownAllies] = useState([]);
  const [secretLeaderId, setSecretLeaderId] = useState("");
  const [drawnPolicies, setDrawnPolicies] = useState([]);
  const [peekedPolicies, setPeekedPolicies] = useState([]);
  
  const [playerName] = useState("Komutan (Sen)");
  const [connected, setConnected] = useState(false);
  const [showRoleSecret, setShowRoleSecret] = useState(true);
  const [showLogsPanel, setShowLogsPanel] = useState(true);
  const [theme, setTheme] = useState("dark"); // 'dark' | 'light'
  
  // 10-12 saniyelik görsel tur zamanlayıcısı
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_LIMIT);
  const prevPhaseRef = useRef(null);

  // İddia oluşturma form durumları
  const [claimDrawnBlue, setClaimDrawnBlue] = useState(1);
  const [claimPassedBlue, setClaimPassedBlue] = useState(1);
  const [claimRecBlue, setClaimRecBlue] = useState(1);

  const wsRef = useRef(null);
  const logsEndRef = useRef(null);

  // Tema değiştirme
  useEffect(() => {
    document.body.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
  }, [theme]);

  // WebSocket Bağlantısı
  useEffect(() => {
    let savedId = localStorage.getItem("sp_player_id");
    if (!savedId) {
      savedId = "p-" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("sp_player_id", savedId);
    }
    setYourId(savedId);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:8080/ws?id=${savedId}`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({
          type: "join",
          name: playerName,
          avatar: "Komutan"
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "state") {
            const payload = msg.payload;
            setGameState(payload.public_state);
            setYourId(payload.your_id);
            setYourRole(payload.your_role || "");
            setKnownAllies(payload.known_allies || []);
            setSecretLeaderId(payload.secret_leader_id || "");
            setDrawnPolicies(payload.drawn_policies || []);
            setPeekedPolicies(payload.peeked_policies || []);
          }
        } catch (e) {
          console.error("Mesaj parse hatası:", e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Faz değiştiğinde sayacı sıfırla ve gerilimi başlat
  useEffect(() => {
    if (gameState?.phase && gameState.phase !== prevPhaseRef.current) {
      prevPhaseRef.current = gameState.phase;
      setTimeLeft(ROUND_TIME_LIMIT);
    }
  }, [gameState?.phase]);

  // Geri sayım sayacı
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState?.logs]);

  const sendAction = (type, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  };

  const sendGesture = (expression, bubble, targetId = "") => {
    sendAction("gesture", { expression, bubble, target_id: targetId });
    setTimeout(() => {
      sendAction("gesture", { expression: "neutral", bubble: "", target_id: "" });
    }, 3500);
  };

  const isDark = theme === "dark";
  const pub = gameState || {};
  const isLeader = pub.leader_id === yourId;
  const isPartner = pub.partner_id === yourId;
  const currentLeaderObj = pub.players?.find(p => p.id === pub.leader_id);
  const currentPartnerObj = pub.players?.find(p => p.id === pub.partner_id);

  if (!connected) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${isDark ? 'bg-[#0c0d10] text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
        <Clock className="w-12 h-12 text-amber-500 animate-spin mb-4" />
        <h1 className="text-2xl font-serif font-black tracking-widest uppercase">SESSİZ PROTOKOL 3D</h1>
        <p className="text-sm opacity-70 mt-2 font-mono">3D Sahneye bağlanılıyor (localhost:8080)...</p>
        <span className="mt-4 px-3 py-1 bg-zinc-800 text-zinc-400 rounded text-xs font-mono">{VERSION}</span>
      </div>
    );
  }

  const allPlayers = pub.players || [];
  const you = allPlayers.find(p => p.id === yourId) || { id: yourId, name: "Komutan (Sen)", is_alive: true };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 relative overflow-hidden ${
      isDark ? 'bg-[#0a0b0e] text-zinc-200' : 'bg-[#f4f5f8] text-zinc-900'
    }`}>
      
      {/* ÜST BAR (HEADER) */}
      <header className={`px-4 py-2.5 border-b flex items-center justify-between sticky top-0 z-50 backdrop-blur-md ${
        isDark ? 'bg-[#101217]/90 border-zinc-800' : 'bg-white/90 border-zinc-300'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber-600/20 border border-amber-600/40 flex items-center justify-center text-amber-500 font-serif font-black text-sm shadow-sm">
            3D
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-black tracking-wider text-base md:text-lg">
                SESSİZ PROTOKOL
              </h1>
              <span className={`text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border ${
                isDark ? 'bg-zinc-800 border-zinc-700 text-amber-400' : 'bg-zinc-200 border-zinc-300 text-zinc-700'
              }`}>
                3D ETKİLEŞİMLİ MASA
              </span>
            </div>
            <p className="text-[10px] opacity-60">Karakterler Sağa-Sola Bakar &bull; 10s Karar Süresi &bull; Çelişki Motoru</p>
          </div>
        </div>

        {/* SAĞ TARAF: SÜRE, TEMA VE VERSİYON */}
        <div className="flex items-center gap-3">
          {/* Canlı Sayaç */}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border font-mono text-xs font-bold transition-all ${
            timeLeft <= 3 
              ? 'bg-red-950/80 border-red-500 text-red-400 pulse-danger' 
              : isDark 
              ? 'bg-zinc-900 border-zinc-700 text-amber-400' 
              : 'bg-zinc-100 border-zinc-300 text-zinc-800'
          }`}>
            <Clock className={`w-3.5 h-3.5 ${timeLeft <= 3 ? 'text-red-400 animate-spin' : 'text-amber-500'}`} />
            <span>SÜRE:</span>
            <span className="text-sm font-black">{timeLeft}s</span>
          </div>

          {/* Tema Değiştirici */}
          <button 
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title="Temayı Değiştir"
            className={`p-1.5 rounded-lg border flex items-center gap-1 text-xs font-semibold ${
              isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-700" />}
          </button>

          <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
            isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-400' : 'bg-zinc-200 border-zinc-300 text-zinc-600'
          }`}>
            {VERSION}
          </span>
        </div>
      </header>

      {/* MERKEZ: 3D MASA SAHNESİ VE OYUN ALANI */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-5 flex flex-col gap-4">

        {/* 1. THREE.JS 3D MASA SAHNESİ */}
        <div className="w-full relative">
          <Table3D 
            players={pub.players || []}
            yourId={yourId}
            phase={pub.phase}
            votes={pub.votes || {}}
            lastVoteItem={pub.last_vote_item}
            bluePolicies={pub.blue_policies || 0}
            redPolicies={pub.red_policies || 0}
            chaosCounter={pub.chaos_counter || 0}
            currentClaim={pub.current_claim}
          />

          {/* SOL ÜSTTE: GİZLİ KİMLİK KARTI (OVERLAY) */}
          <div className="absolute top-3 left-3 z-30 max-w-[240px]">
            <div className={`p-3 rounded-2xl border backdrop-blur-md shadow-2xl transition-all ${
              isDark ? 'bg-[#12141a]/95 border-zinc-700/80' : 'bg-white/95 border-zinc-300'
            }`}>
              <div className="flex items-center justify-between border-b pb-1.5 mb-2 border-zinc-700/40">
                <span className="text-[10px] font-serif font-bold uppercase tracking-wider flex items-center gap-1 opacity-80">
                  <FileText className="w-3.5 h-3.5 text-amber-500" /> Gizli Dosyan
                </span>
                <button
                  onClick={() => setShowRoleSecret(!showRoleSecret)}
                  className="text-[10px] opacity-70 hover:opacity-100 flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>{showRoleSecret ? "Gizle" : "Aç"}</span>
                </button>
              </div>

              {showRoleSecret ? (
                <div className={`p-2 rounded-xl border text-center ${
                  yourRole === "PROTECTOR"
                    ? "bg-slate-900/90 border-blue-600/40 text-blue-200"
                    : yourRole === "SPY"
                    ? "bg-rose-950/70 border-rose-600/40 text-rose-200"
                    : yourRole === "SECRET_LEADER"
                    ? "bg-purple-950/70 border-purple-600/40 text-purple-200"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500"
                }`}>
                  <div className="text-xl">
                    {yourRole === "PROTECTOR" && "🛡️"}
                    {yourRole === "SPY" && "🕵️"}
                    {yourRole === "SECRET_LEADER" && "👑"}
                    {!yourRole && "⏳"}
                  </div>
                  <div className="text-xs font-serif font-black tracking-wide">
                    {yourRole === "PROTECTOR" && "KORUYUCU"}
                    {yourRole === "SPY" && "CASUS"}
                    {yourRole === "SECRET_LEADER" && "GİZLİ LİDER"}
                    {!yourRole && "LOBİ"}
                  </div>
                  {(yourRole === "SPY" || yourRole === "SECRET_LEADER") && (
                    <div className="mt-1.5 pt-1.5 border-t border-zinc-700/40 text-left text-[10px]">
                      {secretLeaderId && (
                        <div>Lider: <strong className="text-purple-400">{pub.players?.find(p => p.id === secretLeaderId)?.name}</strong></div>
                      )}
                      {knownAllies.length > 0 && (
                        <div>Casus: <strong className="text-rose-400">{knownAllies.map(id => pub.players?.find(p => p.id === id)?.name).join(", ")}</strong></div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[10px] opacity-50 text-center py-2">
                  🔒 Dosya Kapalı
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. OYUNCUNUN KONTROL KONSOLU & SESSİZ MİMİK ÇARKI */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          
          {/* SOL: SENİN KOLTUĞUN & MİMİK/JEST ÇARKI (5 KOLON) */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <div className={`p-3.5 rounded-2xl border shadow-lg relative ${
              isDark ? 'bg-[#12141a] border-zinc-800' : 'bg-white border-zinc-300'
            }`}>
              <ReactionBubble text={you.bubble} />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CharacterAvatar id="player" expression={you.expression || "neutral"} className="w-12 h-12" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs">{you.name}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-600/20 text-amber-500 border border-amber-600/30">
                        SEN
                      </span>
                    </div>
                    <div className="flex gap-1 mt-1">
                      {you.id === pub.leader_id && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-black flex items-center gap-1">
                          <Crown className="w-2.5 h-2.5" /> LİDER
                        </span>
                      )}
                      {you.id === pub.partner_id && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-600 text-white flex items-center gap-1">
                          <Briefcase className="w-2.5 h-2.5" /> ORTAK
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {pub.phase === "VOTING" && (
                  <span className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-amber-950/80 text-amber-300 border border-amber-800 animate-pulse">
                    Oy Bekleniyor
                  </span>
                )}
              </div>

              {/* SESSİZ MİMİK & REAKSİYON BUTONLARI */}
              <div className="mt-3 pt-2.5 border-t border-zinc-700/40">
                <span className="text-[10px] font-serif uppercase tracking-wider opacity-60 font-bold block mb-1.5">
                  🎭 Sessiz Mimik & Jestlerin (Kafan döner ve baloncuk çıkar):
                </span>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <button
                    onClick={() => sendGesture("thinking", "Hmm...")}
                    className="p-1.5 rounded-lg border bg-zinc-900/60 hover:bg-zinc-800 border-zinc-700 text-amber-400 font-bold active:scale-95 text-center"
                  >
                    🧐 Hmm...
                  </button>
                  <button
                    onClick={() => sendGesture("surprised", "Ha?!")}
                    className="p-1.5 rounded-lg border bg-zinc-900/60 hover:bg-zinc-800 border-zinc-700 text-rose-400 font-bold active:scale-95 text-center"
                  >
                    😲 Ha?!
                  </button>
                  <button
                    onClick={() => sendGesture("eureka", "Aha!")}
                    className="p-1.5 rounded-lg border bg-zinc-900/60 hover:bg-zinc-800 border-zinc-700 text-yellow-300 font-bold active:scale-95 text-center"
                  >
                    💡 Aha!
                  </button>
                  <button
                    onClick={() => sendGesture("look_left", "👈...")}
                    className="p-1.5 rounded-lg border bg-zinc-900/60 hover:bg-zinc-800 border-zinc-700 text-zinc-300 font-bold active:scale-95 text-center"
                  >
                    👈 Solu Süz
                  </button>
                  <button
                    onClick={() => sendGesture("look_right", "...👉")}
                    className="p-1.5 rounded-lg border bg-zinc-900/60 hover:bg-zinc-800 border-zinc-700 text-zinc-300 font-bold active:scale-95 text-center"
                  >
                    👉 Sağı Süz
                  </button>
                  <button
                    onClick={() => sendGesture("pointing", "👉 Sen!")}
                    className="p-1.5 rounded-lg border bg-zinc-900/60 hover:bg-zinc-800 border-zinc-700 text-red-400 font-bold active:scale-95 text-center"
                  >
                    🫵 İşaret Et
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SAĞ: DİNAMİK KARAR ALANI (7 KOLON) */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className={`p-4 rounded-2xl border shadow-lg flex-1 ${
              isDark ? 'bg-[#12141a] border-zinc-800' : 'bg-white border-zinc-300'
            }`}>
              
              {/* LOBİ */}
              {pub.phase === "LOBBY" && (
                <div className="text-center py-3">
                  <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-1.5" />
                  <h3 className="text-base font-serif font-black mb-1">Masa Hazır (3D Görünüm)</h3>
                  <p className="text-xs opacity-70 mb-4 max-w-sm mx-auto">
                    Karakterler sağa sola bakabilir, tepkilerini mimiklerle verir. Konuşma yasaktır.
                  </p>
                  <button
                    onClick={() => sendAction("start_game")}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs shadow-md transition-all active:scale-95"
                  >
                    Oyunu Başlat (Botları Masaya Çağır)
                  </button>
                </div>
              )}

              {/* ADAYLIK (NOMINATION) */}
              {pub.phase === "NOMINATION" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-serif font-bold uppercase text-amber-500">
                      Hükümet Kurulumu
                    </span>
                    <span className="text-[11px] opacity-70">
                      Lider: <strong>{currentLeaderObj?.name}</strong>
                    </span>
                  </div>

                  {isLeader ? (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-400 font-bold">
                        👑 Lidersiniz. Masadaki bir oyuncuyu Ortak olarak seçin:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {pub.players?.filter(p => p.id !== yourId && p.is_alive).map(cand => {
                          const isPrev = cand.id === pub.prev_partner_id;
                          return (
                            <button
                              key={cand.id}
                              disabled={isPrev}
                              onClick={() => sendAction("nominate", { candidate_id: cand.id })}
                              className={`p-2.5 rounded-xl border text-left flex items-center gap-2 ${
                                isPrev 
                                  ? 'opacity-40 cursor-not-allowed border-zinc-800' 
                                  : isDark ? 'hover:border-amber-500 bg-zinc-950 border-zinc-800' : 'hover:border-zinc-500 bg-zinc-50 border-zinc-300'
                              }`}
                            >
                              <CharacterAvatar id={cand.id} className="w-8 h-8" />
                              <div className="truncate">
                                <div className="font-bold text-xs truncate">{cand.name}</div>
                                <div className="text-[9px] opacity-60">{isPrev ? "Önceki" : "Aday"}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border flex items-center gap-3 text-xs opacity-75 border-dashed border-zinc-700">
                      <Clock className="w-4 h-4 text-amber-500 animate-spin" />
                      <span>Lider {currentLeaderObj?.name} bir Ortak adayı düşünüyor...</span>
                    </div>
                  )}
                </div>
              )}

              {/* OYLAMA (VOTING) */}
              {pub.phase === "VOTING" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-xs font-serif font-black uppercase text-amber-500">
                        Güven Oylaması
                      </h3>
                      <p className="text-xs opacity-75">
                        Öneri: <strong>{currentLeaderObj?.name}</strong> & <strong>{currentPartnerObj?.name}</strong>
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      Oylar Masaya Bırakılıyor...
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => sendAction("vote", { vote: "YES" })}
                      className="py-3 px-4 bg-emerald-800 hover:bg-emerald-700 text-white font-serif font-black text-xs rounded-xl shadow flex items-center justify-center gap-2 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>KABUL (JA!)</span>
                    </button>
                    <button
                      onClick={() => sendAction("vote", { vote: "NO" })}
                      className="py-3 px-4 bg-rose-900 hover:bg-rose-800 text-white font-serif font-black text-xs rounded-xl shadow flex items-center justify-center gap-2 active:scale-95"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>REDDET (NEIN!)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* LİDER KART ELEME */}
              {pub.phase === "LEGISLATE_LEADER" && (
                <div>
                  <h3 className="text-xs font-serif font-bold uppercase text-amber-500 mb-2">
                    Lider 1 Kart Eliyor
                  </h3>
                  {isLeader ? (
                    <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
                      {drawnPolicies.map((pol, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendAction("leader_discard", { index: idx })}
                          className={`aspect-[2/3] rounded-xl border-2 p-2 flex flex-col items-center justify-between text-white font-bold shadow ${
                            pol === "BLUE" ? 'bg-blue-800 border-blue-400' : 'bg-rose-900 border-rose-400'
                          }`}
                        >
                          <span className="text-[9px] opacity-75">#{idx+1}</span>
                          {pol === "BLUE" ? <Shield className="w-6 h-6" /> : <Skull className="w-6 h-6" />}
                          <span className="text-[9px] bg-black/60 px-1.5 py-0.5 rounded">At</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border flex items-center gap-3 text-xs opacity-75 border-dashed border-zinc-700">
                      <Clock className="w-4 h-4 text-amber-500 animate-spin" />
                      <span>Lider {currentLeaderObj?.name} kartları inceliyor...</span>
                    </div>
                  )}
                </div>
              )}

              {/* ORTAK KART SEÇİMİ */}
              {pub.phase === "LEGISLATE_PARTNER" && (
                <div>
                  <h3 className="text-xs font-serif font-bold uppercase text-amber-500 mb-2">
                    Ortak Yasalaştırıyor
                  </h3>
                  {isPartner ? (
                    <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                      {drawnPolicies.map((pol, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendAction("partner_enact", { index: idx })}
                          className={`aspect-[2/3] rounded-xl border-2 p-2 flex flex-col items-center justify-between text-white font-bold shadow ${
                            pol === "BLUE" ? 'bg-blue-800 border-blue-400' : 'bg-rose-900 border-rose-400'
                          }`}
                        >
                          <span className="text-[9px] opacity-75">#{idx+1}</span>
                          {pol === "BLUE" ? <Shield className="w-6 h-6" /> : <Skull className="w-6 h-6" />}
                          <span className="text-[9px] bg-black/60 px-1.5 py-0.5 rounded">YASALAŞTIR</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border flex items-center gap-3 text-xs opacity-75 border-dashed border-zinc-700">
                      <Clock className="w-4 h-4 text-amber-500 animate-spin" />
                      <span>Ortak {currentPartnerObj?.name} yasayı seçiyor...</span>
                    </div>
                  )}
                </div>
              )}

              {/* İDDİA MASASI */}
              {pub.phase === "CLAIMING" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-serif font-bold uppercase text-amber-500">
                      İddia ve Çelişki Tespiti
                    </span>
                    <span className="text-xs font-bold">
                      Yasa: {pub.current_claim?.partner_enacted === "BLUE" ? "🛡️ MAVİ" : "🚨 KIRMIZI"}
                    </span>
                  </div>

                  {/* Lider Beyan Formu */}
                  {isLeader && !pub.current_claim?.leader_claimed && (
                    <div className="p-2.5 rounded-xl border mb-3 text-xs bg-zinc-950/60 border-amber-900/40">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <select 
                          value={claimDrawnBlue} 
                          onChange={e => setClaimDrawnBlue(Number(e.target.value))}
                          className="bg-zinc-900 p-1.5 rounded border border-zinc-700"
                        >
                          <option value={0}>0 Mavi, 3 Kırmızı Çektim</option>
                          <option value={1}>1 Mavi, 2 Kırmızı Çektim</option>
                          <option value={2}>2 Mavi, 1 Kırmızı Çektim</option>
                          <option value={3}>3 Mavi, 0 Kırmızı Çektim</option>
                        </select>
                        <select 
                          value={claimPassedBlue} 
                          onChange={e => setClaimPassedBlue(Number(e.target.value))}
                          className="bg-zinc-900 p-1.5 rounded border border-zinc-700"
                        >
                          <option value={0}>0 Mavi, 2 Kırmızı Verdim</option>
                          <option value={1}>1 Mavi, 1 Kırmızı Verdim</option>
                          <option value={2}>2 Mavi, 0 Kırmızı Verdim</option>
                        </select>
                      </div>
                      <button
                        onClick={() => {
                          const drawn = Array(claimDrawnBlue).fill("BLUE").concat(Array(3 - claimDrawnBlue).fill("RED"));
                          const passed = Array(claimPassedBlue).fill("BLUE").concat(Array(2 - claimPassedBlue).fill("RED"));
                          sendAction("leader_claim", { drawn, passed });
                        }}
                        className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-xs"
                      >
                        İddianı Masaya Vur
                      </button>
                    </div>
                  )}

                  {/* Ortak Beyan Formu */}
                  {isPartner && !pub.current_claim?.partner_claimed && (
                    <div className="p-2.5 rounded-xl border mb-3 text-xs bg-zinc-950/60 border-purple-900/40">
                      <select 
                        value={claimRecBlue} 
                        onChange={e => setClaimRecBlue(Number(e.target.value))}
                        className="w-full bg-zinc-900 p-1.5 rounded border border-zinc-700 mb-2"
                      >
                        <option value={0}>0 Mavi, 2 Kırmızı Geldi</option>
                        <option value={1}>1 Mavi, 1 Kırmızı Geldi</option>
                        <option value={2}>2 Mavi Geldi</option>
                      </select>
                      <button
                        onClick={() => {
                          const received = Array(claimRecBlue).fill("BLUE").concat(Array(2 - claimRecBlue).fill("RED"));
                          sendAction("partner_claim", { received });
                        }}
                        className="w-full py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded font-bold text-xs"
                      >
                        İddianı Masaya Vur
                      </button>
                    </div>
                  )}

                  {/* ÇELİŞKİ ALARMI */}
                  {pub.current_claim?.has_conflict && (
                    <div className="p-3 bg-rose-950/90 border-2 border-rose-600 rounded-xl text-rose-200 stamp-conflict shadow-xl">
                      <div className="flex items-center gap-1.5 font-serif font-black text-xs uppercase text-rose-400 mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        ÇELİŞKİ TESPİT EDİLDİ! BİRİ YALAN SÖYLÜYOR!
                      </div>
                      <p className="text-[11px] text-rose-100">{pub.current_claim.conflict_note}</p>
                    </div>
                  )}

                  {pub.current_claim?.leader_claimed && pub.current_claim?.partner_claimed && !pub.current_claim?.has_conflict && (
                    <div className="p-2.5 bg-emerald-950/40 border border-emerald-600/40 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Beyanlar tutarlı. Açık çelişki bulunamadı.
                    </div>
                  )}
                </div>
              )}

              {/* YETKİ: PEEK */}
              {pub.phase === "POWERS_PEEK" && (
                <div className="p-3 rounded-xl border border-amber-600/50 bg-amber-950/20 text-xs">
                  <div className="font-serif font-bold text-amber-500 mb-2">3. Kırmızı Yasa: Gelecek Kartları İnceleme</div>
                  {isLeader ? (
                    <div>
                      <div className="flex gap-2 mb-2">
                        {peekedPolicies.map((p, idx) => (
                          <div key={idx} className={`p-2 rounded text-white font-bold ${p === "BLUE" ? "bg-blue-800" : "bg-rose-900"}`}>
                            #{idx+1}: {p === "BLUE" ? "Mavi" : "Kırmızı"}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => sendAction("close_peek")} className="px-3 py-1 bg-amber-600 text-white rounded font-bold text-xs">
                        Kapat ve Devam Et
                      </button>
                    </div>
                  ) : (
                    <p className="opacity-75">Lider gelecek kartları inceliyor...</p>
                  )}
                </div>
              )}

              {/* YETKİ: İNFAZ */}
              {pub.phase === "POWERS_EXECUTION" && (
                <div className="p-3 rounded-xl border border-rose-600/50 bg-rose-950/20 text-xs">
                  <div className="font-serif font-bold text-rose-500 mb-2">Casus Yetkisi: İNFAZ</div>
                  {isLeader ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {pub.players?.filter(p => p.id !== yourId && p.is_alive).map(t => (
                        <button
                          key={t.id}
                          onClick={() => sendAction("execute_player", { target_id: t.id })}
                          className="p-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 rounded-lg text-left"
                        >
                          <div className="font-bold truncate">{t.name}</div>
                          <div className="text-[10px] text-rose-400 font-bold">İnfaz Et</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="opacity-75">Lider infaz hedefi seçiyor...</p>
                  )}
                </div>
              )}

              {/* ŞÜPHE ÇİPLERİ */}
              {pub.phase === "SUSPICION_MARKING" && (
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-serif font-bold uppercase text-amber-500">Masa Gözlem</span>
                    <p className="opacity-70">Sağ alttan veya masadan oyunculara şüphe çipi koyabilirsiniz.</p>
                  </div>
                  <button onClick={() => sendAction("finish_marking")} className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-bold">
                    Sonraki Tura Geç ⏭️
                  </button>
                </div>
              )}

              {/* OYUN BİTTİ */}
              {pub.phase === "GAME_OVER" && (
                <div className="text-center py-4">
                  <div className="text-3xl mb-1">{pub.winner === "PROTECTORS" ? "🛡️" : "🚨"}</div>
                  <h3 className={`text-lg font-serif font-black mb-1 ${pub.winner === "PROTECTORS" ? "text-blue-500" : "text-rose-600"}`}>
                    {pub.winner === "PROTECTORS" ? "KORUYUCULAR KAZANDI!" : "CASUSLAR KAZANDI!"}
                  </h3>
                  <p className="text-xs opacity-80 mb-3">{pub.win_reason}</p>
                  <button onClick={() => sendAction("start_game")} className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs">
                    Yeniden Oyna
                  </button>
                </div>
              )}

            </div>
          </div>

        </div>

      </main>

      {/* 3. SAĞ ALT KÖŞEDE SABİT VE ŞIK CANLI OLAY LOG PANELİ (HUD) */}
      <div className={`fixed bottom-4 right-4 z-40 w-80 md:w-96 rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 ${
        isDark ? 'bg-[#101217]/95 border-zinc-700/80 text-zinc-300' : 'bg-white/95 border-zinc-300 text-zinc-800'
      }`}>
        {/* Panel Başlığı ve Aç/Kapa Butonu */}
        <div 
          onClick={() => setShowLogsPanel(!showLogsPanel)}
          className="p-3 border-b border-zinc-700/40 flex items-center justify-between cursor-pointer hover:bg-zinc-800/20"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-500" />
            <span className="font-serif font-bold text-xs uppercase tracking-wider">
              Canlı Masa Olay Paneli
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono opacity-50 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              CANLI
            </span>
            {showLogsPanel ? <ChevronDown className="w-4 h-4 opacity-70" /> : <ChevronUp className="w-4 h-4 opacity-70" />}
          </div>
        </div>

        {/* Panel İçeriği */}
        {showLogsPanel && (
          <div className="p-3">
            {/* Olay Akışı */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1">
              {pub.logs?.map((l, idx) => (
                <div 
                  key={idx}
                  className={`p-1.5 rounded leading-tight ${
                    l.type === "alert" 
                      ? 'bg-amber-950/50 text-amber-300 border border-amber-900/40' 
                      : l.type === "conflict"
                      ? 'bg-rose-950/70 text-rose-300 border border-rose-800 font-bold'
                      : l.type === "vote"
                      ? 'bg-zinc-900 text-zinc-300'
                      : l.type === "policy"
                      ? 'bg-blue-950/50 text-blue-300'
                      : 'opacity-70'
                  }`}
                >
                  <span className="opacity-40 text-[9px] mr-1.5">[{l.timestamp}]</span>
                  <span>{l.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>

            {/* Son Oylama Sonucu Mini Özeti */}
            {pub.last_vote_item && (
              <div className="mt-2.5 pt-2 border-t border-zinc-700/40 text-[10px]">
                <div className="flex justify-between items-center mb-1">
                  <span className="opacity-60">Son Oy:</span>
                  <span className={`font-bold ${pub.last_vote_item.passed ? "text-emerald-400" : "text-rose-400"}`}>
                    {pub.last_vote_item.passed ? "KABUL EDİLDİ" : "REDDEDİLDİ"}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {pub.players?.map(p => (
                    <div key={p.id} className="text-center p-1 rounded bg-zinc-900/60 border border-zinc-800">
                      <div className="truncate text-[9px] opacity-70">{p.name.split(' ')[0]}</div>
                      <div className={`font-bold ${pub.last_vote_item.votes?.[p.id] === "YES" ? "text-emerald-400" : "text-rose-400"}`}>
                        {pub.last_vote_item.votes?.[p.id] === "YES" ? "JA" : "NEIN"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
