import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface TableSceneOptions {
  canvas: HTMLCanvasElement;
}

/**
 * Prosedürel (varlık yüklemesiz) ahşap masa dokusu üretir.
 * Hiçbir metin veya arayüz öğesi içermez (PROJECT_SPEC.md sınırına tam uyumlu).
 */
function createWoodTexture(): THREE.DataTexture {
  const width = 256;
  const height = 256;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Döşeme tekrarı (repeat) sırasında kesinti olmaması için periyodik frekanslar
      const u = (x / width) * Math.PI * 2;
      const v = (y / height) * Math.PI * 2;
      const wave = Math.sin(u * 2) * 1.4;
      const grain = Math.sin(v * 10 + wave) * 0.5 + 0.5;
      const fine = Math.sin(u * 12 + v * 4) * 0.5 + 0.5;
      const t = grain * 0.8 + fine * 0.2;

      const idx = (y * width + x) * 4;
      // Sıcak ceviz/maun tonları
      data[idx] = Math.round(82 + t * 34);     // R
      data[idx + 1] = Math.round(46 + t * 20); // G
      data[idx + 2] = Math.round(28 + t * 12); // B
      data[idx + 3] = 255;                     // A
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Adım 3 — 3D Masa, Loş Oda Aydınlatması, Üstten Açılı Kamera ve Board Plakaları.
 * Oyuncu silindirleri, kartlar ve animasyonlar Adım 5'te eklenecektir.
 */
export class TableScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly woodTexture: THREE.DataTexture;
  private animationFrameId: number | null = null;
  private isDisposed = false;

  constructor(options: TableSceneOptions) {
    this.canvas = options.canvas;

    // 1. Sahne & Loş Oda Atmosferi
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161412);
    this.scene.fog = new THREE.Fog(0x161412, 12, 28);

    // 2. Üstten Açılı (İzometrik Benzeri Perspektif) Kamera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    this.camera.position.set(0, 6.4, 5.8);

    // 3. Renderer (Tam Ekran Canvas)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // 4. Orbit & Pan Kontrolleri
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 13.5;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.update();

    this.woodTexture = createWoodTexture();

    this.setupLighting();
    this.buildRoomAndTable();
    this.buildPolicyBoards();

    window.addEventListener('resize', this.handleResize);
    this.startLoop();
  }

  private setupLighting(): void {
    // Loş oda ortam ışığı (gölgeleri tamamen boğmadan derinlik korur)
    const hemiLight = new THREE.HemisphereLight(0xfef3c7, 0x292524, 0.85);
    this.scene.add(hemiLight);

    // Masanın üstüne düşen sıcak loş spot ışığı (r186 uyumlu decay=0)
    const tableSpot = new THREE.SpotLight(0xffedd5, 2.6);
    tableSpot.position.set(0, 7.5, 0.4);
    tableSpot.angle = Math.PI / 3.1;
    tableSpot.penumbra = 0.72;
    tableSpot.decay = 0;
    tableSpot.distance = 30;
    tableSpot.castShadow = true;
    tableSpot.shadow.mapSize.width = 1024;
    tableSpot.shadow.mapSize.height = 1024;
    this.scene.add(tableSpot);

    // Hafif dolgu yönlü ışık (plakalar ve masa kenarları net seçilsin)
    const rimFill = new THREE.DirectionalLight(0xe2e8f0, 0.65);
    rimFill.position.set(-4.5, 5.5, 5);
    this.scene.add(rimFill);
  }

  private buildRoomAndTable(): void {
    // Oda zemini
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.92,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Ahşap Konsey Masası Gövdesi (düşük poli blok + düz ahşap doku yüzeyi)
    const tableWidth = 6.6;
    const tableDepth = 4.4;
    const tableThickness = 0.22;

    const tableBase = new THREE.Mesh(
      new THREE.BoxGeometry(tableWidth, tableThickness, tableDepth),
      new THREE.MeshStandardMaterial({
        color: 0x432515,
        roughness: 0.65,
      })
    );
    tableBase.position.y = -tableThickness / 2;
    tableBase.castShadow = true;
    tableBase.receiveShadow = true;
    this.scene.add(tableBase);

    // Masa Üstü Ahşap Yüzey Düzlemi (PlaneGeometry)
    const tableTopPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(tableWidth - 0.16, tableDepth - 0.16),
      new THREE.MeshStandardMaterial({
        map: this.woodTexture,
        roughness: 0.52,
        metalness: 0.05,
      })
    );
    tableTopPlane.rotation.x = -Math.PI / 2;
    tableTopPlane.position.y = 0.002;
    tableTopPlane.receiveShadow = true;
    this.scene.add(tableTopPlane);

    // Masa Altı Ayak Sütunu
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.72, 1.15, 20),
      new THREE.MeshStandardMaterial({
        color: 0x2e1a10,
        roughness: 0.75,
      })
    );
    pedestal.position.y = -0.68;
    pedestal.castShadow = true;
    this.scene.add(pedestal);
  }

  /**
   * Masanın üstüne Liberal (5 slot) ve Faşist (6 slot) board alanlarını
   * renkli düz plakalar (PlaneGeometry) olarak yerleştirir.
   */
  private buildPolicyBoards(): void {
    const boardGroup = new THREE.Group();
    this.scene.add(boardGroup);

    // 1. LIBERAL BOARD ALANI (Üst / Arka Plaka - 5 slot)
    const liberalBg = new THREE.Mesh(
      new THREE.PlaneGeometry(3.35, 1.04),
      new THREE.MeshStandardMaterial({
        color: 0x1e3a8a, // Koyu Liberal Mavi
        roughness: 0.65,
      })
    );
    liberalBg.rotation.x = -Math.PI / 2;
    liberalBg.position.set(0, 0.008, -0.62);
    liberalBg.receiveShadow = true;
    boardGroup.add(liberalBg);

    const slotWidth = 0.50;
    const slotHeight = 0.76;
    const slotGeo = new THREE.PlaneGeometry(slotWidth, slotHeight);

    for (let i = 0; i < 5; i++) {
      const slot = new THREE.Mesh(
        slotGeo,
        new THREE.MeshStandardMaterial({
          color: 0x2563eb, // Açık Mavi slot plakası
          roughness: 0.55,
        })
      );
      slot.rotation.x = -Math.PI / 2;
      slot.position.set((i - 2) * 0.60, 0.012, -0.62);
      slot.receiveShadow = true;
      boardGroup.add(slot);
    }

    // 2. FAŞİST BOARD ALANI (Alt / Ön Plaka - 6 slot)
    const fascistBg = new THREE.Mesh(
      new THREE.PlaneGeometry(3.96, 1.04),
      new THREE.MeshStandardMaterial({
        color: 0x5c1111, // Koyu Bordo Arka Plaka
        roughness: 0.65,
      })
    );
    fascistBg.rotation.x = -Math.PI / 2;
    fascistBg.position.set(0, 0.008, 0.62);
    fascistBg.receiveShadow = true;
    boardGroup.add(fascistBg);

    for (let i = 0; i < 6; i++) {
      // 3. slottan (Peek/Hitler sınırı) ve 4-5. (İnfaz) alanlarından itibaren hafif ton farkı
      const slotColor =
        i >= 5 ? 0xdc2626 : i >= 3 ? 0xb91c1c : i === 2 ? 0x991b1b : 0x7f1d1d;

      const slot = new THREE.Mesh(
        slotGeo,
        new THREE.MeshStandardMaterial({
          color: slotColor,
          roughness: 0.55,
        })
      );
      slot.rotation.x = -Math.PI / 2;
      slot.position.set((i - 2.5) * 0.60, 0.012, 0.62);
      slot.receiveShadow = true;
      boardGroup.add(slot);
    }
  }

  private handleResize = (): void => {
    if (this.isDisposed) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private startLoop(): void {
    const tick = (): void => {
      if (this.isDisposed) return;
      this.animationFrameId = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose(): void {
    this.isDisposed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.handleResize);
    this.controls.dispose();
    this.woodTexture.dispose();
    this.renderer.dispose();
  }
}
