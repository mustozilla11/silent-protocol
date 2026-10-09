import React from 'react';

// Özel çizilmiş 5 benzersiz karakter portresi (Noir / Board game illustrasyonları)

export function CharacterAvatar({ id, className = "w-14 h-14" }) {
  switch (id) {
    case 'bot-1': // Ajan Kaya (Fötr şapkalı gizemli ajan)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#1c1d22" stroke="#4a4d57" strokeWidth="3" />
          {/* Gövde ve Palto */}
          <path d="M20 95 C25 65 75 65 80 95 Z" fill="#2d3039" />
          <path d="M42 70 L50 90 L58 70 Z" fill="#b91c1c" /> {/* Kırmızı kravat */}
          {/* Yüz ve Boyun */}
          <rect x="42" y="52" width="16" height="18" fill="#d4a373" rx="4" />
          <ellipse cx="50" cy="46" rx="20" ry="22" fill="#e0a96d" />
          {/* Gözler ve Gölge */}
          <path d="M36 44 Q50 48 64 44" stroke="#1c1d22" strokeWidth="3" fill="none" />
          <ellipse cx="43" cy="47" rx="3" ry="1.5" fill="#1c1d22" />
          <ellipse cx="57" cy="47" rx="3" ry="1.5" fill="#1c1d22" />
          {/* Fötr Şapka */}
          <ellipse cx="50" cy="30" rx="36" ry="7" fill="#18191f" />
          <path d="M26 30 C28 10 72 10 74 30 Z" fill="#22242c" />
          <rect x="27" y="27" width="46" height="4" fill="#991b1b" /> {/* Şapka bandı */}
        </svg>
      );

    case 'bot-2': // Mühendis / Diplomat Ece (Gözlüklü zeki stratejist)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#1c1d22" stroke="#4a4d57" strokeWidth="3" />
          {/* Gövde / Döpiyes Ceket */}
          <path d="M20 95 C25 68 75 68 80 95 Z" fill="#1e293b" />
          <path d="M40 70 L50 82 L60 70 Z" fill="#f8fafc" />
          {/* Boyun ve Yüz */}
          <rect x="44" y="55" width="12" height="15" fill="#e2b992" rx="3" />
          <ellipse cx="50" cy="45" rx="19" ry="21" fill="#f0c299" />
          {/* Saç */}
          <path d="M30 42 C30 20 70 20 70 42 C70 48 72 58 72 62 C68 60 64 54 64 45 C64 30 36 30 36 45 C36 54 32 60 28 62 C28 58 30 48 30 42 Z" fill="#382218" />
          {/* Gözlük */}
          <circle cx="43" cy="45" r="7" fill="none" stroke="#d4af37" strokeWidth="2.5" />
          <circle cx="57" cy="45" r="7" fill="none" stroke="#d4af37" strokeWidth="2.5" />
          <line x1="50" y1="45" x2="50" y2="45" stroke="#d4af37" strokeWidth="2.5" />
          <circle cx="43" cy="45" r="2.5" fill="#1f2937" />
          <circle cx="57" cy="45" r="2.5" fill="#1f2937" />
          {/* Dudaklar */}
          <path d="M46 56 Q50 58 54 56" stroke="#b91c1c" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      );

    case 'bot-3': // Analist Can (Pala bıyıklı, papyonlu profesör)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#1c1d22" stroke="#4a4d57" strokeWidth="3" />
          {/* Gövde / Yelek */}
          <path d="M20 95 C25 66 75 66 80 95 Z" fill="#332720" />
          {/* Papyon */}
          <polygon points="43,72 57,72 50,75" fill="#78350f" />
          <polygon points="43,78 57,78 50,75" fill="#78350f" />
          {/* Kafa */}
          <ellipse cx="50" cy="46" rx="20" ry="22" fill="#dfad83" />
          {/* Saç ve Kel tepe */}
          <path d="M29 45 C29 32 35 24 40 24 C40 24 35 34 35 48 Z" fill="#64748b" />
          <path d="M71 45 C71 32 65 24 60 24 C60 24 65 34 65 48 Z" fill="#64748b" />
          {/* Gözler */}
          <ellipse cx="42" cy="42" rx="2.5" ry="2.5" fill="#18181b" />
          <ellipse cx="58" cy="42" rx="2.5" ry="2.5" fill="#18181b" />
          {/* Belirgin Bıyık */}
          <path d="M38 54 Q50 50 62 54 Q50 60 38 54 Z" fill="#475569" />
        </svg>
      );

    case 'bot-4': // Operatör Deniz (Taktik subay / sert çeneli kulaklıklı)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#1c1d22" stroke="#4a4d57" strokeWidth="3" />
          {/* Gövde / Askeri Üniforma */}
          <path d="M20 95 C25 65 75 65 80 95 Z" fill="#1e2d24" />
          <line x1="50" y1="68" x2="50" y2="95" stroke="#d4af37" strokeWidth="2" />
          {/* Yüz */}
          <polygon points="34,36 66,36 60,65 50,70 40,65" fill="#e4b58c" />
          {/* Askeri Beret / Şapka */}
          <path d="M26 36 C30 20 74 18 78 32 C78 38 30 40 26 36 Z" fill="#142018" />
          <circle cx="42" cy="28" r="3" fill="#d4af37" />
          {/* Gözler / Sert Bakış */}
          <line x1="39" y1="44" x2="47" y2="45" stroke="#1c1917" strokeWidth="3" />
          <line x1="53" y1="45" x2="61" y2="44" stroke="#1c1917" strokeWidth="3" />
          <circle cx="43" cy="48" r="2" fill="#1c1917" />
          <circle cx="57" cy="48" r="2" fill="#1c1917" />
          {/* İletişim Telsiz Kulaklığı */}
          <rect x="29" y="44" width="4" height="12" fill="#0f172a" rx="2" />
          <path d="M31 56 Q36 64 45 64" stroke="#0f172a" strokeWidth="2" fill="none" />
          <circle cx="46" cy="64" r="2" fill="#0f172a" />
        </svg>
      );

    default: // Sen (Komutan / Merkez Lider)
      return (
        <svg viewBox="0 0 100 100" className={className}>
          <circle cx="50" cy="50" r="48" fill="#1c1d22" stroke="#d4af37" strokeWidth="3.5" />
          {/* Üniforma ve Apoletler */}
          <path d="M18 95 C23 62 77 62 82 95 Z" fill="#172033" />
          {/* Altın Apoletler */}
          <rect x="22" y="66" width="12" height="6" fill="#d4af37" rx="2" transform="rotate(-15 28 69)" />
          <rect x="66" y="66" width="12" height="6" fill="#d4af37" rx="2" transform="rotate(15 72 69)" />
          {/* Boyun ve Yüz */}
          <rect x="43" y="50" width="14" height="16" fill="#e0a97a" rx="3" />
          <ellipse cx="50" cy="42" rx="20" ry="22" fill="#e8b488" />
          {/* Saç */}
          <path d="M30 38 C30 20 70 20 70 38 C70 32 60 22 50 22 C40 22 30 32 30 38 Z" fill="#2d2a32" />
          {/* Gözler ve Kararlı Bakış */}
          <ellipse cx="43" cy="42" rx="2.5" ry="2.5" fill="#0f172a" />
          <ellipse cx="57" cy="42" rx="2.5" ry="2.5" fill="#0f172a" />
          <line x1="39" y1="38" x2="47" y2="40" stroke="#2d2a32" strokeWidth="2.5" />
          <line x1="61" y1="38" x2="53" y2="40" stroke="#2d2a32" strokeWidth="2.5" />
          {/* Altın Komutan Rozeti */}
          <polygon points="50,68 53,74 59,74 54,78 56,84 50,80 44,84 46,78 41,74 47,74" fill="#fbbf24" stroke="#b45309" strokeWidth="0.5" />
        </svg>
      );
  }
}
