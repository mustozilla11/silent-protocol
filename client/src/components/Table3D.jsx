import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SUIT_COLORS = [
  0x3b82f6, // 0: Sen (Klasik Kobalt Takım)
  0x475569, // 1: Arduvaz Gri
  0x15803d, // 2: Orman Yeşili
  0x9a3412, // 3: Bakır Kahve
  0x6d28d9, // 4: Koyu Mor
  0xb45309, // 5: Altın Kehribar
  0x1e3a8a, // 6: Gece Laciverti
];

const SKIN_TONES = [
  0xf1c27d, 0xf3cfb6, 0xe0ac69, 0xd2996c, 0xffdbac, 0xc68642, 0xf1c27d,
];

const SEAT_ANGLES = [
  Math.PI * 0.5,  // 0: Sen (Ön orta - kamera tarafı)
  Math.PI * 0.86, // 1: Sol Ön
  Math.PI * 1.18, // 2: Sol Arka
  Math.PI * 1.5,  // 3: Tam Karşı
  Math.PI * 1.82, // 4: Sağ Arka
  Math.PI * 0.14, // 5: Sağ Ön
  Math.PI * 1.34, // 6: Ek Koltuk Sol-Üst
];

function createCardTexture(kind, sublabel = "") {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 272;
  const ctx = canvas.getContext("2d");

  if (kind === "BLUE") {
    ctx.fillStyle = "#1d4ed8";
    ctx.fillRect(0, 0, 192, 272);
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 172, 252);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.arc(96, 122, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 46px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🛡️", 96, 138);
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("KORUYUCU", 96, 206);
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#dbeafe";
    ctx.fillText("MAVİ YASA", 96, 232);
  } else if (kind === "RED") {
    ctx.fillStyle = "#b91c1c";
    ctx.fillRect(0, 0, 192, 272);
    ctx.strokeStyle = "#fecaca";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 172, 252);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.arc(96, 122, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 46px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🕵️", 96, 138);
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("CASUS", 96, 206);
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#fee2e2";
    ctx.fillText("KIRMIZI YASA", 96, 232);
  } else if (kind === "BACK") {
    ctx.fillStyle = "#451a03";
    ctx.fillRect(0, 0, 192, 272);
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 172, 252);
    ctx.strokeStyle = "rgba(245,158,11,0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, 148, 228);
    ctx.fillStyle = "#fcd34d";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚖️", 96, 128);
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(sublabel || "GİZLİ YASA", 96, 185);
  } else if (kind === "SLOT_BLUE") {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 192, 272);
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 176, 256);
    ctx.fillStyle = "#93c5fd";
    ctx.font = "bold 38px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(sublabel || "🛡️", 96, 145);
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("MAVİ YUVA", 96, 220);
  } else if (kind === "SLOT_RED") {
    ctx.fillStyle = "#3b1114";
    ctx.fillRect(0, 0, 192, 272);
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 176, 256);
    ctx.fillStyle = "#fca5a5";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(sublabel || "🚨", 96, 142);
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("KIRMIZI YUVA", 96, 220);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export default function Table3D({
  pub,
  view,
  theme,
  cameraMode = "auto",
  selectedTargetId = "",
  onSelectPlayer,
  onSelectCard,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef({ pub, view, theme, cameraMode, selectedTargetId });
  const callbacksRef = useRef({ onSelectPlayer, onSelectCard });
  const [labelPositions, setLabelPositions] = useState([]);

  useEffect(() => {
    stateRef.current = { pub, view, theme, cameraMode, selectedTargetId };
  }, [pub, view, theme, cameraMode, selectedTargetId]);

  useEffect(() => {
    callbacksRef.current = { onSelectPlayer, onSelectCard };
  }, [onSelectPlayer, onSelectCard]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // --- SAHNE, KAMERA, RENDERER ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x221f1d);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 4.45, 5.7);
    const currentLookAt = new THREE.Vector3(0, 0.65, -0.1);
    camera.lookAt(currentLookAt);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // --- AYDINLIK VE NET STÜDYO IŞIKLANDIRMASI (Three.js r186 decay=0!) ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfffbeb, 0x57534e, 1.45);
    scene.add(hemiLight);

    // Ana Üst-Ön Stüdyo Işığı
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.9);
    keyLight.position.set(2.5, 9, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    // Ön Yüz Dolgu Işığı (Karakterlerin yüzleri, gözleri, parmakları net parlasın)
    const fillLight = new THREE.DirectionalLight(0xf8fafc, 1.25);
    fillLight.position.set(-4, 5.5, 6);
    scene.add(fillLight);

    // Arka Kenar Işığı (Silhouette derinliği için)
    const rimLight = new THREE.DirectionalLight(0xfde68a, 0.85);
    rimLight.position.set(0, 5, -7);
    scene.add(rimLight);

    // Masa Sarkıt Işığı (decay = 0 sayesinde mesafe kaybı yapmaz)
    const tableSpot = new THREE.SpotLight(0xfef3c7, 2.2);
    tableSpot.position.set(0, 7.0, 0);
    tableSpot.angle = Math.PI / 2.2;
    tableSpot.penumbra = 0.7;
    tableSpot.decay = 0;
    tableSpot.distance = 30;
    scene.add(tableSpot);

    // --- ZEMİN & ODA PLATFORMU ---
    const floorGeo = new THREE.PlaneGeometry(50, 50);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2b2724,
      roughness: 0.88,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.35;
    floor.receiveShadow = true;
    scene.add(floor);

    // Masa Altı Halı Dairesi
    const rugGeo = new THREE.CylinderGeometry(4.4, 4.4, 0.02, 48);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x3b2f2f,
      roughness: 0.95,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.position.y = -1.34;
    rug.receiveShadow = true;
    scene.add(rug);

    // --- KART DOKULARI ---
    const texBlue = createCardTexture("BLUE");
    const texRed = createCardTexture("RED");
    const texBack = createCardTexture("BACK", "GİZLİ YASA");
    const texDeck = createCardTexture("BACK", "YASA DESTESİ");
    const texDiscard = createCardTexture("BACK", "ISKARTA");
    const texSlotBlue = [1, 2, 3, 4, 5].map((n) =>
      createCardTexture("SLOT_BLUE", String(n))
    );
    const texSlotRed = ["1", "2", "👁️ 3", "💀 4", "💀 5", "👑 6"].map((lbl) =>
      createCardTexture("SLOT_RED", lbl)
    );

    // --- YUVARLAK KONSEY MASASI ---
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    const rimGeo = new THREE.CylinderGeometry(2.72, 2.55, 0.24, 56);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x6b3a22,
      roughness: 0.45,
      metalness: 0.08,
    });
    const tableRim = new THREE.Mesh(rimGeo, rimMat);
    tableRim.position.y = -0.05;
    tableRim.castShadow = true;
    tableRim.receiveShadow = true;
    tableGroup.add(tableRim);

    const feltGeo = new THREE.CylinderGeometry(2.46, 2.46, 0.06, 56);
    const feltMat = new THREE.MeshStandardMaterial({
      color: 0x1d5438,
      roughness: 0.85,
    });
    const tableFelt = new THREE.Mesh(feltGeo, feltMat);
    tableFelt.position.y = 0.06;
    tableFelt.receiveShadow = true;
    tableGroup.add(tableFelt);

    const legGeo = new THREE.CylinderGeometry(0.36, 0.72, 1.4, 24);
    const legMesh = new THREE.Mesh(legGeo, rimMat);
    legMesh.position.y = -0.75;
    tableGroup.add(legMesh);

    // --- MASA ÜSTÜ YASA YUVALARI (5 MAVİ + 6 KIRMIZI) ---
    const blueSlots = [];
    const redSlots = [];
    const slotGeo = new THREE.BoxGeometry(0.36, 0.03, 0.50);

    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshStandardMaterial({
        map: texSlotBlue[i],
        roughness: 0.45,
      });
      const mesh = new THREE.Mesh(slotGeo, mat);
      mesh.position.set((i - 2) * 0.42, 0.095, -0.52);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      tableGroup.add(mesh);
      blueSlots.push({ mesh, mat, activeTex: texBlue, emptyTex: texSlotBlue[i] });
    }

    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshStandardMaterial({
        map: texSlotRed[i],
        roughness: 0.45,
      });
      const mesh = new THREE.Mesh(slotGeo, mat);
      mesh.position.set((i - 2.5) * 0.40, 0.095, 0.08);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      tableGroup.add(mesh);
      redSlots.push({ mesh, mat, activeTex: texRed, emptyTex: texSlotRed[i] });
    }

    // Kaos Göstergesi: 3 Pirinç Pul (Yasa panosunun altında)
    const chaosTokens = [];
    const chaosGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 24);
    for (let i = 0; i < 3; i++) {
      const cMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.35,
        metalness: 0.4,
      });
      const cMesh = new THREE.Mesh(chaosGeo, cMat);
      cMesh.position.set((i - 1) * 0.32, 0.10, 0.52);
      tableGroup.add(cMesh);
      chaosTokens.push({ mesh: cMesh, mat: cMat });
    }

    // Sol: Yasa Destesi (Draw Deck)
    const deckGeo = new THREE.BoxGeometry(0.42, 0.24, 0.58);
    const deckMat = new THREE.MeshStandardMaterial({
      map: texDeck,
      roughness: 0.4,
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.set(-1.55, 0.20, -0.22);
    deckMesh.castShadow = true;
    tableGroup.add(deckMesh);

    // Sağ: Iskarta Yığını (Discard Pile)
    const discardMat = new THREE.MeshStandardMaterial({
      map: texDiscard,
      roughness: 0.5,
    });
    const discardMesh = new THREE.Mesh(deckGeo, discardMat);
    discardMesh.position.set(1.55, 0.12, -0.22);
    discardMesh.castShadow = true;
    tableGroup.add(discardMesh);

    // --- MASA ORTASINDAKİ AKTİF 3D HAREKETLİ KARTLAR (LİDER / ORTAK / PEEK / ENACT) ---
    const activeCardsGroup = new THREE.Group();
    tableGroup.add(activeCardsGroup);

    const activeCards = [];
    const clickableCards = [];
    const activeCardGeo = new THREE.BoxGeometry(0.48, 0.032, 0.68);
    const borderGeo = new THREE.BoxGeometry(0.51, 0.022, 0.71);
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.3,
      metalness: 0.5,
    });

    for (let i = 0; i < 3; i++) {
      const cGroup = new THREE.Group();
      const cMat = new THREE.MeshStandardMaterial({
        map: texBack,
        roughness: 0.35,
      });
      const cMesh = new THREE.Mesh(activeCardGeo, cMat);
      cMesh.castShadow = true;
      cMesh.receiveShadow = true;
      cMesh.userData = { cardIdx: i };
      clickableCards.push(cMesh);
      cGroup.add(cMesh);

      const trimMesh = new THREE.Mesh(borderGeo, goldTrimMat);
      trimMesh.position.y = -0.004;
      cGroup.add(trimMesh);

      cGroup.position.set(-1.55, 0.26, -0.22);
      cGroup.visible = false;
      activeCardsGroup.add(cGroup);
      activeCards.push({
        group: cGroup,
        mesh: cMesh,
        mat: cMat,
        targetPos: new THREE.Vector3(-1.55, 0.26, -0.22),
        targetRotX: 0,
        targetRotY: 0,
      });
    }

    // --- ŞÜPHE / GÜVEN 3D POKER ÇİPLERİ (HER KOLTUĞUN ÖNÜNDE) ---
    const seatChipsGroup = new THREE.Group();
    scene.add(seatChipsGroup);
    const chipPool = [];
    const chipGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.035, 20);
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.3,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(chipGeo, mat);
      mesh.castShadow = true;
      mesh.visible = false;
      seatChipsGroup.add(mesh);
      chipPool.push({ mesh, mat });
    }

    // --- HEDEF İŞARET HALKALARI & PARMAK İŞARET IŞINI (SLİNDRİK BEAM) ---
    const targetRings = [];
    const ringGeo = new THREE.RingGeometry(0.46, 0.58, 32);
    for (let i = 0; i < 4; i++) {
      const rMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
      });
      const ring = new THREE.Mesh(ringGeo, rMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.11;
      ring.visible = false;
      scene.add(ring);
      targetRings.push(ring);
    }

    const pointerBeams = [];
    const beamUnitGeo = new THREE.CylinderGeometry(0.014, 0.022, 1, 8);
    beamUnitGeo.rotateX(Math.PI / 2); // +Z eksenine yasla
    for (let i = 0; i < 7; i++) {
      const bMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.45,
      });
      const beam = new THREE.Mesh(beamUnitGeo, bMat);
      beam.visible = false;
      scene.add(beam);
      pointerBeams.push(beam);
    }

    const placeBeam = (beam, fromPos, toPos) => {
      const dist = fromPos.distanceTo(toPos);
      if (dist < 0.1) {
        beam.visible = false;
        return;
      }
      beam.visible = true;
      beam.position.copy(fromPos).lerp(toPos, 0.5);
      beam.scale.set(1, 1, dist);
      beam.lookAt(toPos);
    };

    // --- SEN (KOLTUK 0) BİRİNCİ ŞAHIS İŞARET EDEN KOL & PARMAK (+Z YÖNLÜ!) ---
    const myArmGroup = new THREE.Group();
    const mySuitMat = new THREE.MeshStandardMaterial({
      color: SUIT_COLORS[0],
      roughness: 0.55,
    });
    const mySkinMat = new THREE.MeshStandardMaterial({
      color: SKIN_TONES[0],
      roughness: 0.45,
    });

    // +Z yönüne doğru uzanan kol ve işaret parmağı (THREE.Group.lookAt +Z'yi hedefler!)
    const myForearmGeo = new THREE.CylinderGeometry(0.08, 0.105, 0.72, 16);
    myForearmGeo.rotateX(Math.PI / 2);
    const myForearm = new THREE.Mesh(myForearmGeo, mySuitMat);
    myForearm.position.set(0, 0, 0.35);
    myForearm.castShadow = true;
    myArmGroup.add(myForearm);

    const myHand = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 16, 16),
      mySkinMat
    );
    myHand.position.set(0, 0, 0.72);
    myArmGroup.add(myHand);

    const myFingerGeo = new THREE.CylinderGeometry(0.026, 0.034, 0.28, 12);
    myFingerGeo.rotateX(Math.PI / 2);
    const myFinger = new THREE.Mesh(myFingerGeo, mySkinMat);
    myFinger.position.set(0, 0.02, 0.90);
    myArmGroup.add(myFinger);

    const myFingerTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 12),
      mySkinMat
    );
    myFingerTip.position.set(0, 0.02, 1.04);
    myArmGroup.add(myFingerTip);

    myArmGroup.position.set(0.68, 1.38, 2.55);
    myArmGroup.visible = false;
    scene.add(myArmGroup);

    // --- 7 KARAKTER MODELİ (+Z YÖNÜ İLERİ / MASAYA BAKAR!) ---
    const characters = [];
    const seatRadius = 3.22;
    const clickableMeshes = [];

    for (let i = 0; i < 7; i++) {
      const charGroup = new THREE.Group();
      scene.add(charGroup);

      // Sandalye arkalığı ARKA TARAFTA (-Z)
      const chairMat = new THREE.MeshStandardMaterial({
        color: 0x451a03,
        roughness: 0.65,
      });
      const chairBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 1.48, 0.14),
        chairMat
      );
      chairBack.position.set(0, 0.62, -0.40);
      chairBack.castShadow = true;
      charGroup.add(chairBack);

      const chairSeat = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.12, 0.78),
        chairMat
      );
      chairSeat.position.set(0, 0.05, -0.05);
      charGroup.add(chairSeat);

      // Gövde (Takım Elbise)
      const bodyMat = new THREE.MeshStandardMaterial({
        color: SUIT_COLORS[i % SUIT_COLORS.length],
        roughness: 0.58,
      });
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.43, 1.15, 22),
        bodyMat
      );
      body.position.y = 0.68;
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData = { seatIdx: i };
      clickableMeshes.push(body);
      charGroup.add(body);

      // Ön Cephede Beyaz Gömlek Yakası & Kravat (+Z!)
      const shirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.48, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
      );
      shirt.position.set(0, 0.96, 0.30);
      charGroup.add(shirt);

      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.42, 0.09),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x991b1b : 0xd97706,
          roughness: 0.5,
        })
      );
      tie.position.set(0, 0.90, 0.32);
      charGroup.add(tie);

      const skinMat = new THREE.MeshStandardMaterial({
        color: SKIN_TONES[i % SKIN_TONES.length],
        roughness: 0.46,
      });

      // Boyun
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.13, 0.25, 14),
        skinMat
      );
      neck.position.y = 1.33;
      charGroup.add(neck);

      // Kafa Grubu (Ön yüz +Z yönünde!)
      const headGroup = new THREE.Group();
      headGroup.position.y = 1.62;
      charGroup.add(headGroup);

      const headMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.33, 24, 24),
        skinMat
      );
      headMesh.castShadow = true;
      headMesh.userData = { seatIdx: i };
      clickableMeshes.push(headMesh);
      headGroup.add(headMesh);

      // Burun (+Z = Ön)
      const nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 10, 10),
        skinMat
      );
      nose.position.set(0, -0.01, 0.32);
      headGroup.add(nose);

      // Gözler (+Z = Ön)
      const eyeWhiteGeo = new THREE.SphereGeometry(0.066, 12, 12);
      const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pupilGeo = new THREE.SphereGeometry(0.036, 10, 10);
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x09090b });

      const leftEye = new THREE.Group();
      leftEye.position.set(0.115, 0.06, 0.28);
      const leW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      const leP = new THREE.Mesh(pupilGeo, pupilMat);
      leP.position.z = 0.048;
      leftEye.add(leW);
      leftEye.add(leP);
      headGroup.add(leftEye);

      const rightEye = new THREE.Group();
      rightEye.position.set(-0.115, 0.06, 0.28);
      const reW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      const reP = new THREE.Mesh(pupilGeo, pupilMat);
      reP.position.z = 0.048;
      rightEye.add(reW);
      rightEye.add(reP);
      headGroup.add(rightEye);

      // Kaşlar (Mimikler için!)
      const browMat = new THREE.MeshStandardMaterial({ color: 0x18181b });
      const leftBrow = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.026, 0.03),
        browMat
      );
      leftBrow.position.set(0.115, 0.14, 0.30);
      headGroup.add(leftBrow);

      const rightBrow = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.026, 0.03),
        browMat
      );
      rightBrow.position.set(-0.115, 0.14, 0.30);
      headGroup.add(rightBrow);

      // Ağız (+Z = Ön)
      const mouth = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.025, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x450a0a })
      );
      mouth.position.set(0, -0.13, 0.30);
      headGroup.add(mouth);

      // Şapka / Saç Aksesuarı
      const hatMat = new THREE.MeshStandardMaterial({
        color: i === 2 ? 0x92400e : i === 4 ? 0x1e293b : 0x27272a,
        roughness: 0.7,
      });
      if (i % 2 === 1) {
        const brim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.46, 0.46, 0.04, 24),
          hatMat
        );
        brim.position.y = 0.24;
        const top = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.3, 0.24, 24),
          hatMat
        );
        top.position.y = 0.36;
        headGroup.add(brim);
        headGroup.add(top);
      } else {
        const hair = new THREE.Mesh(
          new THREE.SphereGeometry(
            0.345,
            18,
            18,
            0,
            Math.PI * 2,
            0,
            Math.PI * 0.56
          ),
          hatMat
        );
        hair.rotation.x = -0.25; // Arkaya yatır
        headGroup.add(hair);
      }

      // Sol Kol (+X tarafı, dinlenme pozisyonu)
      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(0.40, 1.12, 0);
      const leftArmMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.095, 0.56, 12),
        bodyMat
      );
      leftArmMesh.rotation.x = -0.55;
      leftArmMesh.position.set(0.02, -0.22, 0.14);
      const leftHandMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 12, 12),
        skinMat
      );
      leftHandMesh.position.set(0.02, -0.44, 0.29);
      leftArmGroup.add(leftArmMesh);
      leftArmGroup.add(leftHandMesh);
      charGroup.add(leftArmGroup);

      // Sağ Kol + El + UZANAN İŞARET PARMAĞI (-X omzu, +Z YÖNLÜ!)
      const rightArmPivot = new THREE.Group();
      rightArmPivot.position.set(-0.40, 1.12, 0);
      rightArmPivot.rotation.order = "YXZ";
      charGroup.add(rightArmPivot);

      const armSleeveGeo = new THREE.CylinderGeometry(0.078, 0.098, 0.58, 14);
      armSleeveGeo.rotateX(Math.PI / 2);
      const armSleeve = new THREE.Mesh(armSleeveGeo, bodyMat);
      armSleeve.position.set(0, 0, 0.29);
      armSleeve.castShadow = true;
      rightArmPivot.add(armSleeve);

      const handMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.092, 14, 14),
        skinMat
      );
      handMesh.position.set(0, 0, 0.60);
      rightArmPivot.add(handMesh);

      const fingerGeo = new THREE.CylinderGeometry(0.026, 0.034, 0.26, 12);
      fingerGeo.rotateX(Math.PI / 2);
      const fingerMesh = new THREE.Mesh(fingerGeo, skinMat);
      fingerMesh.position.set(0, 0.02, 0.77);
      rightArmPivot.add(fingerMesh);

      const fingerTipMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 12, 12),
        skinMat
      );
      fingerTipMesh.position.set(0, 0.02, 0.90);
      rightArmPivot.add(fingerTipMesh);

      // Oy Kartı Masanın Üstünde Karakterin Önünde (+Z = 1.05!)
      const voteMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.35,
      });
      const votePlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.40, 0.035, 0.28),
        voteMat
      );
      votePlate.position.set(0, 0.11, 1.12);
      votePlate.castShadow = true;
      charGroup.add(votePlate);

      characters.push({
        group: charGroup,
        body,
        headGroup,
        leftEye,
        rightEye,
        leftBrow,
        rightBrow,
        mouth,
        rightArmPivot,
        fingerTipMesh,
        votePlate,
        voteMat,
      });
    }

    // --- FARE & 3D TIKLAMA (KARAKTER VE KART RAYCASTER) ---
    let mouseX = 0;
    let mouseY = 0;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    const onClickScene = (e) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);

      // 1. Önce masadaki aktif 3D kartlara tıklandı mı kontrol et
      const visibleCards = clickableCards.filter((c) => c.parent?.visible);
      if (visibleCards.length > 0) {
        const cardHits = raycaster.intersectObjects(visibleCards, false);
        if (cardHits.length > 0) {
          const cardIdx = cardHits[0].object.userData?.cardIdx;
          if (cardIdx !== undefined && callbacksRef.current.onSelectCard) {
            callbacksRef.current.onSelectCard(cardIdx);
            return;
          }
        }
      }

      // 2. Karakterlere tıklandı mı kontrol et
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitSeat = hits[0].object.userData?.seatIdx;
        if (hitSeat !== undefined) {
          const { pub: cPub, view: cView } = stateRef.current;
          const allP = cPub.players || [];
          const mIdx = allP.findIndex((p) => p.id === cView.your_id);
          const ord =
            mIdx >= 0
              ? [...allP.slice(mIdx), ...allP.slice(0, mIdx)]
              : allP;
          const clickedPlayer = ord[hitSeat];
          if (clickedPlayer && callbacksRef.current.onSelectPlayer) {
            callbacksRef.current.onSelectPlayer(clickedPlayer.id);
          }
        }
      }
    };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("click", onClickScene);

    // --- ANİMASYON DÖNGÜSÜ ---
    let animId;
    const clock = new THREE.Clock();
    let frameCount = 0;

    const getSeatWorldPos = (seatIdx) => {
      const angle = SEAT_ANGLES[seatIdx] ?? (seatIdx / 7) * Math.PI * 2;
      return new THREE.Vector3(
        Math.cos(angle) * seatRadius,
        0,
        Math.sin(angle) * seatRadius
      );
    };

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const {
        pub: curPub,
        view: curView,
        theme: curTheme,
        cameraMode: curCamMode,
      } = stateRef.current;

      // Siyah vs Beyaz Tema Ortam Renkleri & Aydınlatma
      const isDark = curTheme === "dark";
      scene.background.lerp(new THREE.Color(isDark ? 0x221f1d : 0xe5e7eb), 0.1);
      floorMat.color.lerp(new THREE.Color(isDark ? 0x2b2724 : 0xd4d4d8), 0.1);
      rugMat.color.lerp(new THREE.Color(isDark ? 0x3b2f2f : 0xc4b5a5), 0.1);
      feltMat.color.lerp(new THREE.Color(isDark ? 0x1d5438 : 0x2f6f4e), 0.1);
      ambientLight.intensity = THREE.MathUtils.lerp(
        ambientLight.intensity,
        isDark ? 0.9 : 1.35,
        0.1
      );

      // Sen (Seat 0) sola veya sağa bakıyorsa kamerayı hafifçe o tarafa kaydır
      const allP = curPub.players || [];
      const mIdx = allP.findIndex((p) => p.id === curView.your_id);
      const ord =
        mIdx >= 0 ? [...allP.slice(mIdx), ...allP.slice(0, mIdx)] : allP;
      const mePlayer = ord[0];

      let glancePanX = 0;
      if (mePlayer?.expression === "look_left") glancePanX = -1.25;
      if (mePlayer?.expression === "look_right") glancePanX = 1.25;

      // Dinamik Kamera (Kart aşamalarında masaya odaklanır!)
      const isCardPhase =
        curPub.phase === "LEGISLATE_LEADER" ||
        curPub.phase === "LEGISLATE_PARTNER" ||
        curPub.phase === "POWERS_PEEK";
      const isClaimMidPhase = curPub.phase === "CLAIMING";

      let desiredCamPos;
      let desiredLookAt;
      const hudShiftX = container.clientWidth >= 768 ? 0.55 : 0;

      if (curCamMode === "table" || (curCamMode === "auto" && isCardPhase)) {
        desiredCamPos = new THREE.Vector3(
          hudShiftX * 0.45 + mouseX * 0.2 + glancePanX * 0.5,
          3.65 - mouseY * 0.12,
          2.65
        );
        desiredLookAt = new THREE.Vector3(
          hudShiftX * 0.45 + glancePanX * 0.4,
          0.16,
          0.08
        );
      } else if (curCamMode === "auto" && isClaimMidPhase) {
        desiredCamPos = new THREE.Vector3(
          hudShiftX * 0.7 + mouseX * 0.28 + glancePanX,
          4.25 - mouseY * 0.15,
          4.25
        );
        desiredLookAt = new THREE.Vector3(
          hudShiftX * 0.7 + glancePanX * 0.6,
          0.38,
          -0.05
        );
      } else {
        desiredCamPos = new THREE.Vector3(
          hudShiftX + mouseX * 0.42 + glancePanX,
          4.95 - mouseY * 0.2,
          6.45
        );
        desiredLookAt = new THREE.Vector3(
          hudShiftX + glancePanX * 0.7,
          0.72,
          -0.12
        );
      }

      camera.position.lerp(desiredCamPos, 0.06);
      currentLookAt.lerp(desiredLookAt, 0.07);
      camera.lookAt(currentLookAt);

      // Yasa Yuvaları (Mavi 1..5 ve Kırmızı 1..6)
      blueSlots.forEach((slot, idx) => {
        const active = idx < (curPub.blue_policies || 0);
        const targetMap = active ? slot.activeTex : slot.emptyTex;
        if (slot.mat.map !== targetMap) {
          slot.mat.map = targetMap;
          slot.mat.needsUpdate = true;
        }
        slot.mesh.position.y = active ? 0.125 : 0.095;
      });

      redSlots.forEach((slot, idx) => {
        const active = idx < (curPub.red_policies || 0);
        const targetMap = active ? slot.activeTex : slot.emptyTex;
        if (slot.mat.map !== targetMap) {
          slot.mat.map = targetMap;
          slot.mat.needsUpdate = true;
        }
        slot.mesh.position.y = active ? 0.125 : 0.095;
      });

      // Kaos Pulları (0..3)
      chaosTokens.forEach((tok, idx) => {
        const lit = idx < (curPub.chaos_counter || 0);
        tok.mat.color.lerp(new THREE.Color(lit ? 0xef4444 : 0x78716c), 0.15);
        tok.mat.emissive.lerp(new THREE.Color(lit ? 0x991b1b : 0x000000), 0.15);
      });

      // Deste & Iskarta Yığınları
      const dScale = Math.max(0.15, (curPub.deck_count || 0) / 17);
      deckMesh.scale.y = dScale;
      deckMesh.position.y = 0.09 + 0.12 * dScale;

      const discScale = Math.max(0.08, (curPub.discard_count || 0) / 17);
      discardMesh.scale.y = discScale;
      discardMesh.position.y = 0.09 + 0.12 * discScale;
      discardMesh.visible = (curPub.discard_count || 0) > 0;

      const findSeatIndexById = (pid) => ord.findIndex((p) => p.id === pid);
      const leaderSeatIdx = findSeatIndexById(curPub.leader_id);
      const partnerSeatIdx = findSeatIndexById(curPub.partner_id);

      // --- MASADAKİ AKTİF HAREKETLİ 3D KARTLAR ---
      const applyCardFace = (cardObj, policyVal) => {
        const targetTex =
          policyVal === "BLUE"
            ? texBlue
            : policyVal === "RED"
            ? texRed
            : texBack;
        if (cardObj.mat.map !== targetTex) {
          cardObj.mat.map = targetTex;
          cardObj.mat.needsUpdate = true;
        }
      };

      if (curPub.phase === "LEGISLATE_LEADER") {
        const myCards = curView.drawn_policies || [];
        const isMeLeader = curPub.leader_id === curView.your_id;
        const leaderPos =
          leaderSeatIdx >= 0
            ? getSeatWorldPos(leaderSeatIdx)
            : new THREE.Vector3(0, 0, 2);

        for (let i = 0; i < 3; i++) {
          const ac = activeCards[i];
          ac.group.visible = true;
          if (isMeLeader) {
            ac.targetPos.set((i - 1) * 0.62, 0.36 + Math.sin(t * 3 + i) * 0.015, 0.58);
            ac.targetRotX = 0.45;
            ac.targetRotY = 0;
            applyCardFace(ac, myCards[i]);
          } else {
            const dir = leaderPos.clone().normalize();
            const perp = new THREE.Vector3(-dir.z, 0, dir.x);
            ac.targetPos
              .copy(dir.multiplyScalar(1.05))
              .add(perp.multiplyScalar((i - 1) * 0.52));
            ac.targetPos.y = 0.25 + Math.sin(t * 3 + i) * 0.015;
            ac.targetRotX = 0;
            ac.targetRotY = Math.atan2(leaderPos.x, leaderPos.z);
            applyCardFace(ac, null);
          }
        }
      } else if (curPub.phase === "LEGISLATE_PARTNER") {
        const myCards = curView.drawn_policies || [];
        const isMePartner = curPub.partner_id === curView.your_id;
        const partnerPos =
          partnerSeatIdx >= 0
            ? getSeatWorldPos(partnerSeatIdx)
            : new THREE.Vector3(0, 0, 2);

        for (let i = 0; i < 3; i++) {
          const ac = activeCards[i];
          if (i < 2) {
            ac.group.visible = true;
            if (isMePartner) {
              ac.targetPos.set((i - 0.5) * 0.68, 0.38 + Math.sin(t * 3 + i) * 0.015, 0.62);
              ac.targetRotX = 0.45;
              ac.targetRotY = 0;
              applyCardFace(ac, myCards[i]);
            } else {
              const dir = partnerPos.clone().normalize();
              const perp = new THREE.Vector3(-dir.z, 0, dir.x);
              ac.targetPos
                .copy(dir.multiplyScalar(1.05))
                .add(perp.multiplyScalar((i - 0.5) * 0.55));
              ac.targetPos.y = 0.25 + Math.sin(t * 3 + i) * 0.015;
              ac.targetRotX = 0;
              ac.targetRotY = Math.atan2(partnerPos.x, partnerPos.z);
              applyCardFace(ac, null);
            }
          } else {
            ac.group.visible = true;
            ac.targetPos.set(1.55, 0.20, -0.22);
            ac.targetRotX = 0;
            ac.targetRotY = 0.2;
            applyCardFace(ac, null);
          }
        }
      } else if (curPub.phase === "POWERS_PEEK") {
        const peekCards = curView.peeked_policies || [];
        const isMeLeader = curPub.leader_id === curView.your_id;
        for (let i = 0; i < 3; i++) {
          const ac = activeCards[i];
          ac.group.visible = true;
          ac.targetPos.set((i - 1) * 0.60, 0.40 + Math.sin(t * 3 + i) * 0.015, 0.35);
          ac.targetRotX = isMeLeader ? 0.42 : 0;
          ac.targetRotY = 0;
          applyCardFace(ac, isMeLeader ? peekCards[i] : null);
        }
      } else if (curPub.phase === "CLAIMING" && curPub.current_claim) {
        const enacted = curPub.current_claim.partner_enacted;
        activeCards[0].group.visible = true;
        activeCards[0].targetPos.set(0, 0.44 + Math.sin(t * 4) * 0.02, 0.25);
        activeCards[0].targetRotX = 0.35;
        activeCards[0].targetRotY = Math.sin(t * 1.6) * 0.12;
        applyCardFace(activeCards[0], enacted);
        activeCards[1].group.visible = false;
        activeCards[2].group.visible = false;
      } else {
        for (let i = 0; i < 3; i++) {
          activeCards[i].group.visible = false;
          activeCards[i].targetPos.set(-1.55, 0.22, -0.22);
        }
      }

      activeCards.forEach((ac) => {
        ac.group.position.lerp(ac.targetPos, 0.12);
        ac.group.rotation.x = THREE.MathUtils.lerp(
          ac.group.rotation.x,
          ac.targetRotX,
          0.12
        );
        ac.group.rotation.y = THREE.MathUtils.lerp(
          ac.group.rotation.y,
          ac.targetRotY,
          0.12
        );
      });

      // --- 3D ŞÜPHE VE GÜVEN ÇİPLERİ (MASADAKİ KOLTUKLARIN ÖNÜNDE) ---
      let chipCursor = 0;
      const mySusp = curPub.suspicions?.[curView.your_id] || {};
      ord.forEach((pl, seatIdx) => {
        if (!pl) return;
        const pos = getSeatWorldPos(seatIdx);
        const inward = pos.clone().negate().normalize();
        const perp = new THREE.Vector3(-inward.z, 0, inward.x);

        // Hem oyuncunun koyduğu çipleri hem botların o kişiye koyduğu çipleri say
        let redCount = 0;
        let greenCount = 0;
        Object.values(curPub.suspicions || {}).forEach((targetMap) => {
          const mark = targetMap?.[pl.id];
          if (mark === "SUSPECT" || mark === "SUSPICIOUS") redCount++;
          if (mark === "TRUSTED") greenCount++;
        });

        const totalShown = Math.min(3, redCount) + Math.min(3, greenCount);
        const myMark = mySusp[pl.id];
        if (myMark && totalShown === 0) {
          if (myMark === "SUSPECT") redCount = 1;
          else greenCount = 1;
        }

        const spawnChip = (isRed, stackIdx, offsetSign) => {
          if (chipCursor >= chipPool.length) return;
          const chip = chipPool[chipCursor++];
          chip.mesh.visible = true;
          chip.mat.color.setHex(isRed ? 0xdc2626 : 0x10b981);
          const chipPos = pos
            .clone()
            .add(inward.clone().multiplyScalar(1.38))
            .add(perp.clone().multiplyScalar(0.32 * offsetSign));
          chipPos.y = 0.11 + stackIdx * 0.04;
          chip.mesh.position.copy(chipPos);
        };

        for (let r = 0; r < Math.min(3, redCount); r++) spawnChip(true, r, -1);
        for (let g = 0; g < Math.min(3, greenCount); g++) spawnChip(false, g, 1);
      });
      for (let k = chipCursor; k < chipPool.length; k++) {
        chipPool[k].mesh.visible = false;
      }

      // --- KARAKTERLER, MİMİKLER VE GERÇEK +Z PARMAKLA İŞARET ETME ---
      const newLabels = [];
      const pointedSeats = new Set();

      // Birinci şahıs (Sen - Koltuk 0) parmakla işaret kontrolü
      if (mePlayer && mePlayer.expression === "pointing" && mePlayer.target_id) {
        const tSeat = findSeatIndexById(mePlayer.target_id);
        if (tSeat > 0) {
          pointedSeats.add(tSeat);
          const tWorld = getSeatWorldPos(tSeat);
          tWorld.y = 1.32;
          myArmGroup.visible = true;
          myArmGroup.lookAt(tWorld);
          myArmGroup.updateMatrixWorld(true);

          if (pointerBeams[0]) {
            const tipWorld = new THREE.Vector3();
            myFingerTip.getWorldPosition(tipWorld);
            placeBeam(pointerBeams[0], tipWorld, tWorld);
          }
        } else {
          myArmGroup.visible = false;
          if (pointerBeams[0]) pointerBeams[0].visible = false;
        }
      } else {
        myArmGroup.visible = false;
        if (pointerBeams[0]) pointerBeams[0].visible = false;
      }

      characters.forEach((char, i) => {
        const pState = ord[i];
        const pBeam = pointerBeams[i];
        if (!pState) {
          char.group.visible = false;
          if (i > 0 && pBeam) pBeam.visible = false;
          return;
        }

        // Koltuk 0 ("Sen") birinci şahıs kol ile temsil edilir, gövdesi gizlenir
        if (i === 0) {
          char.group.visible = false;
          return;
        }

        char.group.visible = true;
        const seatPos = getSeatWorldPos(i);
        char.group.position.copy(seatPos);
        char.group.lookAt(0, 0, 0); // +Z masanın merkezine (0,0,0) bakar!
        char.group.updateMatrixWorld(true);

        if (!pState.is_alive) {
          char.group.rotation.x = -0.5;
          char.body.material.opacity = 0.4;
          char.body.material.transparent = true;
          if (pBeam) pBeam.visible = false;
        } else {
          char.body.material.opacity = 1;
          char.body.position.y = 0.68 + Math.sin(t * 2.1 + i) * 0.015;
          char.headGroup.position.y = 1.62 + Math.sin(t * 2.1 + i) * 0.018;
        }

        // Mimik, Kafa/Kaş/Ağız ve Kol Animasyonu (+Z İleri!)
        const expr = pState.expression || "neutral";
        let desiredHeadY = 0;
        let desiredHeadX = 0;
        let eyeOffsetX = 0;
        let desiredArmX = 0.98;
        let desiredArmY = 0;
        let showPointerBeam = false;
        let browY = 0.14;
        let browTilt = 0;
        let mouthScaleX = 1;
        let mouthScaleY = 1;
        let destPointWorld = null;

        if (expr === "look_left") {
          desiredHeadY = 0.65;
          eyeOffsetX = 0.032;
        } else if (expr === "look_right") {
          desiredHeadY = -0.65;
          eyeOffsetX = -0.032;
        } else if (expr === "thinking") {
          desiredHeadX = 0.18;
          desiredHeadY = Math.sin(t * 1.5 + i) * 0.25;
          desiredArmX = -0.55;
          desiredArmY = 0.45;
          browTilt = 0.25;
        } else if (expr === "surprised") {
          desiredHeadX = -0.14;
          browY = 0.185;
          char.leftEye.scale.setScalar(1.42);
          char.rightEye.scale.setScalar(1.42);
          mouthScaleX = 0.7;
          mouthScaleY = 2.6;
          desiredArmX = 0.25;
        } else if (expr === "eureka") {
          desiredHeadX = -0.10;
          desiredHeadY = Math.sin(t * 5) * 0.12;
          browY = 0.175;
          mouthScaleX = 1.45;
          desiredArmX = -1.15;
          desiredArmY = 0.15;
        } else if (expr === "pointing") {
          const targetSeatIdx = findSeatIndexById(pState.target_id);
          const effectiveSeatIdx =
            targetSeatIdx >= 0 ? targetSeatIdx : (i + 2) % ord.length;
          if (effectiveSeatIdx > 0) {
            pointedSeats.add(effectiveSeatIdx);
          }

          destPointWorld = getSeatWorldPos(effectiveSeatIdx);
          destPointWorld.y = 1.25;
          const localTarget = destPointWorld.clone();
          char.group.worldToLocal(localTarget);

          const headYaw = Math.atan2(localTarget.x, localTarget.z);
          desiredHeadY = THREE.MathUtils.clamp(headYaw, -1.35, 1.35);
          desiredHeadX = 0.04;

          const dx = localTarget.x - -0.40;
          const dy = localTarget.y - 1.12;
          const dz = localTarget.z;
          const horiz = Math.hypot(dx, dz) || 1;

          desiredArmY = Math.atan2(dx, dz);
          desiredArmX = -Math.atan2(dy, horiz) + Math.sin(t * 6) * 0.04;
          showPointerBeam = true;
        } else {
          const focusId = curPub.partner_id || curPub.leader_id;
          const focusIdx = findSeatIndexById(focusId);
          if (focusIdx >= 0 && focusIdx !== i) {
            const localFocus = getSeatWorldPos(focusIdx);
            char.group.worldToLocal(localFocus);
            const yaw = Math.atan2(localFocus.x, localFocus.z);
            desiredHeadY = THREE.MathUtils.clamp(yaw * 0.42, -0.5, 0.5);
          } else {
            desiredHeadY = Math.sin(t * 0.7 + i * 2) * 0.14;
          }
          if (isCardPhase) {
            desiredHeadX = 0.24;
          }
        }

        if (expr !== "surprised") {
          char.leftEye.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
          char.rightEye.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
        }

        char.headGroup.rotation.y = THREE.MathUtils.lerp(
          char.headGroup.rotation.y,
          desiredHeadY,
          0.12
        );
        char.headGroup.rotation.x = THREE.MathUtils.lerp(
          char.headGroup.rotation.x,
          desiredHeadX,
          0.12
        );
        char.leftEye.position.x = THREE.MathUtils.lerp(
          char.leftEye.position.x,
          0.115 + eyeOffsetX,
          0.15
        );
        char.rightEye.position.x = THREE.MathUtils.lerp(
          char.rightEye.position.x,
          -0.115 + eyeOffsetX,
          0.15
        );
        char.leftBrow.position.y = THREE.MathUtils.lerp(
          char.leftBrow.position.y,
          browY,
          0.15
        );
        char.rightBrow.position.y = THREE.MathUtils.lerp(
          char.rightBrow.position.y,
          browY,
          0.15
        );
        char.leftBrow.rotation.z = THREE.MathUtils.lerp(
          char.leftBrow.rotation.z,
          browTilt,
          0.15
        );
        char.rightBrow.rotation.z = THREE.MathUtils.lerp(
          char.rightBrow.rotation.z,
          -browTilt,
          0.15
        );
        char.mouth.scale.lerp(new THREE.Vector3(mouthScaleX, mouthScaleY, 1), 0.15);

        char.rightArmPivot.rotation.y = THREE.MathUtils.lerp(
          char.rightArmPivot.rotation.y,
          desiredArmY,
          0.18
        );
        char.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
          char.rightArmPivot.rotation.x,
          desiredArmX,
          0.18
        );
        char.rightArmPivot.updateMatrixWorld(true);

        if (showPointerBeam && pBeam && destPointWorld) {
          const tipWorld = new THREE.Vector3();
          char.fingerTipMesh.getWorldPosition(tipWorld);
          placeBeam(pBeam, tipWorld, destPointWorld);
        } else if (pBeam) {
          pBeam.visible = false;
        }

        // Oy Kartı (Masanın üstünde)
        const vote = curPub.votes?.[pState.id];
        if (vote === "YES") {
          char.voteMat.color.setHex(0x10b981);
          char.votePlate.visible = true;
        } else if (vote === "NO") {
          char.voteMat.color.setHex(0xef4444);
          char.votePlate.visible = true;
        } else if (vote === "VOTED") {
          char.voteMat.color.setHex(0xf59e0b);
          char.votePlate.visible = true;
        } else {
          char.votePlate.visible = false;
        }

        // 2D İsim ve Konuşma Balonu Konumu
        const headWorldPos = new THREE.Vector3();
        char.headGroup.getWorldPosition(headWorldPos);
        headWorldPos.y += 0.60;
        headWorldPos.project(camera);

        const sx = (headWorldPos.x * 0.5 + 0.5) * container.clientWidth;
        const sy = (-(headWorldPos.y * 0.5) + 0.5) * container.clientHeight;

        const targetPlayerObj = pState.target_id
          ? allP.find((x) => x.id === pState.target_id)
          : null;

        newLabels.push({
          id: pState.id,
          name: pState.name,
          isAlive: pState.is_alive,
          bubble: pState.bubble,
          expression: pState.expression,
          targetId: pState.target_id,
          targetName: targetPlayerObj ? targetPlayerObj.name : "",
          isLeader: pState.id === curPub.leader_id,
          isPartner: pState.id === curPub.partner_id,
          vote,
          x: sx,
          y: sy,
        });
      });

      // Hedef Vurgu Halkaları
      const pointedArr = Array.from(pointedSeats);
      targetRings.forEach((ring, idx) => {
        if (idx < pointedArr.length) {
          const seatPos = getSeatWorldPos(pointedArr[idx]);
          ring.visible = true;
          ring.position.set(seatPos.x, 0.11, seatPos.z);
          ring.scale.setScalar(1 + Math.sin(t * 6 + idx) * 0.08);
        } else {
          ring.visible = false;
        }
      });

      frameCount++;
      if (frameCount % 3 === 0) {
        setLabelPositions(newLabels);
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("click", onClickScene);
      renderer.dispose();
    };
  }, []);

  const mySuspicions = pub.suspicions?.[view.your_id] || {};
  const isCardPhase =
    pub.phase === "LEGISLATE_LEADER" ||
    pub.phase === "LEGISLATE_PARTNER" ||
    pub.phase === "POWERS_PEEK";
  const focusTable =
    cameraMode === "table" || (cameraMode === "auto" && isCardPhase);
  const isDark = theme === "dark";

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none ${
        isDark ? "bg-[#221f1d]" : "bg-[#e5e7eb]"
      }`}
    >
      {/* Three.js Tam Ekran Tuvali */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-pointer"
      />

      {/* 3D Karakterlerin Üstündeki Konuşma Balonları, Parmak Vurgusu & İsim Etiketleri */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {labelPositions.map((lbl) => {
          const chip = mySuspicions[lbl.id];
          const isKnownAlly = view.known_allies?.includes(lbl.id);
          const isSecretLeader = view.secret_leader_id === lbl.id;
          const isSelectedTarget = selectedTargetId === lbl.id;
          const pointingAtYou =
            lbl.expression === "pointing" && lbl.targetId === view.your_id;

          return (
            <div
              key={lbl.id}
              style={{
                transform: `translate3d(${lbl.x}px, ${lbl.y}px, 0) translate(-50%, -100%)`,
              }}
              className="absolute top-0 left-0 flex flex-col items-center transition-transform duration-75"
            >
              {/* Parmakla İşaret Etme Vurgusu */}
              {lbl.expression === "pointing" &&
                lbl.targetName &&
                lbl.isAlive && (
                  <div className="mb-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black shadow-lg border border-amber-200 whitespace-nowrap animate-bounce">
                    {pointingAtYou
                      ? "🫵 SENİ işaret ediyor!"
                      : `🫵 ${lbl.targetName} kişisini işaret ediyor!`}
                  </div>
                )}

              {/* Konuşma / Mimik Balonu */}
              {lbl.bubble && lbl.isAlive && (
                <div className="mb-1.5 px-3 py-1 rounded-xl bg-white text-black text-xs font-black shadow-lg border-2 border-neutral-900 whitespace-nowrap">
                  {lbl.bubble}
                </div>
              )}

              {/* Rol Rozetleri */}
              <div className="flex gap-1 mb-1">
                {lbl.isLeader && (
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-black text-[10px] uppercase shadow">
                    ★ LİDER
                  </span>
                )}
                {lbl.isPartner && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500 text-black font-black text-[10px] uppercase shadow">
                    ♦ ORTAK
                  </span>
                )}
              </div>

              {/* İsim Plakası (Tıklanabilir -> Direkt Parmakla İşaret Et) */}
              <button
                type="button"
                onClick={() => onSelectPlayer && onSelectPlayer(lbl.id)}
                className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg backdrop-blur-md border text-xs font-bold shadow-md transition hover:scale-105 cursor-pointer ${
                  isDark
                    ? "bg-neutral-950/90 text-white"
                    : "bg-white/95 text-neutral-900"
                } ${
                  !lbl.isAlive
                    ? "opacity-40 line-through border-neutral-500/30"
                    : isSelectedTarget
                    ? "border-amber-500 ring-2 ring-amber-500/50"
                    : isDark
                    ? "border-white/20 hover:border-amber-400"
                    : "border-neutral-400 hover:border-amber-600"
                }`}
                title={`${lbl.name} oyuncusunu parmağınla işaret et`}
              >
                <span>{lbl.name}</span>
                {chip === "SUSPECT" && <span title="Şüpheli Çipi">🔴</span>}
                {chip === "TRUSTED" && <span title="Güvenilir Çipi">🟢</span>}
                {isSecretLeader && (
                  <span className="text-[9px] px-1 rounded bg-purple-600 text-white">
                    G.LİDER
                  </span>
                )}
                {isKnownAlly && (
                  <span className="text-[9px] px-1 rounded bg-red-600 text-white">
                    CASUS
                  </span>
                )}
              </button>

              {/* Açılan Oy */}
              {lbl.vote && lbl.vote !== "VOTED" && (
                <span
                  className={`mt-1 px-2 py-0.5 rounded text-[10px] font-black shadow ${
                    lbl.vote === "YES"
                      ? "bg-emerald-600 text-white"
                      : "bg-red-600 text-white"
                  }`}
                >
                  {lbl.vote === "YES" ? "EVET (JA)" : "HAYIR (NEIN)"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
