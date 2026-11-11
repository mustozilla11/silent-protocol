# 🎲 Secret Hitler 3D (Silent Protocol) - v1.1.0

> Strict **"Headless Engine"** mimarisiyle ayrıştırılmış, Vite + TypeScript + Vanilla Three.js + TailwindCSS tabanlı tam ekran **3D Secret Hitler** masaüstü web oyunu (`5–10 kişilik tam resmi kurallar`).

---

## 📌 v1.1.0 Tam Kural Seti & Mekanikler
- **5 ila 10 Oyuncu Desteği & Gece Bilgi Dinamiği**:
  - **5–6 Kişi**: Faşist ve Hitler birbirini tanır.
  - **7–10 Kişi**: Faşistler birbirini ve Hitler'i görür; **Hitler takım arkadaşlarını bilmez**.
  - Her oyuncu **Gizli Rol Kartı** (`LIBERAL | FASCIST | HITLER`) ile **Parti Üyeliği Kartı** (`LIBERAL | FAŞİST` — Hitler'de de `FAŞİST` yazar) alır.
- **Oyuncu Sayısına Göre Resmi Yürütme Yetkileri (`Executive Actions`)**:
  - `5–6`: 3. Faşist `Policy Peek` (Üst 3 Kart), 4. ve 5. Faşist `Execution` (İdam).
  - `7–8`: 2. `Investigate Loyalty`, 3. `Special Election`, 4.–5. `Execution`.
  - `9–10`: 1.–2. `Investigate Loyalty`, 3. `Special Election`, 4.–5. `Execution`.
- **Veto Yetkisi**: 5. Faşist politika sonrasında Şansölye veto teklif edebilir; Başkan kabul ederse her iki kart çöpe gider ve Seçim Sayacı `+1` ilerler.
- **Yasama Sonrası Beyan & Çelişki Tartışması (`CLAIM_DEBATE`)**: Politik kart masaya konduktan sonra Başkan/Şansölye çekilen/verilen kartları beyan eder, çelişkiler yakalanır ve bot hafızasını etkiler.

---

## 🏗️ v1.0.0 Mimari Yapı (`PROJECT_SPEC.md` Uyumlu)

```text
client/
├── index.html                  # Tam ekran #game-canvas ve #ui-overlay ayrımı
├── src/
│   ├── engine/                 # Saf Başsız (Headless) Kural Motoru — ZERO Three.js / DOM
│   │   ├── types.ts            # Rol, Politika, Oy, Faz, PlayerView ve Event tipleri
│   │   ├── EventEmitter.ts     # Tip-güvenli olay yayınlayıcı
│   │   ├── GameEngine.ts       # 5 kişilik Secret Hitler State Machine & Store
│   │   ├── BotController.ts    # Çevrimdışı 4 bot için AI/Mock karar mantığı
│   │   └── engine.test.ts      # Konsol/terminal birim & tam oyun simülasyon testleri
│   ├── render/                 # Saf 3D Görselleştirici (Viewer)
│   │   └── TableScene.ts       # Ahşap masa, loş spot ışığı, OrbitControls, 5 figür, kart kutuları
│   ├── ui/                     # HTML/Tailwind DOM Overlay Katmanı
│   │   └── GameOverlay.ts      # Gizli rol kartı, Ja/Nein oylama, kart seçimi, üst bar & kayıtlar
│   └── main.ts                 # /engine, /render ve /ui birleşim giriş noktası
```

### Temel Sınırlar
1. **Headless Engine (`src/engine/`)**: Hiçbir Three.js veya DOM bağımlılığı içermez; konsolda `npm run test:engine` ile bağımsız test edilebilir.
2. **NO 3D Canvas UI**: Tüm yazılar, rol kartları ve `JA/NEIN` oylama butonları canvas üzerindeki HTML/Tailwind DOM katmanındadır.
3. **Düşük Poligonlu 3D Sahne (`src/render/`)**: Prosedürel ahşap dokulu masa düzlemi, `PlaneGeometry` Liberal (5) & Faşist (6) board alanları, silindir/küre 5 oyuncu figürü, sırası gelen oyuncunun üzerinde süzülen ışık/halka ve masanın ortasından çıkan 3D politika kart kutuları (`BoxGeometry`).

---

## 🚀 Çalıştırma & Test

```bash
# TypeScript doğrulaması
cd client && npm run typecheck

# Saf Headless Kural Motoru testleri (terminalde tam oyun simülasyonu dahil)
cd client && npm run test:engine

# Vite geliştirici sunucusu
cd client && npm run dev

# Tam üretim derlemesi ve Linux masaüstü kurulumu
make install
silent-protocol
```
