import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SUIT_COLORS = [
  0x334155, // Sen - Koyu Arduvaz
  0x57534e, // Kuzey - Sıcak Gri
  0x3f6212, // Defne - Koyu Zeytin
  0x7c2d12, // Kaan - Kiremit
  0x4c1d95, // Bora - Koyu Mor
  0x78350f, // Zeynep - Kehribar
  0x1e293b, // Arda - Gece Laciverti
];

const SKIN_TONES = [
  0xf1c27d, 0xe0ac69, 0xffdbac, 0xc68642, 0xf1c27d, 0xe0ac69, 0xd2996c,
];

const SEAT_ANGLES = [
  Math.PI * 0.5,  // 0: Sen (Alt orta - kamera tarafı)
  Math.PI * 0.88, // 1: Sol Alt
  Math.PI * 1.18, // 2: Sol Üst
  Math.PI * 1.5,  // 3: Tam Karşı (Üst Orta)
  Math.PI * 1.82, // 4: Sağ Üst
  Math.PI * 0.12, // 5: Sağ Alt
];

export default function Table3D({
  pub,
  view,
  theme,
  phaseTimer,
  cameraMode = "auto",
  selectedTargetId = "",
  onSelectPlayer,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef({ pub, view, theme, cameraMode, selectedTargetId });
  const onSelectPlayerRef = useRef(onSelectPlayer);
  const [labelPositions, setLabelPositions] = useState([]);

  useEffect(() => {
    stateRef.current = { pub, view, theme, cameraMode, selectedTargetId };
  }, [pub, view, theme, cameraMode, selectedTargetId]);

  useEffect(() => {
    onSelectPlayerRef.current = onSelectPlayer;
  }, [onSelectPlayer]);

  // Oyuncuları "Sen" her zaman 0. koltukta olacak şekilde diz
  const players = pub.players || [];
  const myIdx = players.findIndex((p) => p.id === view.your_id);
  const orderedPlayers =
    myIdx >= 0
      ? [...players.slice(myIdx), ...players.slice(0, myIdx)]
      : players;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // --- SAHNE, KAMERA, RENDERER ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0b0a);
    scene.fog = new THREE.FogExp2(0x0c0b0a, 0.042);

    const camera = new THREE.PerspectiveCamera(
      44,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 4.6, 5.9);
    const currentLookAt = new THREE.Vector3(0, 0.65, -0.2);
    camera.lookAt(currentLookAt);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // --- IŞIKLANDIRMA ---
    const ambientLight = new THREE.AmbientLight(0xffedd5, 0.58);
    scene.add(ambientLight);

    // Masa üstü ana sarkıt lamba
    const spotLight = new THREE.SpotLight(0xfef08a, 3.0);
    spotLight.position.set(0, 7.2, 0);
    spotLight.angle = Math.PI / 2.6;
    spotLight.penumbra = 0.65;
    spotLight.decay = 1.1;
    spotLight.distance = 22;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    scene.add(spotLight);

    // Masa ortası kart aydınlatması (kart fazlarında güçlenir)
    const tableCardLight = new THREE.PointLight(0xfef08a, 0.8, 5);
    tableCardLight.position.set(0, 1.8, 0.1);
    scene.add(tableCardLight);

    // Ön dolgu ışığı (karakter yüzleri ve elleri net görünsün)
    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.65);
    fillLight.position.set(0, 4.5, 6.5);
    scene.add(fillLight);

    // --- ZEMİN & LAMBA ---
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090807,
      roughness: 0.92,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const lampGeo = new THREE.ConeGeometry(0.65, 0.35, 16, 1, true);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      side: THREE.DoubleSide,
      roughness: 0.4,
    });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0, 5.4, 0);
    scene.add(lamp);

    // --- YUVARLAK MASA (MAUN ÇERÇEVE & YEŞİL ÇUHA) ---
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    const rimGeo = new THREE.CylinderGeometry(2.68, 2.52, 0.24, 48);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x3b1d0e,
      roughness: 0.42,
      metalness: 0.12,
    });
    const tableRim = new THREE.Mesh(rimGeo, rimMat);
    tableRim.position.y = -0.06;
    tableRim.castShadow = true;
    tableRim.receiveShadow = true;
    tableGroup.add(tableRim);

    const feltGeo = new THREE.CylinderGeometry(2.42, 2.42, 0.06, 48);
    const feltMat = new THREE.MeshStandardMaterial({
      color: 0x163022,
      roughness: 0.85,
    });
    const tableFelt = new THREE.Mesh(feltGeo, feltMat);
    tableFelt.position.y = 0.05;
    tableFelt.receiveShadow = true;
    tableGroup.add(tableFelt);

    const legGeo = new THREE.CylinderGeometry(0.32, 0.65, 1.5, 20);
    const legMesh = new THREE.Mesh(legGeo, rimMat);
    legMesh.position.y = -0.8;
    legMesh.castShadow = true;
    tableGroup.add(legMesh);

    // --- MASA ÜZERİNDEKİ YASA PANOLARI, DESTE & ISKARTA ---
    const blueSlots = [];
    const redSlots = [];
    const slotGeo = new THREE.BoxGeometry(0.34, 0.03, 0.48);

    // 5 Mavi Yasa Yuvası (Üst sıra)
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.55,
      });
      const mesh = new THREE.Mesh(slotGeo, mat);
      mesh.position.set((i - 2) * 0.41, 0.085, -0.42);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      tableGroup.add(mesh);
      blueSlots.push(mesh);
    }

    // 6 Kırmızı Yasa Yuvası (Orta sıra)
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a1215,
        roughness: 0.55,
      });
      const mesh = new THREE.Mesh(slotGeo, mat);
      mesh.position.set((i - 2.5) * 0.39, 0.085, 0.18);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      tableGroup.add(mesh);
      redSlots.push(mesh);
    }

    // Sol: Yasa Destesi (Draw Deck)
    const deckGeo = new THREE.BoxGeometry(0.38, 0.22, 0.54);
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.35,
      metalness: 0.15,
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.set(-1.38, 0.18, -0.12);
    deckMesh.castShadow = true;
    tableGroup.add(deckMesh);

    // Sağ: Iskarta Yığını (Discard Pile)
    const discardMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.65,
    });
    const discardMesh = new THREE.Mesh(deckGeo, discardMat);
    discardMesh.position.set(1.38, 0.12, -0.12);
    discardMesh.castShadow = true;
    tableGroup.add(discardMesh);

    // --- MASA ORTASINDAKİ AKTİF HAREKETLİ 3D KARTLAR (LİDER / ORTAK / PEEK / ENACT) ---
    const activeCardsGroup = new THREE.Group();
    tableGroup.add(activeCardsGroup);

    const activeCards = [];
    const activeCardGeo = new THREE.BoxGeometry(0.42, 0.025, 0.60);
    const borderGeo = new THREE.BoxGeometry(0.45, 0.018, 0.63);
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.3,
      metalness: 0.6,
    });

    for (let i = 0; i < 3; i++) {
      const cGroup = new THREE.Group();
      const cMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.35,
      });
      const cMesh = new THREE.Mesh(activeCardGeo, cMat);
      cMesh.castShadow = true;
      cMesh.receiveShadow = true;
      cGroup.add(cMesh);

      const trimMesh = new THREE.Mesh(borderGeo, goldTrimMat);
      trimMesh.position.y = -0.002;
      cGroup.add(trimMesh);

      cGroup.position.set(-1.38, 0.25, -0.12);
      cGroup.visible = false;
      activeCardsGroup.add(cGroup);
      activeCards.push({
        group: cGroup,
        mesh: cMesh,
        mat: cMat,
        targetPos: new THREE.Vector3(-1.38, 0.25, -0.12),
        targetRotX: 0,
        targetRotY: 0,
        targetRotZ: 0,
      });
    }

    // --- 3D HEDEF İŞARET HALKASI & LAZER ÇİZGİSİ (PARMAKLA İŞARET EDİLİNCE) ---
    const ringGeo = new THREE.RingGeometry(0.48, 0.58, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const targetRing = new THREE.Mesh(ringGeo, ringMat);
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.y = 0.09;
    targetRing.visible = false;
    scene.add(targetRing);

    // Parmaktan hedefe uzanan ince görsel işaret çizgisi
    const pointerLines = [];
    for (let i = 0; i < 7; i++) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 1, 0),
      ]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xfbbf24,
        dashSize: 0.14,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.75,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      line.visible = false;
      scene.add(line);
      pointerLines.push(line);
    }

    // --- BİRİNCİ ŞAHIS (SEN - KOLTUK 0) İŞARET EDEN KOL VE PARMAK ---
    const myArmGroup = new THREE.Group();
    const mySuitMat = new THREE.MeshStandardMaterial({ color: SUIT_COLORS[0], roughness: 0.6 });
    const mySkinMat = new THREE.MeshStandardMaterial({ color: SKIN_TONES[0], roughness: 0.45 });

    // Kol gövdesi (uzanan kol)
    const myForearmGeo = new THREE.CylinderGeometry(0.085, 0.11, 0.75, 16);
    myForearmGeo.rotateX(Math.PI / 2);
    const myForearm = new THREE.Mesh(myForearmGeo, mySuitMat);
    myForearm.position.set(0, 0, -0.35);
    myArmGroup.add(myForearm);

    // El (avuç içi)
    const myHandGeo = new THREE.SphereGeometry(0.095, 16, 16);
    const myHand = new THREE.Mesh(myHandGeo, mySkinMat);
    myHand.position.set(0, 0, -0.76);
    myArmGroup.add(myHand);

    // Uzanan İşaret Parmağı!
    const myFingerGeo = new THREE.CylinderGeometry(0.026, 0.032, 0.24, 12);
    myFingerGeo.rotateX(Math.PI / 2);
    const myFinger = new THREE.Mesh(myFingerGeo, mySkinMat);
    myFinger.position.set(0, 0.02, -0.92);
    myArmGroup.add(myFinger);

    const myFingerTipGeo = new THREE.SphereGeometry(0.027, 12, 12);
    const myFingerTip = new THREE.Mesh(myFingerTipGeo, mySkinMat);
    myFingerTip.position.set(0, 0.02, -1.04);
    myArmGroup.add(myFingerTip);

    myArmGroup.position.set(0.55, 1.55, 3.35);
    myArmGroup.visible = false;
    scene.add(myArmGroup);

    // --- KARAKTER MODELLERİ (GÖVDE, KAFA, GÖZLER, KOLLAR, ELLER VE İŞARET PARMAĞI) ---
    const characters = [];
    const seatRadius = 3.25;
    const clickableMeshes = [];

    for (let i = 0; i < 7; i++) {
      const charGroup = new THREE.Group();
      scene.add(charGroup);

      // Sandalye arkalığı
      const chairGeo = new THREE.BoxGeometry(0.82, 1.45, 0.14);
      const chairMat = new THREE.MeshStandardMaterial({
        color: 0x23120b,
        roughness: 0.7,
      });
      const chair = new THREE.Mesh(chairGeo, chairMat);
      chair.position.set(0, 0.55, 0.36);
      chair.castShadow = true;
      charGroup.add(chair);

      // Gövde (Torso)
      const bodyGeo = new THREE.CylinderGeometry(0.33, 0.43, 1.15, 20);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: SUIT_COLORS[i % SUIT_COLORS.length],
        roughness: 0.65,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.68;
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData = { seatIdx: i };
      clickableMeshes.push(body);
      charGroup.add(body);

      const skinMat = new THREE.MeshStandardMaterial({
        color: SKIN_TONES[i % SKIN_TONES.length],
        roughness: 0.48,
      });

      // Boyun
      const neckGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.25, 12);
      const neck = new THREE.Mesh(neckGeo, skinMat);
      neck.position.y = 1.32;
      charGroup.add(neck);

      // Kafa Grubu
      const headGroup = new THREE.Group();
      headGroup.position.y = 1.6;
      charGroup.add(headGroup);

      const headGeo = new THREE.SphereGeometry(0.32, 24, 24);
      const headMesh = new THREE.Mesh(headGeo, skinMat);
      headMesh.castShadow = true;
      headMesh.userData = { seatIdx: i };
      clickableMeshes.push(headMesh);
      headGroup.add(headMesh);

      // Gözler
      const eyeWhiteGeo = new THREE.SphereGeometry(0.064, 12, 12);
      const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pupilGeo = new THREE.SphereGeometry(0.033, 10, 10);
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x09090b });

      const leftEye = new THREE.Group();
      leftEye.position.set(-0.11, 0.05, -0.27);
      const leW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      const leP = new THREE.Mesh(pupilGeo, pupilMat);
      leP.position.z = -0.046;
      leftEye.add(leW);
      leftEye.add(leP);
      headGroup.add(leftEye);

      const rightEye = new THREE.Group();
      rightEye.position.set(0.11, 0.05, -0.27);
      const reW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      const reP = new THREE.Mesh(pupilGeo, pupilMat);
      reP.position.z = -0.046;
      rightEye.add(reW);
      rightEye.add(reP);
      headGroup.add(rightEye);

      // Şapka / Saç Aksesuarı
      const hatMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.75,
      });
      if (i % 2 === 1) {
        const brim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.46, 0.46, 0.04, 20),
          hatMat
        );
        brim.position.y = 0.24;
        const top = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.3, 0.25, 20),
          hatMat
        );
        top.position.y = 0.36;
        headGroup.add(brim);
        headGroup.add(top);
      } else {
        const hair = new THREE.Mesh(
          new THREE.SphereGeometry(
            0.335,
            16,
            16,
            0,
            Math.PI * 2,
            0,
            Math.PI * 0.55
          ),
          hatMat
        );
        hair.rotation.x = -0.22;
        headGroup.add(hair);
      }

      // Sol Kol (Dinlenme pozisyonunda veya düşünürken çenede)
      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(-0.38, 1.12, 0);
      const leftArmMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.09, 0.55, 12),
        bodyMat
      );
      leftArmMesh.position.set(-0.04, -0.22, -0.12);
      leftArmMesh.rotation.x = 0.45;
      const leftHandMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 12, 12),
        skinMat
      );
      leftHandMesh.position.set(-0.04, -0.45, -0.25);
      leftArmGroup.add(leftArmMesh);
      leftArmGroup.add(leftHandMesh);
      charGroup.add(leftArmGroup);

      // Sağ Kol + El + UZANAN İŞARET PARMAĞI (Pointing Arm!)
      // Omuz noktasında (world-space lookAt yapabilmek için sahneye veya charGroup'a bağlı)
      const rightArmPivot = new THREE.Group();
      rightArmPivot.position.set(0.38, 1.14, 0);
      charGroup.add(rightArmPivot);

      // Kol uzantısı (-Z yönüne doğru, böylece lookAt veya açı hesabıyla doğrudan hedefi gösterir)
      const armSleeveGeo = new THREE.CylinderGeometry(0.075, 0.095, 0.58, 14);
      armSleeveGeo.rotateX(Math.PI / 2);
      const armSleeve = new THREE.Mesh(armSleeveGeo, bodyMat);
      armSleeve.position.set(0, 0, -0.28);
      armSleeve.castShadow = true;
      rightArmPivot.add(armSleeve);

      // El (Yumruk)
      const handGeo = new THREE.SphereGeometry(0.09, 14, 14);
      const handMesh = new THREE.Mesh(handGeo, skinMat);
      handMesh.position.set(0, 0, -0.60);
      rightArmPivot.add(handMesh);

      // Uzatılmış İşaret Parmağı (Index Finger)
      const fingerGeo = new THREE.CylinderGeometry(0.025, 0.032, 0.22, 10);
      fingerGeo.rotateX(Math.PI / 2);
      const fingerMesh = new THREE.Mesh(fingerGeo, skinMat);
      fingerMesh.position.set(0, 0.02, -0.76);
      rightArmPivot.add(fingerMesh);

      // Parmak ucu
      const fingerTipGeo = new THREE.SphereGeometry(0.026, 10, 10);
      const fingerTipMesh = new THREE.Mesh(fingerTipGeo, skinMat);
      fingerTipMesh.position.set(0, 0.02, -0.87);
      rightArmPivot.add(fingerTipMesh);

      // Oy Plakası (Masada oyuncunun önünde)
      const voteGeo = new THREE.BoxGeometry(0.38, 0.04, 0.26);
      const voteMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.4,
      });
      const votePlate = new THREE.Mesh(voteGeo, voteMat);
      votePlate.position.set(0, 0.1, -1.05);
      charGroup.add(votePlate);

      characters.push({
        group: charGroup,
        body,
        headGroup,
        leftEye,
        rightEye,
        leftArmGroup,
        rightArmPivot,
        fingerTipMesh,
        votePlate,
        voteMat,
        targetRotY: 0,
        targetRotX: 0,
        armTargetRotX: -0.9, // Normalde aşağı/masaya doğru
        armTargetRotY: 0,
      });
    }

    // --- FARE HAREKETİ & 3D KARAKTER/KART TIKLAMA (RAYCASTER) ---
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
      const intersects = raycaster.intersectObjects(clickableMeshes, false);
      if (intersects.length > 0) {
        const hitSeat = intersects[0].object.userData?.seatIdx;
        if (hitSeat !== undefined) {
          const { pub: cPub, view: cView } = stateRef.current;
          const allP = cPub.players || [];
          const mIdx = allP.findIndex((p) => p.id === cView.your_id);
          const ord =
            mIdx >= 0
              ? [...allP.slice(mIdx), ...allP.slice(0, mIdx)]
              : allP;
          const clickedPlayer = ord[hitSeat];
          if (clickedPlayer && onSelectPlayerRef.current) {
            onSelectPlayerRef.current(clickedPlayer.id);
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

    // Koltukların dünya koordinatlarını önceden hesaplamak için yardımcı
    const getSeatWorldPos = (seatIdx) => {
      const angle = SEAT_ANGLES[seatIdx] ?? (seatIdx / 6) * Math.PI * 2;
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

      // Tema renkleri
      const isDark = curTheme === "dark";
      const targetBg = isDark ? 0x0c0b0a : 0xe5e5e5;
      scene.background.lerp(new THREE.Color(targetBg), 0.08);
      scene.fog.color.lerp(new THREE.Color(targetBg), 0.08);
      floorMat.color.lerp(new THREE.Color(isDark ? 0x090807 : 0xd4d4d4), 0.08);

      // --- DİNAMİK KAMERA ODAKLANMASI (MASA/KARTLAR vs KARAKTERLER) ---
      const isCardPhase =
        curPub.phase === "LEGISLATE_LEADER" ||
        curPub.phase === "LEGISLATE_PARTNER" ||
        curPub.phase === "POWERS_PEEK";

      const focusTable =
        curCamMode === "table" || (curCamMode === "auto" && isCardPhase);

      const desiredCamPos = focusTable
        ? new THREE.Vector3(mouseX * 0.22, 3.25 - mouseY * 0.12, 2.25)
        : new THREE.Vector3(mouseX * 0.45, 4.55 - mouseY * 0.2, 5.85);

      const desiredLookAt = focusTable
        ? new THREE.Vector3(0, 0.14, 0.12)
        : new THREE.Vector3(0, 0.68, -0.25);

      camera.position.lerp(desiredCamPos, 0.055);
      currentLookAt.lerp(desiredLookAt, 0.065);
      camera.lookAt(currentLookAt);

      tableCardLight.intensity = THREE.MathUtils.lerp(
        tableCardLight.intensity,
        focusTable ? 2.2 : 0.7,
        0.06
      );

      // Yasa Panolarını Güncelle
      blueSlots.forEach((slot, idx) => {
        const active = idx < (curPub.blue_policies || 0);
        slot.material.color.lerp(
          new THREE.Color(active ? 0x2563eb : 0x1e293b),
          0.12
        );
        slot.position.y = active ? 0.115 : 0.085;
      });
      redSlots.forEach((slot, idx) => {
        const active = idx < (curPub.red_policies || 0);
        slot.material.color.lerp(
          new THREE.Color(active ? 0xdc2626 : 0x2a1215),
          0.12
        );
        slot.position.y = active ? 0.115 : 0.085;
      });

      // Deste ve Iskarta Yüksekliği
      const dScale = Math.max(0.12, (curPub.deck_count || 0) / 17);
      deckMesh.scale.y = dScale;
      deckMesh.position.y = 0.06 + 0.11 * dScale;

      const discScale = Math.max(0.05, (curPub.discard_count || 0) / 17);
      discardMesh.scale.y = discScale;
      discardMesh.position.y = 0.06 + 0.11 * discScale;
      discardMesh.visible = (curPub.discard_count || 0) > 0;

      // Oyuncu Koltuk Sıralaması
      const allP = curPub.players || [];
      const mIdx = allP.findIndex((p) => p.id === curView.your_id);
      const ord =
        mIdx >= 0 ? [...allP.slice(mIdx), ...allP.slice(0, mIdx)] : allP;

      const findSeatIndexById = (pid) => ord.findIndex((p) => p.id === pid);

      // --- MASA ÜZERİNDEKİ AKTİF 3D KARTLARIN ANİMASYONU ---
      const leaderSeatIdx = findSeatIndexById(curPub.leader_id);
      const partnerSeatIdx = findSeatIndexById(curPub.partner_id);

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
            // Oyuncu Liderse kartları masanın ortasında kameraya dönük ve açık göster
            ac.targetPos.set((i - 1) * 0.56, 0.34 + Math.sin(t * 3 + i) * 0.015, 0.55);
            ac.targetRotX = 0.42;
            ac.targetRotY = 0;
            const cColor =
              myCards[i] === "BLUE"
                ? 0x2563eb
                : myCards[i] === "RED"
                ? 0xdc2626
                : 0x475569;
            ac.mat.color.lerp(new THREE.Color(cColor), 0.15);
          } else {
            // Bot Liderse masanın ortasında Liderin önünde 3 gizli kart dizilsin
            const dir = leaderPos.clone().normalize();
            const perp = new THREE.Vector3(-dir.z, 0, dir.x);
            ac.targetPos
              .copy(dir.multiplyScalar(1.05))
              .add(perp.multiplyScalar((i - 1) * 0.46));
            ac.targetPos.y = 0.24 + Math.sin(t * 3 + i) * 0.015;
            ac.targetRotX = 0;
            ac.targetRotY = Math.atan2(leaderPos.x, leaderPos.z);
            ac.mat.color.lerp(new THREE.Color(0x7c2d12), 0.15); // Gizli dosya sırtı
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
              ac.targetPos.set((i - 0.5) * 0.62, 0.36 + Math.sin(t * 3 + i) * 0.015, 0.58);
              ac.targetRotX = 0.44;
              ac.targetRotY = 0;
              const cColor =
                myCards[i] === "BLUE"
                  ? 0x2563eb
                  : myCards[i] === "RED"
                  ? 0xdc2626
                  : 0x475569;
              ac.mat.color.lerp(new THREE.Color(cColor), 0.15);
            } else {
              const dir = partnerPos.clone().normalize();
              const perp = new THREE.Vector3(-dir.z, 0, dir.x);
              ac.targetPos
                .copy(dir.multiplyScalar(1.05))
                .add(perp.multiplyScalar((i - 0.5) * 0.5));
              ac.targetPos.y = 0.24 + Math.sin(t * 3 + i) * 0.015;
              ac.targetRotX = 0;
              ac.targetRotY = Math.atan2(partnerPos.x, partnerPos.z);
              ac.mat.color.lerp(new THREE.Color(0x7c2d12), 0.15);
            }
          } else {
            // 3. kart ıskartaya gitti
            ac.targetPos.set(1.38, 0.18, -0.12);
            ac.targetRotX = 0;
            ac.targetRotY = 0.3;
            ac.mat.color.lerp(new THREE.Color(0x475569), 0.15);
          }
        }
      } else if (curPub.phase === "POWERS_PEEK") {
        const peekCards = curView.peeked_policies || [];
        const isMeLeader = curPub.leader_id === curView.your_id;
        for (let i = 0; i < 3; i++) {
          const ac = activeCards[i];
          ac.group.visible = true;
          ac.targetPos.set(-0.6 + i * 0.55, 0.38 + Math.sin(t * 3 + i) * 0.015, 0.25);
          ac.targetRotX = isMeLeader ? 0.4 : 0;
          ac.targetRotY = 0;
          const cColor = isMeLeader
            ? peekCards[i] === "BLUE"
              ? 0x2563eb
              : 0xdc2626
            : 0xf59e0b;
          ac.mat.color.lerp(new THREE.Color(cColor), 0.15);
        }
      } else if (curPub.phase === "CLAIMING" && curPub.current_claim) {
        // Yürürlüğe giren kart masanın tam ortasında parlasın
        const enacted = curPub.current_claim.partner_enacted;
        activeCards[0].group.visible = true;
        activeCards[0].targetPos.set(0, 0.32 + Math.sin(t * 4) * 0.02, -0.05);
        activeCards[0].targetRotX = 0.25;
        activeCards[0].targetRotY = Math.sin(t * 1.5) * 0.15;
        activeCards[0].mat.color.lerp(
          new THREE.Color(enacted === "BLUE" ? 0x2563eb : 0xdc2626),
          0.18
        );
        activeCards[1].group.visible = false;
        activeCards[2].group.visible = false;
      } else {
        for (let i = 0; i < 3; i++) {
          activeCards[i].group.visible = false;
          activeCards[i].targetPos.set(-1.38, 0.2, -0.12);
        }
      }

      activeCards.forEach((ac) => {
        ac.group.position.lerp(ac.targetPos, 0.1);
        ac.group.rotation.x = THREE.MathUtils.lerp(
          ac.group.rotation.x,
          ac.targetRotX,
          0.1
        );
        ac.group.rotation.y = THREE.MathUtils.lerp(
          ac.group.rotation.y,
          ac.targetRotY,
          0.1
        );
      });

      // --- KARAKTERLER, KAFA HAREKETLERİ VE 3D PARMAKLA İŞARET ETME ---
      const newLabels = [];
      let anyPointingTargetSeat = -1;

      // Birinci şahıs (Sen - Koltuk 0) parmakla işaret kontrolü
      const mePlayer = ord[0];
      if (
        mePlayer &&
        mePlayer.expression === "pointing" &&
        mePlayer.target_id
      ) {
        const tSeat = findSeatIndexById(mePlayer.target_id);
        if (tSeat > 0) {
          anyPointingTargetSeat = tSeat;
          const tWorld = getSeatWorldPos(tSeat);
          tWorld.y = 1.25;
          myArmGroup.visible = true;
          myArmGroup.lookAt(tWorld);
        } else {
          myArmGroup.visible = false;
        }
      } else {
        myArmGroup.visible = false;
      }

      characters.forEach((char, i) => {
        const pState = ord[i];
        const pLine = pointerLines[i];
        if (!pState) {
          char.group.visible = false;
          if (pLine) pLine.visible = false;
          return;
        }

        // Koltuk 0 ("Sen") kamera arkasında olduğu için 3D gövdesi gizlenir ama hedef hesaplarında kullanılır
        if (i === 0) {
          char.group.visible = false;
          if (pLine) pLine.visible = false;
          return;
        }

        char.group.visible = true;
        const seatPos = getSeatWorldPos(i);
        char.group.position.copy(seatPos);
        // Masanın merkezine (0,0,0) baksın
        char.group.lookAt(0, 0, 0);

        if (!pState.is_alive) {
          char.group.rotation.x = -0.55;
          char.body.material.opacity = 0.35;
          char.body.material.transparent = true;
          if (pLine) pLine.visible = false;
        } else {
          char.body.material.opacity = 1;
          char.body.position.y = 0.68 + Math.sin(t * 2.2 + i) * 0.015;
          char.headGroup.position.y = 1.6 + Math.sin(t * 2.2 + i) * 0.018;
        }

        // Mimik, Kafa Dönüşü ve 3D Parmakla İşaret Etme!
        const expr = pState.expression || "neutral";
        let desiredHeadY = 0;
        let desiredHeadX = 0;
        let eyeOffsetX = 0;
        let desiredArmX = -1.1; // Kol normalde aşağıda/masada
        let desiredArmY = 0.15;
        let showPointerLine = false;

        if (expr === "look_left") {
          desiredHeadY = 0.58;
          eyeOffsetX = -0.032;
        } else if (expr === "look_right") {
          desiredHeadY = -0.58;
          eyeOffsetX = 0.032;
        } else if (expr === "thinking") {
          desiredHeadX = -0.22;
          desiredHeadY = Math.sin(t * 1.6 + i) * 0.24;
          // Düşünürken sağ el çeneye doğru kalksın
          desiredArmX = 0.55;
          desiredArmY = 0.45;
        } else if (expr === "surprised") {
          desiredHeadX = 0.14;
          char.leftEye.scale.setScalar(1.38);
          char.rightEye.scale.setScalar(1.38);
          desiredArmX = -0.4;
        } else if (expr === "eureka") {
          desiredHeadX = 0.16;
          desiredHeadY = Math.sin(t * 5) * 0.12;
          // Aha! derken parmak yukarı kalksın
          desiredArmX = 0.95;
          desiredArmY = 0;
        } else if (expr === "pointing") {
          // GERÇEK 3D PARMAKLA İŞARET ETME!
          const targetSeatIdx = findSeatIndexById(pState.target_id);
          const effectiveSeatIdx =
            targetSeatIdx >= 0 ? targetSeatIdx : (i + 2) % ord.length;
          anyPointingTargetSeat = effectiveSeatIdx;

          const targetWorld = getSeatWorldPos(effectiveSeatIdx);
          // Karakterin kendi local koordinat sisteminde hedef oyuncunun yönünü bul
          const localTarget = targetWorld.clone();
          char.group.worldToLocal(localTarget);

          // Kafa ve sağ kol/parmak doğrudan hedef oyuncuya dönsün!
          const yawToTarget = Math.atan2(-localTarget.x, -localTarget.z);
          desiredHeadY = THREE.MathUtils.clamp(yawToTarget, -1.25, 1.25);
          desiredHeadX = -0.05;

          // Kol yatay olarak kalksın (0 radyan = tam karşıya uzanmış) ve hedefe dönsün
          desiredArmX = -0.04 + Math.sin(t * 6) * 0.04; // Hafif vurgulu sallama
          desiredArmY = yawToTarget;
          showPointerLine = true;

          if (pLine) {
            pLine.visible = true;
            const tipWorld = new THREE.Vector3();
            char.fingerTipMesh.getWorldPosition(tipWorld);
            const destWorld = targetWorld.clone();
            destWorld.y = 1.15;
            pLine.geometry.setFromPoints([tipWorld, destWorld]);
            pLine.computeLineDistances();
          }
        } else {
          // Neutral: Lider veya Ortak konuşurken/kart çekerken hafifçe ona baksın
          const focusId = curPub.partner_id || curPub.leader_id;
          const focusIdx = findSeatIndexById(focusId);
          if (focusIdx >= 0 && focusIdx !== i) {
            const localFocus = getSeatWorldPos(focusIdx);
            char.group.worldToLocal(localFocus);
            const yaw = Math.atan2(-localFocus.x, -localFocus.z);
            desiredHeadY = THREE.MathUtils.clamp(yaw * 0.45, -0.5, 0.5);
          } else {
            desiredHeadY = Math.sin(t * 0.7 + i * 2) * 0.14;
          }
          // Kart fazında kafalar masanın ortasına eğilsin
          if (isCardPhase) {
            desiredHeadX = -0.25;
          }
        }

        if (expr !== "surprised") {
          char.leftEye.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
          char.rightEye.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
        }

        if (!showPointerLine && pLine) {
          pLine.visible = false;
        }

        char.headGroup.rotation.y = THREE.MathUtils.lerp(
          char.headGroup.rotation.y,
          desiredHeadY,
          0.1
        );
        char.headGroup.rotation.x = THREE.MathUtils.lerp(
          char.headGroup.rotation.x,
          desiredHeadX,
          0.1
        );
        char.leftEye.position.x = THREE.MathUtils.lerp(
          char.leftEye.position.x,
          -0.11 + eyeOffsetX,
          0.15
        );
        char.rightEye.position.x = THREE.MathUtils.lerp(
          char.rightEye.position.x,
          0.11 + eyeOffsetX,
          0.15
        );

        // Sağ Kol & Parmak rotasyonunu yumuşakça uygula
        char.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
          char.rightArmPivot.rotation.x,
          desiredArmX,
          0.14
        );
        char.rightArmPivot.rotation.y = THREE.MathUtils.lerp(
          char.rightArmPivot.rotation.y,
          desiredArmY,
          0.14
        );

        // Oy Plakası Rengi
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

        // 2D Etiket ve Konuşma Balonu Koordinatı
        const headWorldPos = new THREE.Vector3();
        char.headGroup.getWorldPosition(headWorldPos);
        headWorldPos.y += 0.62;
        headWorldPos.project(camera);

        const sx = (headWorldPos.x * 0.5 + 0.5) * container.clientWidth;
        const sy = (-(headWorldPos.y * 0.5) + 0.5) * container.clientHeight;

        // İşaret edilen hedefin adını bul
        const targetPlayerObj = pState.target_id
          ? allP.find((x) => x.id === pState.target_id)
          : null;

        newLabels.push({
          id: pState.id,
          name: pState.name,
          isAlive: pState.is_alive,
          bubble: pState.bubble,
          expression: pState.expression,
          targetName: targetPlayerObj ? targetPlayerObj.name : "",
          isLeader: pState.id === curPub.leader_id,
          isPartner: pState.id === curPub.partner_id,
          vote,
          x: sx,
          y: sy,
        });
      });

      // İşaret edilen oyuncunun altında parlayan hedef halkası
      if (anyPointingTargetSeat >= 0 && anyPointingTargetSeat < ord.length) {
        const ringPos = getSeatWorldPos(anyPointingTargetSeat);
        targetRing.visible = true;
        targetRing.position.set(ringPos.x, 0.09, ringPos.z);
        targetRing.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
      } else {
        targetRing.visible = false;
      }

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

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#0c0b0a]">
      {/* Three.js Tam Ekran Tuvali */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Masa Kartları Odaklandığında Üst Bilgilendirme Etiketi */}
      {focusTable && (
        <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/80 border border-amber-500/40 text-amber-300 text-xs font-bold shadow-xl animate-pulse">
          <span>🃏 MASA KART ODAĞI AKTİF</span>
          <span className="text-neutral-400 font-normal">
            —{" "}
            {pub.phase === "LEGISLATE_LEADER"
              ? "Lider masadan 3 yasa kartı çekti, 1'ini ıskartaya ayırıyor"
              : pub.phase === "LEGISLATE_PARTNER"
              ? "Ortak masadaki 2 yasa kartından 1'ini yürürlüğe koyuyor"
              : "Masadaki yasa kartları inceleniyor"}
          </span>
        </div>
      )}

      {/* 3D Karakterlerin Üstündeki Konuşma Balonları, Parmak Hedefi ve İsim Etiketleri */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {labelPositions.map((lbl) => {
          const chip = mySuspicions[lbl.id];
          const isKnownAlly = view.known_allies?.includes(lbl.id);
          const isSecretLeader = view.secret_leader_id === lbl.id;
          const isSelectedTarget = selectedTargetId === lbl.id;

          return (
            <div
              key={lbl.id}
              style={{
                transform: `translate3d(${lbl.x}px, ${lbl.y}px, 0) translate(-50%, -100%)`,
              }}
              className="absolute top-0 left-0 flex flex-col items-center transition-transform duration-75"
            >
              {/* Parmakla İşaret Etme Vurgusu */}
              {lbl.expression === "pointing" && lbl.targetName && lbl.isAlive && (
                <div className="mb-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black shadow-lg border border-amber-200 whitespace-nowrap animate-bounce">
                  🫵 {lbl.targetName} kişisini işaret ediyor!
                </div>
              )}

              {/* Konuşma / Mimik Balonu ("Ha?!", "Aha!", "Hmm...") */}
              {lbl.bubble && lbl.isAlive && (
                <div className="mb-1.5 px-3 py-1 rounded-xl bg-white text-black text-xs font-black shadow-lg border-2 border-neutral-900 animate-bounce whitespace-nowrap">
                  {lbl.bubble}
                </div>
              )}

              {/* Rol Rozetleri (Lider / Ortak) */}
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

              {/* İsim Plakası (Tıklanabilir - İşaret Etmek İçin) */}
              <button
                type="button"
                onClick={() => onSelectPlayer && onSelectPlayer(lbl.id)}
                className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/85 backdrop-blur-md border text-white text-xs font-bold shadow-md transition hover:scale-105 ${
                  !lbl.isAlive
                    ? "opacity-40 line-through border-white/10"
                    : isSelectedTarget
                    ? "border-amber-400 ring-2 ring-amber-400/50"
                    : "border-white/20 hover:border-amber-400/60"
                }`}
                title={`${lbl.name} oyuncusunu hedef seç / işaret et`}
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
                  className={`mt-1 px-2 py-0.5 rounded text-[10px] font-black ${
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
