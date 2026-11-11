import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GameEngine, GameState, PlayerView, Policy } from '../engine/index.ts';

export interface TableSceneOptions {
  canvas: HTMLCanvasElement;
  engine: GameEngine;
}

interface PlayerFigure {
  group: THREE.Group;
  pawnGroup: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  votePlate: THREE.Mesh;
  voteMat: THREE.MeshStandardMaterial;
  baseRing: THREE.Mesh;
  baseRingMat: THREE.MeshBasicMaterial;
  basePos: THREE.Vector3;
}

interface ActiveCardBox {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  targetPos: THREE.Vector3;
  targetScale: number;
}

const SEAT_COLORS = [
  0x3b82f6, // 0: İnsan Oyuncu (Kobalt Mavi)
  0x64748b, // 1: Bot 1 (Arduvaz)
  0x10b981, // 2: Bot 2 (Zümrüt)
  0xf59e0b, // 3: Bot 3 (Kehribar)
  0xa855f7, // 4: Bot 4 (Mor)
];

// 5 oyuncunun masa etrafındaki oturma koordinatları (tümü kameraya ve UI'a göre engelsiz görünür)
const SEAT_POSITIONS: ReadonlyArray<[number, number, number]> = [
  [0, 0, 2.58],      // 0: Alt orta (İnsan)
  [-3.72, 0, 0.75],  // 1: Sol
  [-2.25, 0, -2.55], // 2: Sol üst
  [2.25, 0, -2.55],  // 3: Sağ üst
  [3.72, 0, 0.75],   // 4: Sağ
];

/**
 * Prosedürel ahşap masa dokusu üretir (metin/arayüz öğesi içermez).
 */
function createWoodTexture(): THREE.DataTexture {
  const width = 256;
  const height = 256;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x / width) * Math.PI * 2;
      const v = (y / height) * Math.PI * 2;
      const wave = Math.sin(u * 2) * 1.4;
      const grain = Math.sin(v * 10 + wave) * 0.5 + 0.5;
      const fine = Math.sin(u * 12 + v * 4) * 0.5 + 0.5;
      const t = grain * 0.8 + fine * 0.2;

      const idx = (y * width + x) * 4;
      data[idx] = Math.round(82 + t * 34);
      data[idx + 1] = Math.round(46 + t * 20);
      data[idx + 2] = Math.round(28 + t * 12);
      data[idx + 3] = 255;
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
 * Adım 5 — GameEngine durum değişikliklerini ve olaylarını dinleyen saf 3D Görselleştirici (Viewer).
 * Hiçbir oyun kuralı içermez ve motor üzerinde mutasyon çağrısı yapmaz.
 */
