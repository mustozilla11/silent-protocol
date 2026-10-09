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
  Briefcase
} from 'lucide-react';
import { CharacterAvatar } from './components/Characters';

const VERSION = "v0.2.0";
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
        <h1 className="text-2xl font-serif font-black tracking-widest uppercase">SESSİZ PROTOKOL</h1>
        <p className="text-sm opacity-70 mt-2 font-mono">Masaya oturuluyor (localhost:8080)...</p>
        <span className="mt-4 px-3 py-1 bg-zinc-800 text-zinc-400 rounded text-xs font-mono">{VERSION}</span>
      </div>
    );
  }

  // Masadaki 5 oyuncuyu konumlandırma:
  // Komutan (Sen) en altta, botlar masanın etrafında
  const allPlayers = pub.players || [];
  const you = allPlayers.find(p => p.id === yourId) || { id: yourId, name: "Komutan (Sen)", is_alive: true };
  const bots = allPlayers.filter(p => p.id !== yourId);

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${isDark ? 'bg-[#0d0e12] text-zinc-200' : 'bg-[#f4f5f8] text-zinc-900'}`}>
      
      {/* ÜST BAR (ZARİF VİNTAGE MASABAŞI BAŞLIĞI) */}
      <header className={`px-4 py-3 border-b flex items-center justify-between sticky top-0 z-50 backdrop-blur-md ${
        isDark ? 'bg-[#12141a]/90 border-zinc-800' : 'bg-white/90 border-zinc-300'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-amber-600/20 border border-amber-600/40 flex items-center justify-center text-amber-500 font-serif font-black shadow-sm">
            SP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-black tracking-wider text-base md:text-lg">
                SESSİZ PROTOKOL
              </h1>
              <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border ${
                isDark ? 'bg-zinc-800 border-zinc-700 text-amber-400' : 'bg-zinc-200 border-zinc-300 text-zinc-700'
              }`}>
                MASABAŞI SOSYAL ÇIKARIM
              </span>
            </div>
            <p className="text-[11px] opacity-60">Söz Yok. Sadece Bakışlar, İddialar ve Tahta Pullar.</p>
          </div>
        </div>

        {/* SAĞ TARAF: TEMA BUTONU, GERİLİM SAYACI VE VERSİYON */}
        <div className="flex items-center gap-4">
          
          {/* 10-12 Saniyelik Hamle Sayacı */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs font-bold transition-all ${
            timeLeft <= 3 
              ? 'bg-red-950/80 border-red-500 text-red-400 pulse-danger' 
              : isDark 
              ? 'bg-zinc-900 border-zinc-700 text-amber-400' 
              : 'bg-zinc-100 border-zinc-300 text-zinc-800'
          }`}>
            <Clock className={`w-4 h-4 ${timeLeft <= 3 ? 'text-red-400 animate-spin' : 'text-amber-500'}`} />
            <span>SÜRE:</span>
            <span className="text-sm font-black">{timeLeft}s</span>
          </div>

          {/* Siyah / Beyaz Tema Değiştirici */}
          <button 
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title="Temayı Değiştir (Siyah / Beyaz)"
            className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-all ${
              isDark 
                ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300' 
                : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700 shadow-sm'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-700" />}
            <span className="hidden sm:inline">{isDark ? "Açık Tema" : "Koyu Masa"}</span>
          </button>

          {/* Sürüm Rozeti */}
          <span className={`px-2 py-1 rounded text-xs font-mono font-bold border ${
            isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-400' : 'bg-zinc-200 border-zinc-300 text-zinc-600'
          }`}>
            {VERSION}
          </span>
        </div>
      </header>

      {/* ANA OYUN ALANI */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* SOL VE MERKEZ: MASABAŞI DÜZENİ (8 KOLON) */}
        <div className="lg:col-span-8 flex flex-col gap-5">

          {/* GERÇEK OVAL OYUN MASASI (POKER & BOARD GAME TABLE) */}
          <div className={`rounded-3xl p-4 md:p-6 relative transition-all duration-300 ${
            isDark ? 'poker-table-dark' : 'poker-table-light'
          }`}>
            
            {/* MASANIN ETRAFINDAKİ DİĞER OYUNCULAR (ÜST SIRADAKİ 4 BOT) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {bots.map((b) => (
                <PlayerSeat 
                  key={b.id} 
                  player={b} 
                  pub={pub} 
                  yourId={yourId} 
                  isDark={isDark} 
                  onToggleChip={(chip) => sendAction("toggle_suspicion", { target_id: b.id, chip })}
                />
              ))}
            </div>

            {/* MASANIN ORTASI (KORUYUCU & CASUS TAHTALARI + KAOS SAYACI) */}
            <div className={`rounded-2xl p-4 border transition-all ${
              isDark ? 'bg-[#12141a]/95 border-amber-900/30' : 'bg-white/95 border-zinc-300 shadow-md'
            }`}>
              
              {/* ÜST ŞERİT: KAOS SAYACI VE DESTE DURUMU */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 mb-4 border-zinc-700/40">
                <div className="flex items-center gap-2">
                  <Flame className={`w-4 h-4 ${pub.chaos_counter > 0 ? 'text-amber-500' : 'opacity-40'}`} />
                  <span className="text-xs font-bold uppercase tracking-wider font-serif">Seçim Kaosu:</span>
                  <div className="flex gap-1.5 ml-1">
                    {[1, 2, 3].map((val) => (
                      <div 
                        key={val} 
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all ${
                          pub.chaos_counter >= val
                            ? 'bg-amber-600 border-amber-300 text-white shadow-sm scale-110'
                            : isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-600' : 'bg-zinc-200 border-zinc-400 text-zinc-500'
                        }`}
                      >
                        {val}
                      </div>
                    ))}
                  </div>
                  {pub.chaos_counter === 2 && (
                    <span className="text-[10px] text-red-500 font-bold ml-1 animate-pulse">! İsyan Yakın</span>
                  )}
                </div>

                <div className="text-xs font-mono flex items-center gap-3 opacity-80">
                  <span>Deste: <strong>{pub.deck_count || 0}</strong> kart</span>
                  <span>Atılan: <strong>{pub.discard_count || 0}</strong></span>
                </div>
              </div>

              {/* İKİ ANA YASA TAHTASI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* 1. Koruyucu Yasaları (5 Yuva - Derin Mavi / Altın Vurgu) */}
                <div className={`p-3 rounded-xl border ${
                  isDark ? 'bg-[#0f172a]/70 border-slate-800' : 'bg-slate-50 border-slate-300'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-serif font-black tracking-wide flex items-center gap-1.5 text-blue-500">
                      <Shield className="w-4 h-4" /> KORUYUCU PROTOKOLÜ
                    </span>
                    <span className="text-xs font-mono font-bold text-blue-500">
                      {pub.blue_policies || 0} / 5
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((idx) => {
                      const isFilled = (pub.blue_policies || 0) >= idx;
                      return (
                        <div 
                          key={idx}
                          className={`aspect-[2/3] rounded border flex flex-col items-center justify-center p-1 text-center transition-all ${
                            isFilled 
                              ? 'bg-blue-700 border-blue-400 text-white shadow-md' 
                              : isDark ? 'bg-zinc-900/60 border-zinc-800 text-zinc-700' : 'bg-zinc-200 border-zinc-300 text-zinc-400'
                          }`}
                        >
                          {isFilled ? (
                            <Shield className="w-5 h-5 text-white" />
                          ) : (
                            <span className="text-[10px] font-bold">{idx}</span>
                          )}
                          {idx === 5 && !isFilled && <span className="text-[7px] text-blue-500 font-bold">ZAFER</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Casus Yasaları (6 Yuva - Derin Bordo / Kızıl Damga) */}
                <div className={`p-3 rounded-xl border ${
                  isDark ? 'bg-[#2a0e12]/50 border-red-950' : 'bg-rose-50 border-rose-300'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-serif font-black tracking-wide flex items-center gap-1.5 text-rose-600">
                      <Skull className="w-4 h-4" /> CASUS PROTOKOLÜ
                    </span>
                    <span className="text-xs font-mono font-bold text-rose-600">
                      {pub.red_policies || 0} / 6
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((idx) => {
                      const isFilled = (pub.red_policies || 0) >= idx;
                      return (
                        <div 
                          key={idx}
                          className={`aspect-[2/3] rounded border flex flex-col items-center justify-center p-1 text-center transition-all ${
                            isFilled 
                              ? 'bg-rose-700 border-rose-400 text-white shadow-md' 
                              : isDark ? 'bg-zinc-900/60 border-zinc-800 text-zinc-700' : 'bg-zinc-200 border-zinc-300 text-zinc-400'
                          }`}
                        >
                          {isFilled ? (
                            <Skull className="w-5 h-5 text-white" />
                          ) : (
                            <>
                              <span className="text-[10px] font-bold">{idx}</span>
                              {idx === 3 && <Eye className="w-3 h-3 text-amber-500" title="İnceleme" />}
                              {(idx === 4 || idx === 5) && <Skull className="w-3 h-3 text-rose-500" title="İnfaz" />}
                              {idx === 6 && <span className="text-[7px] text-rose-600 font-bold">ZAFER</span>}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* MASANIN ALTINDA: SENİN KOLTUĞUN (KOMUTAN / OYUNCU) */}
            <div className="mt-5 max-w-sm mx-auto">
              <div className={`p-3 rounded-2xl border flex items-center justify-between shadow-lg transition-all ${
                isDark ? 'bg-[#181a22] border-amber-500/40' : 'bg-white border-zinc-300'
              }`}>
                <div className="flex items-center gap-3">
                  <CharacterAvatar id="player" className="w-14 h-14" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{you.name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-500 border border-amber-600/30">
                        SEN
                      </span>
                    </div>
                    {/* Lider / Ortak Durumu */}
                    <div className="flex gap-1 mt-1">
                      {you.id === pub.leader_id && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-black flex items-center gap-1">
                          <Crown className="w-3 h-3" /> LİDER
                        </span>
                      )}
                      {you.id === pub.partner_id && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-600 text-white flex items-center gap-1">
                          <Briefcase className="w-3 h-3" /> ORTAK
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Senin Oylama Durumun / Kartın */}
                <div className="text-right">
                  {pub.phase === "VOTING" && (
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-amber-950/80 text-amber-300 border border-amber-800 animate-pulse">
                      Oy Bekleniyor
                    </span>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* MASANIN AKTİF KARAR VE HAMLE ALANI (DİNAMİK EYLEM KUTUSU) */}
          <div className={`rounded-2xl p-5 border shadow-xl transition-all ${
            isDark ? 'bg-[#13151b] border-zinc-800' : 'bg-white border-zinc-300'
          }`}>
            
            {/* LOBİ */}
            {pub.phase === "LOBBY" && (
              <div className="text-center py-4">
                <Sparkles className="w-10 h-10 text-amber-500 mx-auto mb-2" />
                <h3 className="text-lg font-serif font-black mb-1">Masa Kuruldu</h3>
                <p className="text-xs opacity-70 max-w-md mx-auto mb-5">
                  Herkes yerini aldı. Konuşma yasak; sadece işaretler, oylar ve çelişkiler üzerinden gerçeğe ulaşacaksınız.
                </p>
                <button
                  onClick={() => sendAction("start_game")}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-sm"
                >
                  Oyunu Başlat (4 Botu Masaya Oturt)
                </button>
              </div>
            )}

            {/* ADAYLIK (NOMINATION) */}
            {pub.phase === "NOMINATION" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-serif font-bold uppercase tracking-wider text-amber-500">
                    Hükümet Kurulumu (Ortak Seçimi)
                  </span>
                  <span className="text-xs opacity-70">
                    Mevcut Lider: <strong>{currentLeaderObj?.name}</strong>
                  </span>
                </div>

                {isLeader ? (
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-zinc-900/80 border-amber-900/40' : 'bg-zinc-50 border-zinc-300'}`}>
                    <p className="text-xs text-amber-400 font-bold mb-3">
                      👑 Lidersiniz. Masadaki bir oyuncuyu Ortak (Şansölye) olarak seçin:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {pub.players
                        ?.filter(p => p.id !== yourId && p.is_alive)
                        .map(cand => {
                          const isPrev = cand.id === pub.prev_partner_id;
                          return (
                            <button
                              key={cand.id}
                              disabled={isPrev}
                              onClick={() => sendAction("nominate", { candidate_id: cand.id })}
                              className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                                isPrev 
                                  ? 'opacity-40 cursor-not-allowed border-zinc-800' 
                                  : isDark 
                                  ? 'hover:border-amber-500 hover:bg-zinc-800 bg-zinc-950 border-zinc-800' 
                                  : 'hover:border-zinc-500 bg-white border-zinc-300 shadow-sm'
                              }`}
                            >
                              <CharacterAvatar id={cand.id} className="w-9 h-9" />
                              <div className="truncate">
                                <div className="font-bold text-xs truncate">{cand.name}</div>
                                <div className="text-[10px] opacity-60">{isPrev ? "Önceki Ortak" : "Aday Göster"}</div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border flex items-center gap-3 text-xs opacity-80 border-dashed border-zinc-700">
                    <Clock className="w-5 h-5 text-amber-500 animate-spin" />
                    <span>Lider <strong>{currentLeaderObj?.name}</strong> bir Ortak adayı düşünüyor...</span>
                  </div>
                )}
              </div>
            )}

            {/* OYLAMA (VOTING) */}
            {pub.phase === "VOTING" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-serif font-black uppercase tracking-wider text-amber-500">
                      Güven Oylaması (Ja / Nein)
                    </h3>
                    <p className="text-xs opacity-75">
                      Öneri: <strong>{currentLeaderObj?.name}</strong> (Lider) & <strong>{currentPartnerObj?.name}</strong> (Ortak)
                    </p>
                  </div>
                  <span className="text-xs font-mono px-2 py-1 rounded bg-zinc-800 text-zinc-300">
                    Masa Oyları Toplanıyor...
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => sendAction("vote", { vote: "YES" })}
                    className="py-4 px-6 bg-emerald-800 hover:bg-emerald-700 text-white font-serif font-black text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-95"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>KABUL (JA!)</span>
                  </button>
                  <button
                    onClick={() => sendAction("vote", { vote: "NO" })}
                    className="py-4 px-6 bg-rose-900 hover:bg-rose-800 text-white font-serif font-black text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-95"
                  >
                    <XCircle className="w-5 h-5" />
                    <span>REDDET (NEIN!)</span>
                  </button>
                </div>
              </div>
            )}

            {/* LİDER KART ELEME (LEGISLATE_LEADER) */}
            {pub.phase === "LEGISLATE_LEADER" && (
              <div>
                <h3 className="text-xs font-serif font-bold uppercase text-amber-500 mb-2">
                  Yasama: Lider Kart Eliyor
                </h3>
                {isLeader ? (
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-300'}`}>
                    <p className="text-xs opacity-80 mb-3">
                      🗂️ Desteden 3 gizli kart çektiniz. <strong>Atmak istediğiniz karta tıklayın</strong> (kalan 2'si Ortağa gider):
                    </p>
                    <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                      {drawnPolicies.map((pol, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendAction("leader_discard", { index: idx })}
                          className={`aspect-[2/3] rounded-xl border-2 p-3 flex flex-col items-center justify-between text-white font-bold transition-transform hover:scale-105 active:scale-95 shadow-md ${
                            pol === "BLUE" ? 'bg-blue-800 border-blue-400' : 'bg-rose-900 border-rose-400'
                          }`}
                        >
                          <span className="text-[10px] opacity-75">#{idx+1}</span>
                          {pol === "BLUE" ? <Shield className="w-8 h-8" /> : <Skull className="w-8 h-8" />}
                          <span className="text-[10px] bg-black/50 px-2 py-0.5 rounded">Bunu At</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border flex items-center gap-3 text-xs opacity-75 border-dashed border-zinc-700">
                    <Clock className="w-5 h-5 text-amber-500 animate-spin" />
                    <span>Lider {currentLeaderObj?.name} kartları inceliyor...</span>
                  </div>
                )}
              </div>
            )}

            {/* ORTAK KART YASALAŞTIRMA (LEGISLATE_PARTNER) */}
            {pub.phase === "LEGISLATE_PARTNER" && (
              <div>
                <h3 className="text-xs font-serif font-bold uppercase text-amber-500 mb-2">
                  Yasama: Ortak Karar Veriyor
                </h3>
                {isPartner ? (
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-300'}`}>
                    <p className="text-xs opacity-80 mb-3">
                      🏛️ Lider size 2 kart iletti. <strong>Yasalaştırmak istediğiniz karta tıklayın</strong>:
                    </p>
                    <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
                      {drawnPolicies.map((pol, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendAction("partner_enact", { index: idx })}
                          className={`aspect-[2/3] rounded-xl border-2 p-3 flex flex-col items-center justify-between text-white font-bold transition-transform hover:scale-105 active:scale-95 shadow-md ${
                            pol === "BLUE" ? 'bg-blue-800 border-blue-400' : 'bg-rose-900 border-rose-400'
                          }`}
                        >
                          <span className="text-[10px] opacity-75">SEÇENEK #{idx+1}</span>
                          {pol === "BLUE" ? <Shield className="w-8 h-8" /> : <Skull className="w-8 h-8" />}
                          <span className="text-[10px] bg-black/50 px-2 py-0.5 rounded">YASALAŞTIR</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border flex items-center gap-3 text-xs opacity-75 border-dashed border-zinc-700">
                    <Clock className="w-5 h-5 text-amber-500 animate-spin" />
                    <span>Ortak {currentPartnerObj?.name} son yasayı seçiyor...</span>
                  </div>
                )}
              </div>
            )}

            {/* İDDİA VE BEYAN AŞAMASI (CLAIMING - MASADAKİ TUTANAK) */}
            {pub.phase === "CLAIMING" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-serif font-black uppercase tracking-wider text-amber-500">
                      İddia Masası (Sessiz Beyan)
                    </h3>
                    <p className="text-xs opacity-70">
                      Çıkan Yasa: <strong>{pub.current_claim?.partner_enacted === "BLUE" ? "🛡️ KORUYUCU (MAVİ)" : "🚨 CASUS (KIRMIZI)"}</strong>
                    </p>
                  </div>
                </div>

                {/* Eğer Lider henüz beyan vermediyse ve sen Lidersen */}
                {isLeader && !pub.current_claim?.leader_claimed && (
                  <div className={`p-4 rounded-xl border mb-4 ${isDark ? 'bg-zinc-900 border-amber-900/40' : 'bg-amber-50/50 border-amber-200'}`}>
                    <h4 className="text-xs font-bold text-amber-500 mb-2">👑 Lider Beyanı Hazırla:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
                      <div>
                        <label className="block opacity-75 mb-1">Desteden Çektiğin Mavi Kart (0-3):</label>
                        <select 
                          value={claimDrawnBlue} 
                          onChange={e => setClaimDrawnBlue(Number(e.target.value))}
                          className={`w-full p-2 rounded border font-medium ${isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-white border-zinc-300'}`}
                        >
                          <option value={0}>0 Mavi, 3 Kırmızı Çektim</option>
                          <option value={1}>1 Mavi, 2 Kırmızı Çektim</option>
                          <option value={2}>2 Mavi, 1 Kırmızı Çektim</option>
                          <option value={3}>3 Mavi, 0 Kırmızı Çektim</option>
                        </select>
                      </div>
                      <div>
                        <label className="block opacity-75 mb-1">Ortağa İlettiğin Mavi Kart (0-2):</label>
                        <select 
                          value={claimPassedBlue} 
                          onChange={e => setClaimPassedBlue(Number(e.target.value))}
                          className={`w-full p-2 rounded border font-medium ${isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-white border-zinc-300'}`}
                        >
                          <option value={0}>0 Mavi, 2 Kırmızı Verdim</option>
                          <option value={1}>1 Mavi, 1 Kırmızı Verdim</option>
                          <option value={2}>2 Mavi, 0 Kırmızı Verdim</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const drawn = Array(claimDrawnBlue).fill("BLUE").concat(Array(3 - claimDrawnBlue).fill("RED"));
                        const passed = Array(claimPassedBlue).fill("BLUE").concat(Array(2 - claimPassedBlue).fill("RED"));
                        sendAction("leader_claim", { drawn, passed });
                      }}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs"
                    >
                      İddiamı Masaya Vur
                    </button>
                  </div>
                )}

                {/* Eğer Ortak henüz beyan vermediyse ve sen Ortaksan */}
                {isPartner && !pub.current_claim?.partner_claimed && (
                  <div className={`p-4 rounded-xl border mb-4 ${isDark ? 'bg-zinc-900 border-purple-900/40' : 'bg-purple-50/50 border-purple-200'}`}>
                    <h4 className="text-xs font-bold text-purple-400 mb-2">🏛️ Ortak Beyanı Hazırla:</h4>
                    <div className="text-xs mb-3">
                      <label className="block opacity-75 mb-1">Liderden Sana Gelen Mavi Kart (0-2):</label>
                      <select 
                        value={claimRecBlue} 
                        onChange={e => setClaimRecBlue(Number(e.target.value))}
                        className={`w-full p-2 rounded border font-medium ${isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-white border-zinc-300'}`}
                      >
                        <option value={0}>0 Mavi, 2 Kırmızı Geldi (Çaresiz Kırmızı Bastım)</option>
                        <option value={1}>1 Mavi, 1 Kırmızı Geldi</option>
                        <option value={2}>2 Mavi Geldi</option>
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        const received = Array(claimRecBlue).fill("BLUE").concat(Array(2 - claimRecBlue).fill("RED"));
                        sendAction("partner_claim", { received });
                      }}
                      className="w-full py-2 bg-purple-700 hover:bg-purple-600 text-white font-bold rounded-lg text-xs"
                    >
                      İddiamı Masaya Vur
                    </button>
                  </div>
                )}

                {/* ÇELİŞKİ MÜHÜRÜ VE TUTANAK PANELİ */}
                <div className={`p-4 rounded-xl border space-y-2.5 ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-300'}`}>
                  <div className="flex justify-between text-xs border-b pb-2 border-zinc-700/40">
                    <span className="opacity-70">Lider Beyanı ({currentLeaderObj?.name}):</span>
                    <span className="font-bold">{pub.current_claim?.leader_claimed ? "✅ Masada" : "⏳ Bekleniyor"}</span>
                  </div>
                  <div className="flex justify-between text-xs border-b pb-2 border-zinc-700/40">
                    <span className="opacity-70">Ortak Beyanı ({currentPartnerObj?.name}):</span>
                    <span className="font-bold">{pub.current_claim?.partner_claimed ? "✅ Masada" : "⏳ Bekleniyor"}</span>
                  </div>

                  {/* MASADAKİ ÇELİŞKİ DAMGASI */}
                  {pub.current_claim?.has_conflict && (
                    <div className="p-4 bg-rose-950/80 border-2 border-rose-600 rounded-xl text-rose-200 stamp-conflict shadow-xl mt-3">
                      <div className="flex items-center gap-2 font-serif font-black text-sm uppercase text-rose-400 mb-1">
                        <AlertTriangle className="w-5 h-5" />
                        ⚡ ÇELİŞKİ TESPİT EDİLDİ! BİRİ YALAN SÖYLÜYOR!
                      </div>
                      <p className="text-xs text-rose-100 font-medium">
                        {pub.current_claim.conflict_note}
                      </p>
                    </div>
                  )}

                  {pub.current_claim?.leader_claimed && pub.current_claim?.partner_claimed && !pub.current_claim?.has_conflict && (
                    <div className="p-3 bg-emerald-950/40 border border-emerald-600/40 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Beyanlar tutarlı. Açık bir çelişki tespit edilmedi.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* YETKİ: KART İNCELEME */}
            {pub.phase === "POWERS_PEEK" && (
              <div className="p-4 rounded-xl border border-amber-600/50 bg-amber-950/20">
                <div className="flex items-center gap-2 text-amber-500 font-serif font-bold text-sm mb-2">
                  <Eye className="w-4 h-4" /> 3. Kırmızı Yasa Yetkisi: Gelecek Yasaları İnceleme
                </div>
                {isLeader ? (
                  <div>
                    <div className="flex gap-2 mb-3">
                      {peekedPolicies.map((p, idx) => (
                        <div key={idx} className={`p-2.5 rounded border text-xs font-bold text-white ${p === "BLUE" ? "bg-blue-800" : "bg-rose-900"}`}>
                          #{idx+1}: {p === "BLUE" ? "Mavi" : "Kırmızı"}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => sendAction("close_peek")}
                      className="px-4 py-2 bg-amber-600 text-white rounded font-bold text-xs"
                    >
                      İncelemeyi Kapat ve Devam Et
                    </button>
                  </div>
                ) : (
                  <p className="text-xs opacity-75">Lider gelecek kartları inceliyor...</p>
                )}
              </div>
            )}

            {/* YETKİ: İNFAZ */}
            {pub.phase === "POWERS_EXECUTION" && (
              <div className="p-4 rounded-xl border border-rose-600/50 bg-rose-950/20">
                <div className="flex items-center gap-2 text-rose-500 font-serif font-bold text-sm mb-2">
                  <Skull className="w-4 h-4" /> İnfaz Kararı
                </div>
                {isLeader ? (
                  <div>
                    <p className="text-xs opacity-80 mb-3">Masadan birini infaz edin (Gizli Lider ölürse Koruyucular kazanır):</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {pub.players?.filter(p => p.id !== yourId && p.is_alive).map(t => (
                        <button
                          key={t.id}
                          onClick={() => sendAction("execute_player", { target_id: t.id })}
                          className="p-2.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 rounded-lg text-left"
                        >
                          <div className="font-bold text-xs truncate">{t.name}</div>
                          <div className="text-[10px] text-rose-400 font-bold mt-1">İnfaz Et</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs opacity-75">Lider bir infaz hedefi seçiyor...</p>
                )}
              </div>
            )}

            {/* ŞÜPHE İŞARETLEME */}
            {pub.phase === "SUSPICION_MARKING" && (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-serif font-bold uppercase text-amber-500">Masa Gözlem Aşaması</span>
                  <p className="text-xs opacity-70">Masadaki oyuncu koltuklarına tıklayarak Şüpheli 🔴 veya Güvenilir 🟢 çipi koyabilirsiniz.</p>
                </div>
                <button
                  onClick={() => sendAction("finish_marking")}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg border border-zinc-700"
                >
                  Sonraki Tura Geç ⏭️
                </button>
              </div>
            )}

            {/* OYUN BİTTİ */}
            {pub.phase === "GAME_OVER" && (
              <div className="text-center py-6">
                <div className="text-4xl mb-2">{pub.winner === "PROTECTORS" ? "🛡️" : "🚨"}</div>
                <h3 className={`text-xl font-serif font-black mb-2 ${pub.winner === "PROTECTORS" ? "text-blue-500" : "text-rose-600"}`}>
                  {pub.winner === "PROTECTORS" ? "KORUYUCULAR KAZANDI!" : "CASUSLAR KAZANDI!"}
                </h3>
                <p className="text-xs opacity-80 max-w-md mx-auto mb-5">{pub.win_reason}</p>
                <button
                  onClick={() => sendAction("start_game")}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs shadow-md"
                >
                  Yeniden Oyna
                </button>
              </div>
            )}

          </div>

        </div>

        {/* SAĞ PANEL: GİZLİ KİMLİK DOSYAN VE MASA LOGLARI (4 KOLON) */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          
          {/* GİZLİ DOSYA / KİMLİK KARTI (GİZLİLİK VE NOİR EVRAK HİSSİ) */}
          <div className={`p-4 rounded-2xl border shadow-lg transition-all ${
            isDark ? 'bg-[#12141a] border-zinc-800' : 'bg-white border-zinc-300'
          }`}>
            <div className="flex items-center justify-between border-b pb-2 mb-3 border-zinc-700/40">
              <span className="text-xs font-serif font-bold uppercase tracking-wider flex items-center gap-1.5 opacity-80">
                <FileText className="w-4 h-4 text-amber-500" /> Gizli Dosyanız
              </span>
              <button
                onClick={() => setShowRoleSecret(!showRoleSecret)}
                className="text-xs opacity-70 hover:opacity-100 flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showRoleSecret ? "Gizle" : "Göster"}</span>
              </button>
            </div>

            {showRoleSecret ? (
              <div className={`p-4 rounded-xl border text-center relative transition-all ${
                yourRole === "PROTECTOR"
                  ? "bg-slate-900/90 border-blue-600/40 text-blue-200"
                  : yourRole === "SPY"
                  ? "bg-rose-950/70 border-rose-600/40 text-rose-200"
                  : yourRole === "SECRET_LEADER"
                  ? "bg-purple-950/70 border-purple-600/40 text-purple-200"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              }`}>
                <div className="text-3xl mb-1">
                  {yourRole === "PROTECTOR" && "🛡️"}
                  {yourRole === "SPY" && "🕵️"}
                  {yourRole === "SECRET_LEADER" && "👑"}
                  {!yourRole && "⏳"}
                </div>
                <div className="text-base font-serif font-black tracking-wide">
                  {yourRole === "PROTECTOR" && "KORUYUCU (PROTECTOR)"}
                  {yourRole === "SPY" && "CASUS (INFILTRATOR)"}
                  {yourRole === "SECRET_LEADER" && "GİZLİ LİDER (SECRET LEADER)"}
                  {!yourRole && "LOBİDE BEKLENİYOR"}
                </div>
                <p className="text-[11px] opacity-75 mt-1.5 leading-relaxed">
                  {yourRole === "PROTECTOR" && "Çoğunluktasınız ama birbirinizi tanımıyorsunuz. Masadaki çelişkileri yakalayın!"}
                  {yourRole === "SPY" && "Gizli liderinizi tanıyorsunuz. Koruyucuları birbirine düşürün ve kırmızı yasa geçirin!"}
                  {yourRole === "SECRET_LEADER" && "Casusların liderisiniz. Koruyucu gibi görünün, 3 kırmızıdan sonra Ortak seçilmeye çalışın!"}
                </p>

                {(yourRole === "SPY" || yourRole === "SECRET_LEADER") && (
                  <div className="mt-3 pt-2.5 border-t border-zinc-700/50 text-left text-xs space-y-1">
                    <span className="font-bold text-amber-400 block text-[10px] uppercase">Gizli Şebeke Verileri:</span>
                    {secretLeaderId && (
                      <div className="text-zinc-300">
                        Gizli Lider: <strong className="text-purple-400">{pub.players?.find(p => p.id === secretLeaderId)?.name}</strong>
                      </div>
                    )}
                    {knownAllies.length > 0 && (
                      <div className="text-zinc-300">
                        Casus Müttefik: <strong className="text-rose-400">{knownAllies.map(id => pub.players?.find(p => p.id === id)?.name).join(", ")}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-zinc-700 text-center text-xs opacity-50">
                🔒 Kimlik dosyası kapalı. Görmek için yukarıdaki butona tıklayın.
              </div>
            )}
          </div>

          {/* OY KÜTÜĞÜ VE LOGLAR (CANLI DAKTİLO AKIŞI) */}
          <div className={`p-4 rounded-2xl border shadow-lg flex-1 flex flex-col min-h-[260px] transition-all ${
            isDark ? 'bg-[#12141a] border-zinc-800' : 'bg-white border-zinc-300'
          }`}>
            <div className="flex items-center justify-between border-b pb-2 mb-2 border-zinc-700/40">
              <span className="text-xs font-serif font-bold uppercase tracking-wider flex items-center gap-1.5 opacity-80">
                <History className="w-4 h-4 text-amber-500" /> Masa Tutanakları (Log)
              </span>
              <span className="text-[10px] font-mono opacity-50">CANLI</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-64 space-y-1.5 font-mono text-[11px] pr-1">
              {pub.logs?.map((l, idx) => (
                <div 
                  key={idx}
                  className={`p-1.5 rounded leading-tight ${
                    l.type === "alert" 
                      ? 'bg-amber-950/40 text-amber-300 border border-amber-900/40' 
                      : l.type === "conflict"
                      ? 'bg-rose-950/70 text-rose-300 border border-rose-800 font-bold'
                      : l.type === "vote"
                      ? 'bg-zinc-900 text-zinc-300'
                      : l.type === "policy"
                      ? 'bg-blue-950/40 text-blue-300'
                      : 'opacity-70'
                  }`}
                >
                  <span className="opacity-40 text-[9px] mr-1.5">[{l.timestamp}]</span>
                  <span>{l.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>

      </main>

      {/* ALT ŞERİT */}
      <footer className={`border-t py-2 px-4 text-center text-xs opacity-60 flex flex-wrap items-center justify-between gap-2 ${
        isDark ? 'bg-[#12141a] border-zinc-800' : 'bg-white border-zinc-300'
      }`}>
        <span>Sessiz Protokol &bull; Gerçek Masabaşı Sosyal Çıkarım &bull; 10s Karar Süresi</span>
        <span className="font-mono font-bold text-amber-500">{VERSION}</span>
      </footer>

    </div>
  );
}

// MASADAKİ HER BİR OYUNCU SANDALYESİ BİLEŞENİ
function PlayerSeat({ player, pub, yourId, isDark, onToggleChip }) {
  const isLeader = player.id === pub.leader_id;
  const isPartner = player.id === pub.partner_id;
  const myChip = pub.suspicions?.[yourId]?.[player.id];
  const votedStatus = pub.votes?.[player.id];

  return (
    <div className={`p-2.5 rounded-2xl border flex flex-col items-center text-center relative transition-all ${
      !player.is_alive 
        ? 'opacity-40 grayscale bg-zinc-950 border-zinc-900' 
        : isDark 
        ? 'bg-[#151720]/95 border-zinc-800 shadow-md' 
        : 'bg-white/95 border-zinc-300 shadow-sm'
    }`}>
      
      {/* Özel Çizilmiş Karakter Portresi */}
      <div className="relative mb-1">
        <CharacterAvatar id={player.id} className="w-12 h-12" />
        
        {/* Lider Tacı veya Ortak Rozeti */}
        {isLeader && (
          <div className="absolute -top-1 -right-1 bg-amber-500 text-black rounded-full p-1 shadow" title="Lider">
            <Crown className="w-3 h-3" />
          </div>
        )}
        {isPartner && (
          <div className="absolute -top-1 -right-1 bg-purple-600 text-white rounded-full p-1 shadow" title="Ortak">
            <Briefcase className="w-3 h-3" />
          </div>
        )}
      </div>

      {/* İsim */}
      <div className="font-bold text-xs truncate max-w-[90px]">{player.name}</div>
      
      {/* Oylama Durumu (Masaya Açılan Kart / Pul) */}
      <div className="mt-1.5 w-full">
        {pub.phase === "VOTING" ? (
          <span className={`text-[9px] font-mono font-bold block py-0.5 rounded ${
            votedStatus === "VOTED" 
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
              : 'bg-zinc-800 text-zinc-400'
          }`}>
            {votedStatus === "VOTED" ? "✓ OY ATTI" : "⏳ Düşünüyor"}
          </span>
        ) : pub.last_vote_item?.votes?.[player.id] ? (
          <span className={`text-[9px] font-bold block py-0.5 rounded ${
            pub.last_vote_item.votes[player.id] === "YES" 
              ? 'bg-emerald-800 text-white' 
              : 'bg-rose-900 text-white'
          }`}>
            {pub.last_vote_item.votes[player.id] === "YES" ? "JA (EVET)" : "NEIN (RET)"}
          </span>
        ) : null}
      </div>

      {/* Şüphe / Güven Çipleri Butonları */}
      {player.id !== yourId && player.is_alive && (
        <div className="flex gap-1.5 mt-2">
          <button
            title="Güvenilir Mühürü Koy"
            onClick={() => onToggleChip("TRUSTED")}
            className={`w-6 h-6 rounded-full border text-[10px] flex items-center justify-center transition-all ${
              myChip === "TRUSTED" 
                ? 'bg-emerald-600 border-emerald-300 text-white scale-110 shadow-sm' 
                : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-emerald-400'
            }`}
          >
            🟢
          </button>
          <button
            title="Şüpheli Mühürü Koy"
            onClick={() => onToggleChip("SUSPICIOUS")}
            className={`w-6 h-6 rounded-full border text-[10px] flex items-center justify-center transition-all ${
              myChip === "SUSPICIOUS" 
                ? 'bg-rose-600 border-rose-300 text-white scale-110 shadow-sm' 
                : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-rose-400'
            }`}
          >
            🔴
          </button>
        </div>
      )}

    </div>
  );
}
