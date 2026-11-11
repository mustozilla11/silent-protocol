# 🎲 Secret Hitler 3D (Silent Protocol) - v1.0.0

> Strict **"Headless Engine"** mimarisiyle ayrıştırılmış, Vite + TypeScript + Vanilla Three.js + TailwindCSS tabanlı tam ekran **3D Secret Hitler** masaüstü web oyunu (`5 kişilik çevrimdışı / 4 yapay zeka botlu mod`).

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