export class TableScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly engine: GameEngine;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly woodTexture: THREE.DataTexture;

  private readonly figures: PlayerFigure[] = [];
  private readonly liberalTiles: THREE.Mesh[] = [];
  private readonly fascistTiles: THREE.Mesh[] = [];
  private readonly chaosMarkers: THREE.MeshStandardMaterial[] = [];
  private readonly activeCards: ActiveCardBox[] = [];

  private drawDeckMesh!: THREE.Mesh;
  private discardDeckMesh!: THREE.Mesh;
  private turnHaloMesh!: THREE.Mesh;
  private turnHaloLight!: THREE.PointLight;
  private turnTargetPos = new THREE.Vector3(0, 1.5, 2.55);

  private latestState: GameState;
  private latestHumanView: PlayerView;
  private unsubscribers: Array<() => void> = [];
  private animationFrameId: number | null = null;
  private startTime = performance.now();
  private cardBurstTimer = 0;
  private isDisposed = false;

  constructor(options: TableSceneOptions) {
    this.canvas = options.canvas;
    this.engine = options.engine;
    this.latestState = this.engine.getState();
    this.latestHumanView = this.engine.getPlayerView('human');

    // 1. Sahne & Loş Oda Atmosferi
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161412);
    this.scene.fog = new THREE.Fog(0x161412, 14, 32);

    // 2. Üstten Açılı (İzometrik Benzeri Perspektif) Kamera (tüm 5 figürü alt barın üstünde tutar)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    this.camera.position.set(0, 8.6, 7.5);

    // 3. Renderer
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
    this.renderer.toneMappingExposure = 1.18;

    // 4. Orbit & Pan Kontrolleri
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0.05, 0.78);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 4.5;
    this.controls.maxDistance = 15;
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.update();

    this.woodTexture = createWoodTexture();

    this.setupLighting();
    this.buildRoomAndTable();
    this.buildPolicyBoardsAndDecks();
    this.buildPlayerFigures();
    this.buildActiveTurnIndicator();
    this.buildActiveCardBoxes();

    this.bindEngineEvents();
    this.syncFromState();

    window.addEventListener('resize', this.handleResize);
    this.startLoop();
  }

  private setupLighting(): void {
    const hemiLight = new THREE.HemisphereLight(0xfef3c7, 0x292524, 0.9);
    this.scene.add(hemiLight);

    const tableSpot = new THREE.SpotLight(0xffedd5, 2.7);
    tableSpot.position.set(0, 8.0, 0.4);
    tableSpot.angle = Math.PI / 2.8;
    tableSpot.penumbra = 0.72;
    tableSpot.decay = 0;
    tableSpot.distance = 32;
    tableSpot.castShadow = true;
    tableSpot.shadow.mapSize.width = 1024;
    tableSpot.shadow.mapSize.height = 1024;
    this.scene.add(tableSpot);

    const rimFill = new THREE.DirectionalLight(0xe2e8f0, 0.7);
    rimFill.position.set(-4.5, 5.8, 5.2);
    this.scene.add(rimFill);
  }

  private buildRoomAndTable(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.92,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    floor.receiveShadow = true;
    this.scene.add(floor);

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

  private buildPolicyBoardsAndDecks(): void {
    const boardGroup = new THREE.Group();
    this.scene.add(boardGroup);

    // 1. LIBERAL BOARD (5 Slot + Dolu Politika Kutuları)
    const liberalBg = new THREE.Mesh(
      new THREE.PlaneGeometry(3.35, 1.04),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.65 })
    );
    liberalBg.rotation.x = -Math.PI / 2;
    liberalBg.position.set(0, 0.008, -0.65);
    liberalBg.receiveShadow = true;
    boardGroup.add(liberalBg);

    const slotGeo = new THREE.PlaneGeometry(0.50, 0.76);
    const tileGeo = new THREE.BoxGeometry(0.46, 0.04, 0.70);

    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.60;
      const slot = new THREE.Mesh(
        slotGeo,
        new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55 })
      );
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(x, 0.012, -0.65);
      slot.receiveShadow = true;
      boardGroup.add(slot);

      const tile = new THREE.Mesh(
        tileGeo,
        new THREE.MeshStandardMaterial({
          color: 0x60a5fa,
          roughness: 0.35,
          emissive: 0x1d4ed8,
          emissiveIntensity: 0.25,
        })
      );
      tile.position.set(x, 0.032, -0.65);
      tile.castShadow = true;
      tile.visible = false;
      boardGroup.add(tile);
      this.liberalTiles.push(tile);
    }

    // 2. FAŞİST BOARD (6 Slot + Dolu Politika Kutuları)
    const fascistBg = new THREE.Mesh(
      new THREE.PlaneGeometry(3.96, 1.04),
      new THREE.MeshStandardMaterial({ color: 0x5c1111, roughness: 0.65 })
    );
    fascistBg.rotation.x = -Math.PI / 2;
    fascistBg.position.set(0, 0.008, 0.65);
    fascistBg.receiveShadow = true;
    boardGroup.add(fascistBg);

    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.60;
      const slotColor =
        i >= 5 ? 0xdc2626 : i >= 3 ? 0xb91c1c : i === 2 ? 0x991b1b : 0x7f1d1d;

      const slot = new THREE.Mesh(
        slotGeo,
        new THREE.MeshStandardMaterial({ color: slotColor, roughness: 0.55 })
      );
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(x, 0.012, 0.65);
      slot.receiveShadow = true;
      boardGroup.add(slot);

      const tile = new THREE.Mesh(
        tileGeo,
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          roughness: 0.35,
          emissive: 0x991b1b,
          emissiveIntensity: 0.25,
        })
      );
      tile.position.set(x, 0.032, 0.65);
      tile.castShadow = true;
      tile.visible = false;
      boardGroup.add(tile);
      this.fascistTiles.push(tile);
    }

    // 3. SOLDA YASA DESTESİ (Draw Pile) ve SAĞDA ISKARTA DESTESİ (Discard Pile)
    const deckGeo = new THREE.BoxGeometry(0.48, 0.32, 0.68);
    this.drawDeckMesh = new THREE.Mesh(
      deckGeo,
      new THREE.MeshStandardMaterial({
        color: 0xb45309,
        roughness: 0.45,
      })
    );
    this.drawDeckMesh.position.set(-2.55, 0.16, 0);
    this.drawDeckMesh.castShadow = true;
    boardGroup.add(this.drawDeckMesh);

    this.discardDeckMesh = new THREE.Mesh(
      deckGeo,
      new THREE.MeshStandardMaterial({
        color: 0x44403c,
        roughness: 0.65,
      })
    );
    this.discardDeckMesh.position.set(2.55, 0.08, 0);
    this.discardDeckMesh.castShadow = true;
    boardGroup.add(this.discardDeckMesh);

    // 4. KAOS SAYACI PULLARI (3 küçük silindir pul)
    const chaosGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 18);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x44403c,
        roughness: 0.4,
      });
      const marker = new THREE.Mesh(chaosGeo, mat);
      marker.position.set((i - 1) * 0.36, 0.025, 1.42);
      boardGroup.add(marker);
      this.chaosMarkers.push(mat);
    }
  }

  /**
   * Masa etrafına 5 adet basit düşük-poligon silindir/figür yerleştirir.
   */
  private buildPlayerFigures(): void {
    const bodyGeo = new THREE.CylinderGeometry(0.24, 0.34, 0.92, 18);
    const headGeo = new THREE.SphereGeometry(0.24, 18, 18);
    const baseRingGeo = new THREE.RingGeometry(0.42, 0.52, 24);
    const votePlateGeo = new THREE.BoxGeometry(0.38, 0.04, 0.24);

    for (let i = 0; i < 5; i++) {
      const [sx, sy, sz] = SEAT_POSITIONS[i];
      const basePos = new THREE.Vector3(sx, sy, sz);

      const group = new THREE.Group();
      group.position.copy(basePos);
      // Yalnızca Y ekseninde masa merkezine bak (yaw)
      const angleToCenter = Math.atan2(-basePos.x, -basePos.z);
      group.rotation.y = angleToCenter;
      this.scene.add(group);

      // İç figür grubu (ölünce devrilme animasyonu yalnızca bu alt grubu yatırır)
      const pawnGroup = new THREE.Group();
      group.add(pawnGroup);

      const bodyMat = new THREE.MeshStandardMaterial({
        color: SEAT_COLORS[i],
        roughness: 0.52,
        transparent: true,
        opacity: 1,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.08;
      body.castShadow = true;
      body.receiveShadow = true;
      pawnGroup.add(body);

      const headMat = new THREE.MeshStandardMaterial({
        color: 0xf1c27d,
        roughness: 0.48,
        transparent: true,
        opacity: 1,
      });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.76;
      head.castShadow = true;
      pawnGroup.add(head);

      // Koltuk altındaki durum/adaylık halkası (group içinde, her zaman yatay!)
      const baseRingMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.y = -0.36;
      baseRing.visible = false;
      group.add(baseRing);

      // Oyuncunun masaya yakın kenarındaki basit Ja/Nein oy kutusu (yeşil/kırmızı)
      const voteMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.4,
      });
      const votePlate = new THREE.Mesh(votePlateGeo, voteMat);
      votePlate.position.set(0, 0.03, 0.85);
      votePlate.visible = false;
      votePlate.castShadow = true;
      group.add(votePlate);

      this.figures.push({
        group,
        pawnGroup,
        bodyMat,
        headMat,
        votePlate,
        voteMat,
        baseRing,
        baseRingMat,
        basePos,
      });
    }
  }

  /**
   * Sırası gelen oyuncunun üzerinde süzülen küçük ışık ve parlayan halka.
   */
  private buildActiveTurnIndicator(): void {
    const haloGeo = new THREE.TorusGeometry(0.36, 0.035, 12, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.95,
    });
    this.turnHaloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.turnHaloMesh.rotation.x = Math.PI / 2;
    this.turnHaloMesh.position.set(0, 1.45, 2.55);
    this.scene.add(this.turnHaloMesh);

    this.turnHaloLight = new THREE.PointLight(0xfbbf24, 1.8, 4.5, 0);
    this.turnHaloLight.position.set(0, 1.55, 2.55);
    this.scene.add(this.turnHaloLight);
  }

  /**
   * Kart çekildiğinde masanın ortasından beliren 3D kart kutuları (BoxGeometry).
   */
  private buildActiveCardBoxes(): void {
    const boxGeo = new THREE.BoxGeometry(0.42, 0.05, 0.56);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.35,
        emissive: 0x000000,
      });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(-2.55, 0.35, 0);
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);

      this.activeCards.push({
        mesh,
        mat,
        targetPos: new THREE.Vector3(-2.55, 0.35, 0),
        targetScale: 1,
      });
    }
  }

  private bindEngineEvents(): void {
    this.unsubscribers.push(
      this.engine.events.on('STATE_CHANGED', (state) => {
        this.latestState = state;
        this.latestHumanView = this.engine.getPlayerView('human');
        this.syncFromState();
      }),
      this.engine.events.on('CARDS_DRAWN', () => {
        // Kart çekildiği anda deste üzerinden masanın ortasına fırlama animasyonu başlat
        this.cardBurstTimer = 1.0;
        for (const c of this.activeCards) {
          c.mesh.position.set(-2.55, 0.38, 0);
          c.mesh.scale.setScalar(0.35);
        }
      }),
      this.engine.events.on('POLICY_ENACTED', () => {
        this.cardBurstTimer = 0.85;
      })
    );
  }

  private syncFromState(): void {
    const s = this.latestState;
    const view = this.latestHumanView;

    // 1. Liberal & Faşist Board Plakalarının Üstündeki Kart Kutularını Güncelle
    this.liberalTiles.forEach((tile, i) => {
      tile.visible = i < s.liberalPolicies;
    });
    this.fascistTiles.forEach((tile, i) => {
      tile.visible = i < s.fascistPolicies;
    });

    // 2. Deste & Iskarta Yığınlarının Yüksekliği
    const drawRatio = Math.max(0.12, s.drawPile.length / 17);
    this.drawDeckMesh.scale.y = drawRatio;
    this.drawDeckMesh.position.y = 0.16 * drawRatio;
    this.drawDeckMesh.visible = s.drawPile.length > 0;

    const discardRatio = Math.max(0.1, s.discardPile.length / 17);
    this.discardDeckMesh.scale.y = discardRatio;
    this.discardDeckMesh.position.y = 0.16 * discardRatio;
    this.discardDeckMesh.visible = s.discardPile.length > 0;

    // 3. Kaos Sayacı Pulları (0..3)
    this.chaosMarkers.forEach((mat, i) => {
      const lit = i < s.electionTracker;
      mat.color.setHex(lit ? 0xef4444 : 0x44403c);
      mat.emissive.setHex(lit ? 0x991b1b : 0x000000);
    });

    // 4. 5 Oyuncu Silindirinin Durumu (Canlı/Ölü, Başkan/Şansölye Halkası, Oy Kutusu)
    s.players.forEach((pl, idx) => {
      const fig = this.figures[idx];
      if (!fig) return;

      if (!pl.isAlive) {
        fig.pawnGroup.rotation.z = 1.35;
        fig.pawnGroup.position.y = -0.25;
        fig.bodyMat.opacity = 0.35;
        fig.headMat.opacity = 0.35;
        fig.baseRing.visible = false;
        fig.votePlate.visible = false;
        return;
      }

      fig.pawnGroup.rotation.z = 0;
      fig.pawnGroup.position.y = 0;
      fig.bodyMat.opacity = 1;
      fig.headMat.opacity = 1;

      const isPres = pl.id === s.presidentId;
      const isChanc = pl.id === s.chancellorId || pl.id === s.chancellorNomineeId;

      if (isPres) {
        fig.baseRing.visible = true;
        fig.baseRingMat.color.setHex(0xf59e0b); // Altın Başkan halkası
      } else if (isChanc) {
        fig.baseRing.visible = true;
        fig.baseRingMat.color.setHex(0x10b981); // Zümrüt Şansölye halkası
      } else {
        fig.baseRing.visible = false;
      }

      // Oy Kutusu Göstergesi
      if (s.phase === 'ELECTION_VOTING') {
        if (s.votes[pl.id]) {
          fig.votePlate.visible = true;
          fig.voteMat.color.setHex(0xf59e0b); // Gizli oy masaya bırakıldı
        } else {
          fig.votePlate.visible = false;
        }
      } else if (s.lastElectionResult?.votes[pl.id]) {
        const v = s.lastElectionResult.votes[pl.id];
        fig.votePlate.visible = true;
        fig.voteMat.color.setHex(v === 'JA' ? 0x10b981 : 0xef4444);
      } else {
        fig.votePlate.visible = false;
      }
    });

    // 5. Sırası Gelen Oyuncunun Üstündeki Işık & Halka Hedefi
    const activePlayerId =
      s.phase === 'LEGISLATIVE_CHANCELLOR' && s.chancellorId
        ? s.chancellorId
        : s.presidentId;
    const activeIdx = s.players.findIndex((p) => p.id === activePlayerId);
    if (activeIdx >= 0 && this.figures[activeIdx]) {
      const pPos = this.figures[activeIdx].basePos;
      this.turnTargetPos.set(pPos.x, 1.38, pPos.z);
    }

    const haloColor =
      s.phase === 'LEGISLATIVE_CHANCELLOR'
        ? 0x10b981
        : s.phase === 'EXECUTIVE_EXECUTION'
        ? 0xef4444
        : 0xfbbf24;
    (this.turnHaloMesh.material as THREE.MeshBasicMaterial).color.setHex(haloColor);
    this.turnHaloLight.color.setHex(haloColor);
    this.turnHaloMesh.visible = s.phase !== 'GAME_OVER';
    this.turnHaloLight.visible = s.phase !== 'GAME_OVER';

    // 6. Kart Çekildiğinde Masanın Ortasında Beliren Kart Kutuları (BoxGeometry)
    const applyBoxColor = (box: ActiveCardBox, pol?: Policy) => {
      if (pol === 'LIBERAL') {
        box.mat.color.setHex(0x2563eb);
        box.mat.emissive.setHex(0x1e40af);
        box.mat.emissiveIntensity = 0.25;
      } else if (pol === 'FASCIST') {
        box.mat.color.setHex(0xdc2626);
        box.mat.emissive.setHex(0x7f1d1d);
        box.mat.emissiveIntensity = 0.25;
      } else {
        // Başka oyuncunun elindeki gizli kartlar kapalı koyu amber renginde
        box.mat.color.setHex(0xb45309);
        box.mat.emissive.setHex(0x451a03);
        box.mat.emissiveIntensity = 0.2;
      }
    };

    if (s.phase === 'LEGISLATIVE_PRESIDENT') {
      const hand = view.presidentHand;
      for (let i = 0; i < 3; i++) {
        const card = this.activeCards[i];
        card.mesh.visible = true;
        card.targetPos.set((i - 1) * 0.54, 0.28, 0);
        card.targetScale = 1.0;
        applyBoxColor(card, hand ? hand[i] : undefined);
      }
    } else if (s.phase === 'LEGISLATIVE_CHANCELLOR') {
      const hand = view.chancellorHand;
      for (let i = 0; i < 3; i++) {
        const card = this.activeCards[i];
        if (i < 2) {
          card.mesh.visible = true;
          card.targetPos.set((i - 0.5) * 0.60, 0.28, 0);
          card.targetScale = 1.05;
          applyBoxColor(card, hand ? hand[i] : undefined);
        } else {
          // 3. kart ıskartaya gitti
          card.mesh.visible = false;
          card.targetPos.set(2.55, 0.25, 0);
        }
      }
    } else if (s.phase === 'EXECUTIVE_PEEK') {
      const peek = view.peekedCards;
      for (let i = 0; i < 3; i++) {
        const card = this.activeCards[i];
        card.mesh.visible = true;
        card.targetPos.set((i - 1) * 0.62, 0.34, -0.05);
        card.targetScale = 1.0;
        applyBoxColor(card, peek ? peek[i] : undefined);
      }
    } else {
      for (const card of this.activeCards) {
        card.mesh.visible = false;
        card.targetPos.set(-2.55, 0.35, 0);
      }
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
    let lastTime = performance.now();

    const tick = (): void => {
      if (this.isDisposed) return;
      this.animationFrameId = requestAnimationFrame(tick);

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const elapsed = (now - this.startTime) / 1000;

      // Sırası gelen oyuncunun üzerindeki ışık ve halka yumuşakça takip edip süzülür
      const bobY = Math.sin(elapsed * 3.2) * 0.07;
      const haloGoal = new THREE.Vector3(
        this.turnTargetPos.x,
        this.turnTargetPos.y + bobY,
        this.turnTargetPos.z
      );
      this.turnHaloMesh.position.lerp(haloGoal, 0.14);
      this.turnHaloMesh.rotation.z = elapsed * 1.1;
      const haloScale = 1 + Math.sin(elapsed * 4.5) * 0.08;
      this.turnHaloMesh.scale.set(haloScale, haloScale, 1);

      this.turnHaloLight.position.lerp(
        new THREE.Vector3(haloGoal.x, haloGoal.y + 0.25, haloGoal.z),
        0.14
      );

      // Masanın ortasında beliren kart kutuları yumuşakça konumuna oturur
      if (this.cardBurstTimer > 0) {
        this.cardBurstTimer = Math.max(0, this.cardBurstTimer - dt);
      }

      this.activeCards.forEach((card, i) => {
        if (!card.mesh.visible) return;
        const hover = Math.sin(elapsed * 3.0 + i * 0.9) * 0.025;
        const goal = new THREE.Vector3(
          card.targetPos.x,
          card.targetPos.y + hover,
          card.targetPos.z
        );
        card.mesh.position.lerp(goal, 0.14);
        const curScale = THREE.MathUtils.lerp(card.mesh.scale.x, card.targetScale, 0.14);
        card.mesh.scale.setScalar(curScale);
      });

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };

    tick();
  }

  dispose(): void {
    this.isDisposed = true;
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.handleResize);
    this.controls.dispose();
    this.woodTexture.dispose();
    this.renderer.dispose();
  }
}
