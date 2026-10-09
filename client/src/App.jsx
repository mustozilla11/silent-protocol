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
  RefreshCw, 
  History, 
  HelpCircle,
  Sparkles,
  Flame,
  Radio
} from 'lucide-react';

const VERSION = "v0.1.0";

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [yourId, setYourId] = useState("");
  const [yourRole, setYourRole] = useState("");
  const [knownAllies, setKnownAllies] = useState([]);
  const [secretLeaderId, setSecretLeaderId] = useState("");
  const [drawnPolicies, setDrawnPolicies] = useState([]);
  const [peekedPolicies, setPeekedPolicies] = useState([]);
  
  const [playerName, setPlayerName] = useState("Komutan " + Math.floor(10 + Math.random() * 90));
  const [connected, setConnected] = useState(false);
  const [showRoleSecret, setShowRoleSecret] = useState(true);
  const [activeTab, setActiveTab] = useState("board"); // 'board' | 'logs' | 'history'

  // İddia oluşturma form durumları
  const [claimDrawnBlue, setClaimDrawnBlue] = useState(1);
  const [claimPassedBlue, setClaimPassedBlue] = useState(1);
  const [claimRecBlue, setClaimRecBlue] = useState(1);

  const wsRef = useRef(null);
  const logsEndRef = useRef(null);

  // WebSocket Bağlantısı
  useEffect(() => {
    let savedId = localStorage.getItem("sp_player_id");
    if (!savedId) {
      savedId = "p-" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("sp_player_id", savedId);
    }
    setYourId(savedId);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Port 8080 backend portudur (dev veya prod)
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
          avatar: "🛡️"
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
        setTimeout(connect, 2000); // Yeniden bağlanma
      };
    }

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

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

  if (!connected) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <Radio className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
        <h1 className="text-2xl font-bold tracking-wider">SESSİZ PROTOKOL</h1>
        <p className="text-slate-400 text-sm mt-2">Sunucuya bağlanılıyor (localhost:8080)...</p>
        <span className="mt-4 px-3 py-1 bg-slate-800 text-slate-400 rounded-full text-xs font-mono">{VERSION}</span>
      </div>
    );
  }

  const pub = gameState || {};
  const isLeader = pub.leader_id === yourId;
  const isPartner = pub.partner_id === yourId;
  const currentLeaderObj = pub.players?.find(p => p.id === pub.leader_id);
  const currentPartnerObj = pub.players?.find(p => p.id === pub.partner_id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* ÜST BAR (HEADER) */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-4 py-3 sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black tracking-wider text-base md:text-lg bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
                SESSİZ PROTOKOL
              </h1>
              <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
                GİZLİ İŞARETLER
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Konuşma Yok. Sadece İddialar, Oylar ve Çelişkiler.</p>
          </div>
        </div>

        {/* Sağ Sürüm ve Durum Göstergesi */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-medium text-slate-300">
              Tur: <span className="font-bold text-white">#{pub.round || 1}</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Deste: <span className="text-cyan-400 font-mono font-bold">{pub.deck_count || 0}</span> | Atılan: <span className="text-slate-300 font-mono">{pub.discard_count || 0}</span>
            </div>
          </div>
          <div className="bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-md text-xs font-mono text-cyan-400 font-semibold shadow-inner">
            {VERSION}
          </div>
        </div>
      </header>

      {/* ANA İÇERİK BÖLGESİ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* SOL VE ORTA: OYUN ALANI (BOARD & ACTIONS) */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* FAZ BİLDİRİM ŞERİDİ */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Mevcut Aşama:</span>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  {getPhaseLabel(pub.phase)}
                </h2>
              </div>
            </div>

            {/* Kaos Göstergesi (Election Tracker) */}
            <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <Flame className={`w-4 h-4 ${pub.chaos_counter > 0 ? 'text-amber-500' : 'text-slate-600'}`} />
              <span className="text-xs text-slate-400 font-medium">Kaos Sayacı:</span>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((val) => (
                  <div 
                    key={val} 
                    className={`w-3.5 h-3.5 rounded-full border transition-all ${
                      pub.chaos_counter >= val 
                        ? 'bg-amber-500 border-amber-300 shadow-sm shadow-amber-500/50 scale-110' 
                        : 'bg-slate-900 border-slate-700'
                    }`} 
                  />
                ))}
              </div>
              {pub.chaos_counter === 2 && (
                <span className="text-[10px] text-amber-400 font-bold animate-pulse">Tehlike!</span>
              )}
            </div>
          </div>

          {/* TAHTA: KORUYUCU & CASUS YASALARI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Koruyucu Masası (Mavi) */}
            <div className="bg-gradient-to-br from-blue-950/40 via-slate-900/80 to-slate-900 border border-blue-900/50 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3 border-b border-blue-900/40 pb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-400" />
                  <span className="font-bold text-blue-200 tracking-wide text-sm">KORUYUCU PROTOKOLÜ</span>
                </div>
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/40">
                  {pub.blue_policies || 0} / 5
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = (pub.blue_policies || 0) >= idx;
                  return (
                    <div 
                      key={idx}
                      className={`aspect-[2/3] rounded-lg border flex flex-col items-center justify-center p-1 text-center transition-all ${
                        isFilled 
                          ? 'bg-gradient-to-t from-blue-700 to-blue-500 border-blue-300 text-white shadow-lg shadow-blue-500/30' 
                          : 'bg-slate-950/60 border-blue-900/30 text-slate-600'
                      }`}
                    >
                      {isFilled ? (
                        <>
                          <Shield className="w-6 h-6 mb-1 text-white" />
                          <span className="text-[10px] font-black uppercase">YASA #{idx}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-bold opacity-30">{idx}</span>
                          {idx === 5 && <span className="text-[9px] text-blue-400 font-bold mt-1">ZAFER</span>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Casus Masası (Kırmızı) */}
            <div className="bg-gradient-to-br from-red-950/40 via-slate-900/80 to-slate-900 border border-red-900/50 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3 border-b border-red-900/40 pb-2">
                <div className="flex items-center gap-2">
                  <Skull className="w-5 h-5 text-red-400" />
                  <span className="font-bold text-red-200 tracking-wide text-sm">CASUS PROTOKOLÜ</span>
                </div>
                <span className="text-xs font-mono font-bold text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-800/40">
                  {pub.red_policies || 0} / 6
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((idx) => {
                  const isFilled = (pub.red_policies || 0) >= idx;
                  return (
                    <div 
                      key={idx}
                      className={`aspect-[2/3] rounded-lg border flex flex-col items-center justify-center p-1 text-center transition-all ${
                        isFilled 
                          ? 'bg-gradient-to-t from-red-700 to-red-500 border-red-300 text-white shadow-lg shadow-red-500/30' 
                          : 'bg-slate-950/60 border-red-900/30 text-slate-600'
                      }`}
                    >
                      {isFilled ? (
                        <>
                          <Skull className="w-5 h-5 mb-1 text-white" />
                          <span className="text-[9px] font-black uppercase">#{idx}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-bold opacity-30">{idx}</span>
                          {idx === 3 && <Eye className="w-3.5 h-3.5 text-amber-500/70 mt-1" title="Kart İnceleme" />}
                          {(idx === 4 || idx === 5) && <Skull className="w-3.5 h-3.5 text-red-500/70 mt-1" title="İnfaz" />}
                          {idx === 6 && <span className="text-[8px] text-red-400 font-bold mt-1">ZAFER</span>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* DİNAMİK EYLEM KARTI (ACTION BOX) */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
            {/* Arka plan vurgusu */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* LOBİ */}
            {pub.phase === "LOBBY" && (
              <div className="text-center py-6">
                <Sparkles className="w-12 h-12 text-cyan-400 mx-auto mb-3 animate-bounce" />
                <h3 className="text-xl font-bold text-white mb-2">Gizli Masaya Hoş Geldiniz</h3>
                <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
                  Bu oyunda ses ve metin sohbeti yoktur. Tüm çıkarımlar oyuncuların beyanları, verdikleri oylar ve çelişkiler üzerinden yapılır.
                </p>
                <button
                  onClick={() => sendAction("start_game")}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  Simülasyonu Başlat (4 Bot Ekle)
                </button>
              </div>
            )}

            {/* ADAYLIK (NOMINATION) */}
            {pub.phase === "NOMINATION" && (
              <div>
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Hükümet Kurulumu</h3>
                <div className="text-base text-white mb-4">
                  Mevcut Lider: <span className="font-bold text-amber-400">{currentLeaderObj?.name}</span>
                </div>

                {isLeader ? (
                  <div className="p-4 bg-slate-950/60 rounded-xl border border-amber-500/30">
                    <p className="text-sm text-amber-200 mb-3 font-medium">
                      👑 Siz Lidersiniz! Güvendiğiniz bir oyuncuyu Ortak (Şansölye) olarak önerin:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {pub.players
                        ?.filter(p => p.id !== yourId && p.is_alive)
                        .map(candidate => {
                          const isPrevPartner = candidate.id === pub.prev_partner_id;
                          return (
                            <button
                              key={candidate.id}
                              disabled={isPrevPartner}
                              onClick={() => sendAction("nominate", { candidate_id: candidate.id })}
                              className={`p-3 rounded-lg border text-left transition-all ${
                                isPrevPartner 
                                  ? 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                                  : 'bg-slate-900 border-slate-700 hover:border-cyan-500 hover:bg-slate-800 text-white'
                              }`}
                            >
                              <div className="text-lg">{candidate.avatar}</div>
                              <div className="font-bold text-sm truncate">{candidate.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {isPrevPartner ? "Önceki Ortak (Yasak)" : "Aday Göster"}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 text-sm flex items-center gap-3">
                    <Radio className="w-5 h-5 text-cyan-400 animate-spin" />
                    <span>Lider <strong>{currentLeaderObj?.name}</strong> bir Ortak adayı belirliyor...</span>
                  </div>
                )}
              </div>
            )}

            {/* OYLAMA (VOTING) */}
            {pub.phase === "VOTING" && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Güven Oylaması</h3>
                    <p className="text-sm text-white">
                      Önerilen Hükümet: <strong className="text-amber-400">{currentLeaderObj?.name}</strong> (Lider) + <strong className="text-cyan-400">{currentPartnerObj?.name}</strong> (Ortak)
                    </p>
                  </div>
                  <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                    Gizli Oylar Toplanıyor...
                  </div>
                </div>

                {/* Oy Butonları */}
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => sendAction("vote", { vote: "YES" })}
                    className="py-4 px-6 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black rounded-xl shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-3 transition-transform active:scale-95"
                  >
                    <CheckCircle2 className="w-6 h-6" />
                    <span className="text-base tracking-wider">ONAYLA (JA!)</span>
                  </button>

                  <button
                    onClick={() => sendAction("vote", { vote: "NO" })}
                    className="py-4 px-6 bg-gradient-to-r from-rose-700 to-red-600 hover:from-rose-600 hover:to-red-500 text-white font-black rounded-xl shadow-lg shadow-rose-900/40 flex items-center justify-center gap-3 transition-transform active:scale-95"
                  >
                    <XCircle className="w-6 h-6" />
                    <span className="text-base tracking-wider">REDDET (NEIN!)</span>
                  </button>
                </div>
              </div>
            )}

            {/* LİDER KART ELEME (LEGISLATE_LEADER) */}
            {pub.phase === "LEGISLATE_LEADER" && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Yasama Aşaması: Lider Masası</h3>
                {isLeader ? (
                  <div className="p-4 bg-slate-950/70 rounded-xl border border-cyan-500/40">
                    <p className="text-sm text-cyan-200 mb-4 font-medium">
                      🗂️ Desteden 3 gizli kart çektiniz. <strong>Atmak istediğiniz (eleyeceğiniz) 1 karta tıklayın</strong>. Kalan 2 kart gizlice Ortağa iletilecektir:
                    </p>
                    <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                      {drawnPolicies.map((pol, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendAction("leader_discard", { index: idx })}
                          className={`aspect-[2/3] rounded-xl border-2 p-3 flex flex-col items-center justify-between text-white font-bold transition-transform hover:scale-105 active:scale-95 shadow-xl ${
                            pol === "BLUE" 
                              ? 'bg-blue-600 border-blue-300 shadow-blue-500/20' 
                              : 'bg-red-600 border-red-300 shadow-red-500/20'
                          }`}
                        >
                          <span className="text-xs opacity-75">KART #{idx+1}</span>
                          {pol === "BLUE" ? <Shield className="w-8 h-8" /> : <Skull className="w-8 h-8" />}
                          <span className="text-[11px] bg-black/40 px-2 py-0.5 rounded uppercase">
                            Bunu Ele
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 text-sm flex items-center gap-3">
                    <Radio className="w-5 h-5 text-cyan-400 animate-spin" />
                    <span>Lider <strong>{currentLeaderObj?.name}</strong> desteden 3 kart çekti ve birini eliyor...</span>
                  </div>
                )}
              </div>
            )}

            {/* ORTAK KART YASALAŞTIRMA (LEGISLATE_PARTNER) */}
            {pub.phase === "LEGISLATE_PARTNER" && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Yasama Aşaması: Ortak Masası</h3>
                {isPartner ? (
                  <div className="p-4 bg-slate-950/70 rounded-xl border border-purple-500/40">
                    <p className="text-sm text-purple-200 mb-4 font-medium">
                      🏛️ Lider size 2 gizli kart iletti. <strong>Yürürlüğe koymak (yasalaştırmak) istediğiniz karta tıklayın</strong>:
                    </p>
                    <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
                      {drawnPolicies.map((pol, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendAction("partner_enact", { index: idx })}
                          className={`aspect-[2/3] rounded-xl border-2 p-3 flex flex-col items-center justify-between text-white font-bold transition-transform hover:scale-105 active:scale-95 shadow-xl ${
                            pol === "BLUE" 
                              ? 'bg-blue-600 border-blue-300 shadow-blue-500/20' 
                              : 'bg-red-600 border-red-300 shadow-red-500/20'
                          }`}
                        >
                          <span className="text-xs opacity-75">SEÇENEK #{idx+1}</span>
                          {pol === "BLUE" ? <Shield className="w-8 h-8" /> : <Skull className="w-8 h-8" />}
                          <span className="text-[11px] bg-black/40 px-2 py-0.5 rounded uppercase">
                            YASALAŞTIR
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 text-sm flex items-center gap-3">
                    <Radio className="w-5 h-5 text-purple-400 animate-spin" />
                    <span>Ortak <strong>{currentPartnerObj?.name}</strong> masaya sürülecek son yasayı seçiyor...</span>
                  </div>
                )}
              </div>
            )}

            {/* İDDİA ARAYÜZÜ (CLAIMING - KONUŞMASIZ SOSYAL ÇIKARIM) */}
            {pub.phase === "CLAIMING" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-cyan-400 font-bold">İddia ve Beyan Protokolü</h3>
                    <p className="text-xs text-slate-400">Yasa çıktıktan sonra kim ne çektiğini sessizce masaya bildirir.</p>
                  </div>
                  <div className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono">
                    Çıkan Yasa: <span className={pub.current_claim?.partner_enacted === "BLUE" ? "text-blue-400 font-bold" : "text-red-400 font-bold"}>
                      {pub.current_claim?.partner_enacted === "BLUE" ? "KORUYUCU (MAVİ)" : "CASUS (KIRMIZI)"}
                    </span>
                  </div>
                </div>

                {/* Eğer Lider henüz beyan vermemişse ve oyuncu Liderse */}
                {isLeader && !pub.current_claim?.leader_claimed && (
                  <div className="p-4 bg-slate-950/80 rounded-xl border border-amber-500/40 mb-4">
                    <h4 className="text-sm font-bold text-amber-300 mb-2">👑 Lider Beyanı Hazırla:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-4">
                      <div>
                        <label className="block text-slate-400 mb-1">Desteden Çektiğin Mavi Kart Sayısı (0-3):</label>
                        <select 
                          value={claimDrawnBlue} 
                          onChange={e => setClaimDrawnBlue(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-medium"
                        >
                          <option value={0}>0 Mavi, 3 Kırmızı</option>
                          <option value={1}>1 Mavi, 2 Kırmızı</option>
                          <option value={2}>2 Mavi, 1 Kırmızı</option>
                          <option value={3}>3 Mavi, 0 Kırmızı</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Ortağa İlettiğin Mavi Kart Sayısı (0-2):</label>
                        <select 
                          value={claimPassedBlue} 
                          onChange={e => setClaimPassedBlue(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-medium"
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
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs tracking-wider uppercase transition-colors"
                    >
                      İddiamı Masaya İlan Et
                    </button>
                  </div>
                )}

                {/* Eğer Ortak henüz beyan vermemişse ve oyuncu Ortaksa */}
                {isPartner && !pub.current_claim?.partner_claimed && (
                  <div className="p-4 bg-slate-950/80 rounded-xl border border-purple-500/40 mb-4">
                    <h4 className="text-sm font-bold text-purple-300 mb-2">🏛️ Ortak Beyanı Hazırla:</h4>
                    <div className="mb-4 text-xs">
                      <label className="block text-slate-400 mb-1">Liderden Sana Gelen Mavi Kart Sayısı (0-2):</label>
                      <select 
                        value={claimRecBlue} 
                        onChange={e => setClaimRecBlue(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-medium"
                      >
                        <option value={0}>0 Mavi, 2 Kırmızı Geldi (Çaresiz Kırmızı Attım)</option>
                        <option value={1}>1 Mavi, 1 Kırmızı Geldi</option>
                        <option value={2}>2 Mavi Geldi</option>
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        const received = Array(claimRecBlue).fill("BLUE").concat(Array(2 - claimRecBlue).fill("RED"));
                        sendAction("partner_claim", { received });
                      }}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs tracking-wider uppercase transition-colors"
                    >
                      İddiamı Masaya İlan Et
                    </button>
                  </div>
                )}

                {/* Beyan Durumu ve Çelişki Paneli */}
                <div className="bg-slate-950/90 rounded-xl p-4 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Lider Beyanı ({currentLeaderObj?.name}):</span>
                    <span className="font-semibold text-white">
                      {pub.current_claim?.leader_claimed ? "✅ Masaya Sunuldu" : "⏳ Bekleniyor..."}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Ortak Beyanı ({currentPartnerObj?.name}):</span>
                    <span className="font-semibold text-white">
                      {pub.current_claim?.partner_claimed ? "✅ Masaya Sunuldu" : "⏳ Bekleniyor..."}
                    </span>
                  </div>

                  {/* ÇELİŞKİ UYARISI */}
                  {pub.current_claim?.has_conflict && (
                    <div className="p-4 bg-red-950/80 border-2 border-red-500 rounded-xl text-red-200 animate-conflict">
                      <div className="flex items-center gap-2 font-black text-red-400 text-sm uppercase tracking-wider mb-1">
                        <AlertTriangle className="w-5 h-5" />
                        ÇELİŞKİ TESPİT EDİLDİ! BİRİ YALAN SÖYLÜYOR!
                      </div>
                      <p className="text-xs leading-relaxed text-red-100">
                        {pub.current_claim.conflict_note}
                      </p>
                    </div>
                  )}

                  {pub.current_claim?.leader_claimed && pub.current_claim?.partner_claimed && !pub.current_claim?.has_conflict && (
                    <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-emerald-200 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Beyanlar birbiriyle örtüşüyor. Açık çelişki tespit edilmedi.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* YETKİ: KART İNCELEME (POWERS_PEEK) */}
            {pub.phase === "POWERS_PEEK" && (
              <div className="p-4 bg-slate-950/80 rounded-xl border border-amber-500/50">
                <div className="flex items-center gap-2 text-amber-400 font-bold mb-2">
                  <Eye className="w-5 h-5" />
                  3. Kırmızı Yasa Yetkisi: Gelecek Yasaları İnceleme
                </div>
                {isLeader ? (
                  <div>
                    <p className="text-xs text-slate-300 mb-3">Destedeki sonraki 3 kartı sadece siz görüyorsunuz:</p>
                    <div className="flex gap-3 mb-4">
                      {peekedPolicies.map((pol, idx) => (
                        <div key={idx} className={`p-3 rounded-lg border text-xs font-bold text-white ${pol === "BLUE" ? "bg-blue-600 border-blue-400" : "bg-red-600 border-red-400"}`}>
                          #{idx+1}: {pol === "BLUE" ? "Koruyucu (Mavi)" : "Casus (Kırmızı)"}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => sendAction("close_peek")}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold"
                    >
                      İncelemeyi Tamamla ve Devam Et
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lider {currentLeaderObj?.name} gelecek 3 kartı inceliyor...</p>
                )}
              </div>
            )}

            {/* YETKİ: İNFAZ (POWERS_EXECUTION) */}
            {pub.phase === "POWERS_EXECUTION" && (
              <div className="p-4 bg-slate-950/80 rounded-xl border border-red-500/50">
                <div className="flex items-center gap-2 text-red-400 font-bold mb-2">
                  <Skull className="w-5 h-5" />
                  Casus Yasası Yetkisi: İNFAZ
                </div>
                {isLeader ? (
                  <div>
                    <p className="text-xs text-red-200 mb-3">
                      Lider olarak masadan bir oyuncuyu kalıcı olarak infaz etmek zorundasınız! (Gizli Lider ölürse Koruyucular kazanır):
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {pub.players
                        ?.filter(p => p.id !== yourId && p.is_alive)
                        .map(target => (
                          <button
                            key={target.id}
                            onClick={() => sendAction("execute_player", { target_id: target.id })}
                            className="p-3 bg-red-950/60 hover:bg-red-900/80 border border-red-800 text-white rounded-xl text-left"
                          >
                            <div className="text-lg">{target.avatar}</div>
                            <div className="font-bold text-xs truncate">{target.name}</div>
                            <div className="text-[10px] text-red-400 font-semibold mt-1">İnfaz Et</div>
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Lider {currentLeaderObj?.name} infaz edeceği hedefi seçiyor...</p>
                )}
              </div>
            )}

            {/* ŞÜPHE İŞARETLEME (SUSPICION_MARKING) */}
            {pub.phase === "SUSPICION_MARKING" && (
              <div className="p-4 bg-slate-950/70 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wider text-cyan-400 font-bold">Masa Çipleri ve Gözlemler</span>
                  <button
                    onClick={() => sendAction("finish_marking")}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700"
                  >
                    Yeni Tura Geç ⏭️
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Sağdaki oyuncu kartlarından diğer oyunculara "Şüpheli 🔴" veya "Güvenilir 🟢" çipleri ekleyebilirsiniz.
                </p>
              </div>
            )}

            {/* OYUN BİTTİ (GAME_OVER) */}
            {pub.phase === "GAME_OVER" && (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">
                  {pub.winner === "PROTECTORS" ? "🛡️" : "🚨"}
                </div>
                <h3 className={`text-2xl font-black mb-2 ${pub.winner === "PROTECTORS" ? "text-blue-400" : "text-red-400"}`}>
                  {pub.winner === "PROTECTORS" ? "KORUYUCULAR KAZANDI!" : "CASUSLAR KAZANDI!"}
                </h3>
                <p className="text-slate-300 text-sm max-w-lg mx-auto mb-6 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  {pub.win_reason}
                </p>
                <button
                  onClick={() => sendAction("start_game")}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg"
                >
                  Yeniden Oyna
                </button>
              </div>
            )}
          </div>

          {/* OYLAMA GEÇMİŞİ LOG KARTI */}
          {pub.last_vote_item && (
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 text-xs">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Son Oylama Sonucu:</span>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <span className={`px-2 py-0.5 rounded font-bold ${pub.last_vote_item.passed ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"}`}>
                  {pub.last_vote_item.passed ? "KABUL EDİLDİ" : "REDDEDİLDİ"}
                </span>
                <span className="text-slate-300">
                  Adaylar: <strong>{pub.last_vote_item.leader_name}</strong> & <strong>{pub.last_vote_item.partner_name}</strong>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-2 pt-2 border-t border-slate-800">
                {pub.players?.map(p => {
                  const vote = pub.last_vote_item.votes?.[p.id];
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-slate-950/60 px-2 py-1 rounded border border-slate-800/50 text-[11px]">
                      <span className="truncate text-slate-300">{p.name}</span>
                      <span className={`font-bold ${vote === "YES" ? "text-emerald-400" : vote === "NO" ? "text-rose-400" : "text-slate-600"}`}>
                        {vote === "YES" ? "EVET" : vote === "NO" ? "HAYIR" : "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* SAĞ PANEL: OYUNCULAR VE GİZLİ KİMLİK */}
        <div className="lg:col-span-4 flex flex-col gap-6">

          {/* GİZLİ KİMLİK KARTI (AUTHORITATIVE & GİZLİ) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-400">Gizli Dosyanız</span>
              <button 
                onClick={() => setShowRoleSecret(!showRoleSecret)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                {showRoleSecret ? <Eye className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 opacity-40" />}
                <span>{showRoleSecret ? "Gizle" : "Göster"}</span>
              </button>
            </div>

            {showRoleSecret ? (
              <div className={`p-4 rounded-xl border text-center relative overflow-hidden transition-all ${
                yourRole === "PROTECTOR"
                  ? "bg-gradient-to-br from-blue-950 to-slate-900 border-blue-500/40 text-blue-200"
                  : yourRole === "SPY"
                  ? "bg-gradient-to-br from-red-950 to-slate-900 border-red-500/40 text-red-200"
                  : yourRole === "SECRET_LEADER"
                  ? "bg-gradient-to-br from-purple-950 to-slate-900 border-purple-500/40 text-purple-200"
                  : "bg-slate-950 border-slate-800 text-slate-400"
              }`}>
                <div className="text-3xl mb-1">
                  {yourRole === "PROTECTOR" && "🛡️"}
                  {yourRole === "SPY" && "🕵️"}
                  {yourRole === "SECRET_LEADER" && "👑"}
                  {!yourRole && "⏳"}
                </div>
                <div className="text-lg font-black tracking-wide">
                  {yourRole === "PROTECTOR" && "KORUYUCU (PROTECTOR)"}
                  {yourRole === "SPY" && "CASUS (INFILTRATOR)"}
                  {yourRole === "SECRET_LEADER" && "GİZLİ LİDER (SECRET LEADER)"}
                  {!yourRole && "LOBİDE BEKLENİYOR"}
                </div>
                <p className="text-xs opacity-80 mt-1 leading-relaxed">
                  {yourRole === "PROTECTOR" && "Sistemde çoğunluktasınız ancak birbirinizi tanımıyorsunuz. Çelişkileri yakalayın!"}
                  {yourRole === "SPY" && "Azınlıktasınız. Gizli liderinizi biliyorsunuz. Çaktırmadan kırmızı yasa geçirin!"}
                  {yourRole === "SECRET_LEADER" && "Casusların gizli liderisiniz. Koruyucu gibi davranın, 3. kırmızıdan sonra Ortak seçilmeye çalışın!"}
                </p>

                {/* Casus Ağı Bilgisi (5 kişilik oyunda) */}
                {(yourRole === "SPY" || yourRole === "SECRET_LEADER") && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 text-left text-xs space-y-1">
                    <div className="font-bold text-amber-300">Gizli Ağ Verileri:</div>
                    {secretLeaderId && (
                      <div className="text-slate-300">
                        Gizli Lider: <strong className="text-purple-400">{pub.players?.find(p => p.id === secretLeaderId)?.name || secretLeaderId}</strong>
                      </div>
                    )}
                    {knownAllies.length > 0 && (
                      <div className="text-slate-300">
                        Casus Müttefik: <strong className="text-red-400">{knownAllies.map(id => pub.players?.find(p => p.id === id)?.name).join(", ")}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 bg-slate-950/80 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                🔒 Kimlik gizlendi. Açmak için yukarıdaki butona tıklayın.
              </div>
            )}
          </div>

          {/* OYUNCULAR MASASI (5 KİŞİLİK MASA VE ÇİPLER) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-3">Masa Üyeleri (5 Kişi)</h3>
            <div className="space-y-2.5">
              {pub.players?.map((p) => {
                const isCurrentLeader = p.id === pub.leader_id;
                const isCurrentPartner = p.id === pub.partner_id;
                const mySuspicionOnP = pub.suspicions?.[yourId]?.[p.id];

                return (
                  <div 
                    key={p.id}
                    className={`p-3 rounded-xl border transition-all ${
                      !p.is_alive 
                        ? 'bg-slate-950/40 border-slate-900 opacity-50' 
                        : p.id === yourId 
                        ? 'bg-slate-950/90 border-cyan-500/40' 
                        : 'bg-slate-950/60 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{p.avatar}</span>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {p.id === yourId && (
                              <span className="text-[9px] bg-cyan-950 text-cyan-400 px-1 py-0.2 rounded border border-cyan-800/40">SEN</span>
                            )}
                            {!p.is_alive && (
                              <span className="text-[9px] bg-red-950 text-red-400 px-1 py-0.2 rounded border border-red-800/40">ÖLÜ</span>
                            )}
                          </div>
                          {/* Rozetler */}
                          <div className="flex items-center gap-1 mt-0.5">
                            {isCurrentLeader && (
                              <span className="text-[10px] bg-amber-950 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-800/50 flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5" /> LİDER
                              </span>
                            )}
                            {isCurrentPartner && (
                              <span className="text-[10px] bg-purple-950 text-purple-300 font-bold px-1.5 py-0.5 rounded border border-purple-800/50 flex items-center gap-0.5">
                                ORTAK
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Şüphe/Güven Çipleri Butonları */}
                      {p.id !== yourId && p.is_alive && (
                        <div className="flex items-center gap-1">
                          <button
                            title="Güvenilir İşaretle"
                            onClick={() => sendAction("toggle_suspicion", { target_id: p.id, chip: "TRUSTED" })}
                            className={`p-1.5 rounded-lg border text-xs transition-colors ${
                              mySuspicionOnP === "TRUSTED"
                                ? "bg-emerald-950 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-500/30"
                                : "bg-slate-900 border-slate-800 text-slate-500 hover:text-emerald-400"
                            }`}
                          >
                            🟢
                          </button>
                          <button
                            title="Şüpheli İşaretle"
                            onClick={() => sendAction("toggle_suspicion", { target_id: p.id, chip: "SUSPICIOUS" })}
                            className={`p-1.5 rounded-lg border text-xs transition-colors ${
                              mySuspicionOnP === "SUSPICIOUS"
                                ? "bg-red-950 text-red-300 border-red-500 shadow-sm shadow-red-500/30"
                                : "bg-slate-900 border-slate-800 text-slate-500 hover:text-red-400"
                            }`}
                          >
                            🔴
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LOG VE SİSTEM GÜNLÜĞÜ */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex-1 flex flex-col min-h-[220px]">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Olay Kayıtları (Log)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">CANLI AKIŞ</span>
            </div>
            <div className="flex-1 overflow-y-auto max-h-56 space-y-1.5 pr-1 font-mono text-[11px]">
              {pub.logs?.map((l, idx) => (
                <div 
                  key={idx} 
                  className={`p-1.5 rounded leading-tight ${
                    l.type === "alert" 
                      ? "bg-amber-950/60 text-amber-300 border border-amber-900/40" 
                      : l.type === "conflict"
                      ? "bg-red-950/70 text-red-300 border border-red-800/50 font-bold"
                      : l.type === "vote"
                      ? "bg-slate-950 text-cyan-300"
                      : l.type === "policy"
                      ? "bg-blue-950/40 text-blue-300"
                      : "text-slate-400"
                  }`}
                >
                  <span className="opacity-40 text-[10px] mr-1.5">[{l.timestamp}]</span>
                  <span>{l.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>

      </main>

      {/* ALT BİLGİ ŞERİDİ */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-2 px-4 text-center text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <span>Sessiz Sosyal Çıkarım &bull; Authoritative Engine &bull; Secret Hitler Mekanikleri</span>
        <div className="flex items-center gap-2">
          <span>Sürüm:</span>
          <span className="font-mono text-cyan-400 font-bold">{VERSION}</span>
        </div>
      </footer>
    </div>
  );
}

function getPhaseLabel(phase) {
  switch (phase) {
    case "LOBBY": return "Lobi (Başlangıç Bekleniyor)";
    case "NOMINATION": return "Hükümet Kurulumu (Ortak Seçimi)";
    case "VOTING": return "Güven Oylaması (Ja / Nein)";
    case "LEGISLATE_LEADER": return "Yasama: Lider Kart Eliyor";
    case "LEGISLATE_PARTNER": return "Yasama: Ortak Yasalaştırıyor";
    case "CLAIMING": return "İddia ve Çelişki Tespiti";
    case "POWERS_PEEK": return "Yetki: Gelecek Yasaları İnceleme";
    case "POWERS_EXECUTION": return "Yetki: İnfaz Kararı";
    case "SUSPICION_MARKING": return "Masa Gözlem ve Şüphe Çipleri";
    case "GAME_OVER": return "Oyun Bitti";
    default: return phase || "Yükleniyor...";
  }
}
