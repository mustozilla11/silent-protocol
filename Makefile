VERSION ?= v0.3.0
BIN_DIR ?= bin
BINARY ?= $(BIN_DIR)/silent-protocol
INSTALL_BIN ?= $(HOME)/.local/bin
INSTALL_DESKTOP ?= $(HOME)/.local/share/applications
INSTALL_ICONS ?= $(HOME)/.local/share/icons

.PHONY: all build client server install run dev clean test

all: build

## 🔨 Derleme: React istemcisini derler ve Go tek ikili dosyasına gömer
build: client server
	@echo " Derleme tamamlandı: $(BINARY) ($(VERSION))"

client:
	@echo "📦 React istemcisi derleniyor..."
	cd client && npm install && npm run build
	rm -rf server/dist
	cp -r client/dist server/dist

server:
	@echo "🐹 Go sunucusu ve gömülü varlıklar derleniyor..."
	mkdir -p $(BIN_DIR)
	cd server && go build -ldflags="-s -w" -o ../$(BINARY) .

## 🚀 Linux Masaüstü Entegrasyonu ve Symlink Kurulumu
install: build
	@echo " Kurulum yapılıyor..."
	mkdir -p $(INSTALL_BIN)
	mkdir -p $(INSTALL_DESKTOP)
	mkdir -p $(INSTALL_ICONS)
	
	# ~/.local/bin/ içine ikili dosya kopyalama/bağlama
	rm -f $(INSTALL_BIN)/silent-protocol
	cp $(BINARY) $(INSTALL_BIN)/silent-protocol
	chmod +x $(INSTALL_BIN)/silent-protocol
	
	# İkon ve .desktop dosyası
	cp assets/icon.svg $(INSTALL_ICONS)/silent-protocol.svg
	cp silent-protocol.desktop $(INSTALL_DESKTOP)/silent-protocol.desktop
	sed -i 's|Icon=silent-protocol|Icon=$(INSTALL_ICONS)/silent-protocol.svg|g' $(INSTALL_DESKTOP)/silent-protocol.desktop
	chmod +x $(INSTALL_DESKTOP)/silent-protocol.desktop
	
	@echo " Kurulum başarıyla tamamlandı!"
	@echo " Terminalden tek kelimeyle başlatmak için: silent-protocol"
	@echo " Uygulama menüsünden 'Sessiz Protokol' adıyla açabilirsiniz."

## ▶️ Çalıştır (Yerel binary üzerinden)
run:
	$(BINARY)

## 🛠️ Geliştirme modu (Client dev server + Go backend)
dev:
	@echo "Geliştirici modu başlatılıyor..."
	(cd server && go run . --open=false) & \
	(cd client && npm run dev)

## 🧹 Temizlik
clean:
	rm -rf $(BIN_DIR) server/dist client/dist

version:
	@echo $(VERSION)
