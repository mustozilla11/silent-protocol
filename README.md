# 🛡️ Sessiz Protokol (Silent Protocol) - v0.3.0

> Sesli veya yazılı sohbet içermeyen; tamamen **"işaretler, iddialar ve veri logları"** üzerinden oynanan sessiz bir masabaşı sosyal çıkarım (social deduction) oyunu.

---

## 📌 v0.3.0 Yenilikleri: Mimik & İşaret Sistemi
- **Dinamik Göz ve Mimik Motoru**:
  - Karakterlerin gözbebekleri sağa ve sola kayarak diğer oyuncuları süzer (`👈 Solu Süz`, `👉 Sağı Süz`).
  - Gözler fal taşı gibi açılır (`😲 Ha?!`), ampul parıltısıyla kısılır (`💡 Aha!`), tek kaş kalkıp gözler yukarı dikilir (`🧐 Hmm...`).
- **İşaret Parmağı Jesti (Pointing)**:
  - Karakterler masaya ellerini uzatıp şüpheli gördükleri kişiyi işaret parmağıyla gösterebilir (`🫵 İşaret Et`).
- **Sessiz Reaksiyon Baloncukları (Murmur Bubbles)**:
  - Karakterlerin kafasının üzerinde beliren çizgi roman baloncukları: `"Hmm..."`, `"Ha?!"`, `"Aha!"`, `"👉 Sen!"`.
  - Masada çelişki patladığında botlar otomatik olarak `"Ha?!"` ve `"Aha!"` baloncuklarıyla şüpheliye döner!
- **Oyuncu Mimik Çarkı**:
  - Koltuğunun altındaki mimik butonlarıyla istediğin zaman masaya sessiz tepkini yansıtabilirsin.

---

## 📌 v0.2.0 Yenilikleri
- **Masabaşı Düzeni (Oval Poker/Board Game Table)**:
  - 5 oyuncunun masanın etrafında sandalyelere oturduğu gerçek bir kutu oyunu hissi.
  - Özel çizilmiş vektörel noir karakter portreleri (Ajan Kaya, Diplomat Ece, Analist Can, Taktisyen Deniz, Komutan).
- **10-12 Saniyelik Karar ve Gerilim Süresi (Round Timer)**:
  - Botlar artık oldu-bittiye getirmeden 2-6 saniye düşünerek hareket eder.
  - Masanın üzerinde canlı geri sayım sayacı.
- **Siyah ve Beyaz Tema Desteği**:
  - Koyu Noir Ahşap & Keçe Masası (Varsayılan).
  - Klasik Açık/Beyaz Arşiv Kağıdı Teması (Tek tıkla geçiş).
- **Yapay Zeka Renkleri Temizlendi**:
  - Neon siber maviler yerine antika pirinç/altın, derin bordo, lacivert ve daktilo mürekkebi tonları.

---

## 📌 v0.1.0 MVP Özellikleri

- **Authoritative Server Mimarisi**:
  - Go ile goroutine ve WebSocket tabanlı hafif, gecikmesiz sunucu motoru.
  - Kart destesi, kapalı roller ve gizli durumlar sadece sunucu RAM belleğinde tutulur; istemciye hileye açık hiçbir veri sızdırılmaz.
- **5 Kişilik Masa Simülasyonu**:
  - 1 Gerçek Oyuncu + 4 Kural Tabanlı Bot (Ajan Kaya, Mühendis Ece, Analist Can, Operatör Deniz).
  - 3 Koruyucu, 1 Casus, 1 Gizli Lider rol dağılımı.
  - 17 Yasa Kartı: 6 Koruyucu (Mavi) ve 11 Casus (Kırmızı).
- **Tur Döngüsü (FSM)**:
  - **LOBBY**: Masaya oturma ve simülasyon başlatma.
  - **NOMINATION**: Liderin Ortak (Şansölye) aday göstermesi.
  - **VOTING**: Gizli JA (Evet) / NEIN (Hayır) oylaması. 3 başarısız oylamada kaos zirve yapar!
  - **LEGISLATION**:
    - Lider 3 kart çeker, 1'ini gizlice eler, 2'sini Ortağa iletir.
    - Ortak 1'ini gizlice eler, 1'ini masaya sürer.
  - **CLAIMING (Konuşmasız İddia Arayüzü)**:
    - Lider ne çektiğini ve ne aktardığını beyan eder.
    - Ortak ne aldığını beyan eder.
    - Beyanlar uyuşmazsa masada **⚡ "ÇELİŞKİ TESPİT EDİLDİ!"** alarmı çalar.
  - **SUSPICION MARKING (Şüphe/Güven Çipleri)**:
    - Oyuncular masadaki avatarlara yeşil 🟢 veya kırmızı 🔴 çipler yerleştirir.
  - **POWERS**: Kırmızı yasa yetkileri (Kart İnceleme ve İnfaz).
  - **GAME OVER**: 5 Mavi (Koruyucu Zaferi), 6 Kırmızı (Casus Zaferi) veya 3 Kırmızıdan sonra Gizli Lider Ortak seçilirse (Casus Zaferi).
- **Linux Masaüstü Entegrasyonu**:
  - Tek bağımsız binary (`bin/silent-protocol`): İçine React frontend'i gömülüdür (`go:embed`).
  - Terminalden tek kelimeyle: `silent-protocol`
  - Uygulama menüsünden: `Sessiz Protokol` (`.desktop` kısayolu ve SVG ikonuyla hazır).

---

## 🚀 Hızlı Başlangıç

### 1. Terminalden Başlatma (Masaüstü Kurulumu Yapıldı)
```bash
silent-protocol
```
*Bu komut sunucuyu başlatır ve varsayılan tarayıcınızda oyunu otomatik açar.*

### 2. Makefile ile Çalıştırma
```bash
# Projeyi derle ve kur
make install

# Yerel olarak çalıştır
make run

# Geliştirici modunda çalıştır (Hot-reload React + Go)
make dev
```

---

## 🏗️ Proje Mimarisi

```
silent-protocol/
├── server/               # Go Authoritative Engine & WebSocket Hub
│   ├── game/
│   │   ├── model.go      # Roller, Durumlar, Deste & DTO modelleri
│   │   └── engine.go     # FSM, Bot AI, Çelişki Mantığı & Kural Motoru
│   ├── hub.go            # WebSocket Client/Room dağıtıcısı
│   └── main.go           # Sunucu girişi & SPA gömülü dosya sunucusu
├── client/               # React + Tailwind CSS + Lucide Icons
│   ├── src/
│   │   ├── App.jsx       # Masaüstü/Mobil uyumlu Dark UI paneli
│   │   └── index.css     # Animasyonlar ve Tailwind stilleri
│   └── package.json      # v0.1.0
├── assets/               # SVG simgeleri
├── Makefile              # Derleme, test ve Linux kurulum komutları
└── silent-protocol.desktop # Masaüstü başlatıcı dosyası
```

---

## 🏷️ Sürüm
**v0.1.0** (SemVer uyumlu)
