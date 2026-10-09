import React from 'react';

// Dinamik Mimik, Göz Hareketi ve Jest Destekli Karakter Portresi
export function CharacterAvatar({ 
  id, 
  expression = "neutral", // "neutral" | "thinking" | "surprised" | "eureka" | "look_left" | "look_right" | "pointing"
  className = "w-16 h-16" 
}) {
  // Gözbebeği konumu
  let eyeOffsetX = 0;
  let eyeOffsetY = 0;
  let eyeScale = 1;
  let mouthPath = "";

  if (expression === "look_left") {
    eyeOffsetX = -3.5;
  } else if (expression === "look_right") {
    eyeOffsetX = 3.5;
  } else if (expression === "thinking") {
    eyeOffsetX = 2.5;
    eyeOffsetY = -2.5;
  } else if (expression === "surprised") {
    eyeScale = 1.6;
    eyeOffsetY = 0;
  } else if (expression === "eureka") {
    eyeOffsetX = 0;
    eyeOffsetY = 1;
  }

  // Karakter tipine göre özel çizim ve mimik entegrasyonu
  switch (id) {
    case 'bot-1': // Ajan Kaya (Fötr şapkalı gizemli ajan)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#18191f" stroke="#383a42" strokeWidth="3" />
          
          {/* Gövde */}
          <path d="M20 95 C25 64 75 64 80 95 Z" fill="#292c35" />
          <path d="M44 68 L50 92 L56 68 Z" fill="#991b1b" />
          
          {/* Kafa ve Boyun */}
          <rect x="42" y="52" width="16" height="18" fill="#c69363" rx="4" />
          <ellipse cx="50" cy="46" rx="20" ry="22" fill="#d89f6d" />
          
          {/* Fötr Şapka Altı Gölge */}
          <path d="M30 38 Q50 44 70 38 L70 42 Q50 48 30 42 Z" fill="#0f1013" opacity="0.6" />

          {/* Gözler ve Mimikler */}
          {expression === "surprised" ? (
            <>
              {/* Faltaşı gözler */}
              <circle cx="41" cy="46" r="4.5" fill="#f8fafc" />
              <circle cx="59" cy="46" r="4.5" fill="#f8fafc" />
              <circle cx="41" cy="46" r="2.2" fill="#0f1013" />
              <circle cx="59" cy="46" r="2.2" fill="#0f1013" />
              {/* Açık ağız */}
              <ellipse cx="50" cy="58" rx="4" ry="5" fill="#0f1013" />
            </>
          ) : expression === "thinking" ? (
            <>
              {/* Tek kaş havada, göz yukarıda */}
              <path d="M34 40 Q42 38 46 42" stroke="#0f1013" strokeWidth="2.5" fill="none" />
              <path d="M54 36 Q60 32 66 38" stroke="#0f1013" strokeWidth="3" fill="none" />
              <ellipse cx={42 + eyeOffsetX} cy={46 + eyeOffsetY} rx="3" ry="1.8" fill="#0f1013" />
              <ellipse cx={58 + eyeOffsetX} cy={46 + eyeOffsetY} rx="3" ry="1.8" fill="#0f1013" />
              {/* Çene sıvazlama eli */}
              <path d="M48 62 Q52 68 58 60" stroke="#c69363" strokeWidth="4" strokeLinecap="round" fill="none" />
            </>
          ) : expression === "eureka" ? (
            <>
              {/* Sinsi zeki kısık gözler */}
              <path d="M36 45 Q42 42 46 46" stroke="#0f1013" strokeWidth="3" fill="none" />
              <path d="M54 46 Q58 42 64 45" stroke="#0f1013" strokeWidth="3" fill="none" />
              <path d="M44 56 Q50 60 56 56" stroke="#0f1013" strokeWidth="2" fill="none" />
              {/* Fikir ampul parıltısı */}
              <circle cx="50" cy="14" r="4" fill="#fbbf24" />
              <line x1="50" y1="6" x2="50" y2="9" stroke="#fbbf24" strokeWidth="2" />
              <line x1="43" y1="10" x2="45" y2="12" stroke="#fbbf24" strokeWidth="2" />
              <line x1="57" y1="10" x2="55" y2="12" stroke="#fbbf24" strokeWidth="2" />
            </>
          ) : (
            <>
              {/* Normal/Sola-Sağa bakış */}
              <path d="M36 43 Q50 46 64 43" stroke="#0f1013" strokeWidth="2.5" fill="none" />
              <ellipse cx={42 + eyeOffsetX} cy={46 + eyeOffsetY} rx="3" ry="1.5" fill="#0f1013" />
              <ellipse cx={58 + eyeOffsetX} cy={46 + eyeOffsetY} rx="3" ry="1.5" fill="#0f1013" />
              <line x1="45" y1="56" x2="55" y2="56" stroke="#0f1013" strokeWidth="1.8" strokeLinecap="round" />
            </>
          )}

          {/* Fötr Şapka */}
          <ellipse cx="50" cy="30" rx="36" ry="7" fill="#18191f" />
          <path d="M26 30 C28 10 72 10 74 30 Z" fill="#22242c" />
          <rect x="27" y="27" width="46" height="4" fill="#7f1d1d" />

          {/* İşaret Parmak Jesti (Pointing) */}
          {expression === "pointing" && (
            <g transform="translate(15, 60)">
              <rect x="0" y="0" width="18" height="10" rx="4" fill="#292c35" />
              <path d="M16 2 L32 0 L32 6 L16 8 Z" fill="#d89f6d" /> {/* İşaret parmağı */}
            </g>
          )}
        </svg>
      );

    case 'bot-2': // Diplomat Ece (Gözlüklü zeki stratejist)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#18191f" stroke="#383a42" strokeWidth="3" />
          
          <path d="M20 95 C25 68 75 68 80 95 Z" fill="#1e293b" />
          <path d="M42 70 L50 82 L58 70 Z" fill="#f8fafc" />
          
          <rect x="44" y="55" width="12" height="15" fill="#e2b992" rx="3" />
          <ellipse cx="50" cy="45" rx="19" ry="21" fill="#f0c299" />
          
          {/* Saç */}
          <path d="M30 42 C30 20 70 20 70 42 C70 48 72 58 72 62 C68 60 64 54 64 45 C64 30 36 30 36 45 C36 54 32 60 28 62 C28 58 30 48 30 42 Z" fill="#2d1d17" />
          
          {/* Gözlük Çerçeveleri */}
          <circle cx="43" cy="45" r="7.5" fill="none" stroke="#d4af37" strokeWidth="2.5" />
          <circle cx="57" cy="45" r="7.5" fill="none" stroke="#d4af37" strokeWidth="2.5" />
          <line x1="50.5" y1="45" x2="49.5" y2="45" stroke="#d4af37" strokeWidth="3" />

          {/* Gözler ve Mimikler */}
          {expression === "surprised" ? (
            <>
              <circle cx="43" cy="45" r="4" fill="#0f172a" />
              <circle cx="57" cy="45" r="4" fill="#0f172a" />
              <ellipse cx="50" cy="58" rx="3" ry="4" fill="#881337" />
            </>
          ) : expression === "thinking" ? (
            <>
              <ellipse cx={43 + eyeOffsetX} cy={45 + eyeOffsetY} rx="2.5" ry="2.5" fill="#0f172a" />
              <ellipse cx={57 + eyeOffsetX} cy={45 + eyeOffsetY} rx="2.5" ry="2.5" fill="#0f172a" />
              <path d="M46 56 Q50 54 54 56" stroke="#881337" strokeWidth="2" fill="none" />
            </>
          ) : (
            <>
              <circle cx={43 + eyeOffsetX} cy={45 + eyeOffsetY} r="2.5" fill="#0f172a" />
              <circle cx={57 + eyeOffsetX} cy={45 + eyeOffsetY} r="2.5" fill="#0f172a" />
              <path d="M46 56 Q50 58 54 56" stroke="#881337" strokeWidth="2" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* İşaret Parmağı */}
          {expression === "pointing" && (
            <g transform="translate(68, 62)">
              <rect x="0" y="0" width="16" height="8" rx="3" fill="#1e293b" />
              <path d="M14 1 L28 0 L28 5 L14 7 Z" fill="#e2b992" />
            </g>
          )}
        </svg>
      );

    case 'bot-3': // Analist Can (Pala bıyıklı arşivci)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#18191f" stroke="#383a42" strokeWidth="3" />
          
          <path d="M20 95 C25 66 75 66 80 95 Z" fill="#2e221b" />
          <polygon points="43,72 57,72 50,75" fill="#78350f" />
          <polygon points="43,78 57,78 50,75" fill="#78350f" />
          
          <ellipse cx="50" cy="46" rx="20" ry="22" fill="#dfad83" />
          
          {/* Saçlar */}
          <path d="M29 45 C29 32 35 24 40 24 C40 24 35 34 35 48 Z" fill="#52525b" />
          <path d="M71 45 C71 32 65 24 60 24 C60 24 65 34 65 48 Z" fill="#52525b" />

          {/* Gözler & Kaşlar */}
          {expression === "surprised" ? (
            <>
              <circle cx="42" cy="42" r="4" fill="#18181b" />
              <circle cx="58" cy="42" r="4" fill="#18181b" />
              <path d="M36 36 Q42 32 46 36" stroke="#27272a" strokeWidth="2.5" fill="none" />
              <path d="M54 36 Q58 32 64 36" stroke="#27272a" strokeWidth="2.5" fill="none" />
            </>
          ) : expression === "thinking" ? (
            <>
              <ellipse cx={42 + eyeOffsetX} cy={42 + eyeOffsetY} rx="2.5" ry="2.5" fill="#18181b" />
              <ellipse cx={58 + eyeOffsetX} cy={42 + eyeOffsetY} rx="2.5" ry="2.5" fill="#18181b" />
              <path d="M36 34 Q42 30 46 34" stroke="#27272a" strokeWidth="2.5" fill="none" />
            </>
          ) : (
            <>
              <ellipse cx={42 + eyeOffsetX} cy={42 + eyeOffsetY} rx="2.5" ry="2.5" fill="#18181b" />
              <ellipse cx={58 + eyeOffsetX} cy={42 + eyeOffsetY} rx="2.5" ry="2.5" fill="#18181b" />
            </>
          )}

          {/* Meşhur Bıyık */}
          <path d="M36 54 Q50 50 64 54 Q50 61 36 54 Z" fill="#3f3f46" />
        </svg>
      );

    case 'bot-4': // Operatör Deniz (Taktisyen)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#18191f" stroke="#383a42" strokeWidth="3" />
          
          <path d="M20 95 C25 65 75 65 80 95 Z" fill="#19241c" />
          <line x1="50" y1="68" x2="50" y2="95" stroke="#d4af37" strokeWidth="2" />
          
          <polygon points="34,36 66,36 60,65 50,70 40,65" fill="#e4b58c" />
          
          {/* Beret */}
          <path d="M26 36 C30 20 74 18 78 32 C78 38 30 40 26 36 Z" fill="#111913" />
          <circle cx="42" cy="28" r="3" fill="#d4af37" />

          {/* Gözler */}
          {expression === "surprised" ? (
            <>
              <circle cx="43" cy="48" r="3.5" fill="#1c1917" />
              <circle cx="57" cy="48" r="3.5" fill="#1c1917" />
            </>
          ) : (
            <>
              <line x1="39" y1="44" x2="47" y2="45" stroke="#1c1917" strokeWidth="3" />
              <line x1="53" y1="45" x2="61" y2="44" stroke="#1c1917" strokeWidth="3" />
              <circle cx={43 + eyeOffsetX} cy={48 + eyeOffsetY} r="2.2" fill="#1c1917" />
              <circle cx={57 + eyeOffsetX} cy={48 + eyeOffsetY} r="2.2" fill="#1c1917" />
            </>
          )}

          {/* Telsiz Kulaklık */}
          <rect x="29" y="44" width="4" height="12" fill="#0f172a" rx="2" />
          <path d="M31 56 Q36 64 45 64" stroke="#0f172a" strokeWidth="2" fill="none" />
          <circle cx="46" cy="64" r="2" fill="#0f172a" />
        </svg>
      );

    default: // Komutan (Sen)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#18191f" stroke="#d4af37" strokeWidth="3" />
          
          <path d="M18 95 C23 62 77 62 82 95 Z" fill="#141c2c" />
          
          <rect x="22" y="66" width="12" height="6" fill="#d4af37" rx="2" transform="rotate(-15 28 69)" />
          <rect x="66" y="66" width="12" height="6" fill="#d4af37" rx="2" transform="rotate(15 72 69)" />
          
          <rect x="43" y="50" width="14" height="16" fill="#e0a97a" rx="3" />
          <ellipse cx="50" cy="42" rx="20" ry="22" fill="#e8b488" />
          
          <path d="M30 38 C30 20 70 20 70 38 C70 32 60 22 50 22 C40 22 30 32 30 38 Z" fill="#242127" />

          {/* Mimikler */}
          {expression === "surprised" ? (
            <>
              <circle cx="43" cy="42" r="4.5" fill="#0f172a" />
              <circle cx="57" cy="42" r="4.5" fill="#0f172a" />
              <ellipse cx="50" cy="54" rx="3.5" ry="4.5" fill="#0f172a" />
            </>
          ) : expression === "thinking" ? (
            <>
              <ellipse cx={43 + eyeOffsetX} cy={42 + eyeOffsetY} rx="2.5" ry="2.5" fill="#0f172a" />
              <ellipse cx={57 + eyeOffsetX} cy={42 + eyeOffsetY} rx="2.5" ry="2.5" fill="#0f172a" />
              <path d="M38 36 Q44 32 48 36" stroke="#242127" strokeWidth="2.5" fill="none" />
              <path d="M44 54 Q50 52 56 54" stroke="#242127" strokeWidth="2" fill="none" />
            </>
          ) : expression === "eureka" ? (
            <>
              <path d="M38 42 Q44 39 48 42" stroke="#242127" strokeWidth="3" fill="none" />
              <path d="M52 42 Q56 39 62 42" stroke="#242127" strokeWidth="3" fill="none" />
              <path d="M44 53 Q50 57 56 53" stroke="#242127" strokeWidth="2" fill="none" />
              <circle cx="50" cy="14" r="4" fill="#fbbf24" />
            </>
          ) : (
            <>
              <line x1="39" y1="38" x2="47" y2="40" stroke="#242127" strokeWidth="2.5" />
              <line x1="61" y1="38" x2="53" y2="40" stroke="#242127" strokeWidth="2.5" />
              <ellipse cx={43 + eyeOffsetX} cy={42 + eyeOffsetY} rx="2.5" ry="2.5" fill="#0f172a" />
              <ellipse cx={57 + eyeOffsetX} cy={42 + eyeOffsetY} rx="2.5" ry="2.5" fill="#0f172a" />
            </>
          )}

          {/* Altın Madalya */}
          <polygon points="50,68 53,74 59,74 54,78 56,84 50,80 44,84 46,78 41,74 47,74" fill="#fbbf24" stroke="#b45309" strokeWidth="0.5" />
        </svg>
      );
  }
}

// Konuşma / Tepki Baloncuğu Bileşeni ("Hmm...", "Ha?!", "Aha!", "👉 Sen!")
export function ReactionBubble({ text }) {
  if (!text) return null;

  return (
    <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none animate-bounce">
      <div className="bg-amber-100 text-zinc-900 border-2 border-zinc-900 px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-tight font-serif shadow-lg whitespace-nowrap flex items-center gap-1">
        <span>{text}</span>
      </div>
      {/* Baloncuğun kuyruğu */}
      <div className="w-2 h-2 bg-amber-100 border-r-2 border-b-2 border-zinc-900 transform rotate-45 mx-auto -mt-1" />
    </div>
  );
}
