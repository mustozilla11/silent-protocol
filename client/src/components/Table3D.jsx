import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function Table3D({ 
  players = [], 
  yourId = '', 
  phase = '', 
  votes = {}, 
  lastVoteItem = null,
  bluePolicies = 0,
  redPolicies = 0,
  chaosCounter = 0,
  currentClaim = null,
  onSelectPlayer = () => {}
}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    // 1. SAHNE & KAMERA & RENDERER
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0d11);
    scene.fog = new THREE.FogExp2(0x0c0d11, 0.045);

    const width = currentMount.clientWidth;
    const height = currentMount.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    // Oyuncunun gözünden masaya hafif üstten bakış (Sinematik first-person)
    camera.position.set(0, 4.8, 6.2);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    currentMount.appendChild(renderer.domElement);

    // 2. IŞIKLANDIRMA (NOİR MASAÜSTÜ ATMOSFERİ)
    const ambientLight = new THREE.AmbientLight(0x3a3d45, 1.2);
    scene.add(ambientLight);

    // Masanın tam tepesinden sarkan loş sarı abajur ışığı
    const tableSpot = new THREE.SpotLight(0xffecd1, 3.5);
    tableSpot.position.set(0, 6.5, 0);
    tableSpot.angle = Math.PI / 3.2;
    tableSpot.penumbra = 0.6;
    tableSpot.castShadow = true;
    tableSpot.shadow.mapSize.width = 1024;
    tableSpot.shadow.mapSize.height = 1024;
    scene.add(tableSpot);

    // Hafif arka plan dolgu ışığı
    const rimLight = new THREE.DirectionalLight(0x475569, 0.8);
    rimLight.position.set(0, 4, -8);
    scene.add(rimLight);

    // 3. 3D MASA (AHŞAP OVAL POKER MASASI)
    const tableGroup = new THREE.Group();

    // Ahşap kalın masa gövdesi (Oval için scale edilmiş silindir)
    const tableGeo = new THREE.CylinderGeometry(4.2, 4.0, 0.35, 48);
    const tableMat = new THREE.MeshStandardMaterial({ 
      color: 0x1f1712, // Koyu maun ahşap
      roughness: 0.6,
      metalness: 0.1
    });
    const tableBase = new THREE.Mesh(tableGeo, tableMat);
    tableBase.scale.set(1.4, 1, 0.95); // Oval form
    tableBase.position.y = 0;
    tableBase.receiveShadow = true;
    tableGroup.add(tableBase);

    // Masanın üstündeki koyu antrasit keçe örtü
    const feltGeo = new THREE.CylinderGeometry(3.9, 3.9, 0.05, 48);
    const feltMat = new THREE.MeshStandardMaterial({ 
      color: 0x15181e, // Koyu yeraltı keçesi
      roughness: 0.9,
      metalness: 0.05
    });
    const tableFelt = new THREE.Mesh(feltGeo, feltMat);
    tableFelt.scale.set(1.4, 1, 0.95);
    tableFelt.position.y = 0.18;
    tableFelt.receiveShadow = true;
    tableGroup.add(tableFelt);

    // Masanın lüks ahşap kenar pervazı (Padded Rim)
    const rimGeo = new THREE.TorusGeometry(4.05, 0.22, 16, 64);
    const rimMat = new THREE.MeshStandardMaterial({ 
      color: 0x2b1e17,
      roughness: 0.5,
      metalness: 0.2
    });
    const tableRim = new THREE.Mesh(rimGeo, rimMat);
    tableRim.rotation.x = Math.PI / 2;
    tableRim.scale.set(1.4, 0.95, 1);
    tableRim.position.y = 0.22;
    tableGroup.add(tableRim);

    // Oda zemini
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Masanın ayakları
    const legGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.2, 16);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 0.7 });
    const leg1 = new THREE.Mesh(legGeo, legMat);
    leg1.position.set(-2, -1.1, 0);
    tableGroup.add(leg1);
    const leg2 = new THREE.Mesh(legGeo, legMat);
    leg2.position.set(2, -1.1, 0);
    tableGroup.add(leg2);

    scene.add(tableGroup);

    // 4. MASANIN ORTASINDAKİ 3D NESNELER (DESTELER, KARTLAR, KAOS PULLARI)
    const propsGroup = new THREE.Group();

    // Kapalı Kart Destesi (Koyu bordo desteler)
    const deckGeo = new THREE.BoxGeometry(0.7, 0.25, 1.0);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x450a0a, roughness: 0.5 });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.set(-1.8, 0.35, 0);
    deckMesh.rotation.y = 0.2;
    deckMesh.castShadow = true;
    propsGroup.add(deckMesh);

    // Açılan Mavi Yasalar (Koruyucu Kartları)
    for (let i = 0; i < 5; i++) {
      const isFilled = i < bluePolicies;
      const cardGeo = new THREE.BoxGeometry(0.48, 0.04, 0.75);
      const cardMat = new THREE.MeshStandardMaterial({
        color: isFilled ? 0x1d4ed8 : 0x1e2430, // Canlı lacivert veya boş yuva
        roughness: isFilled ? 0.3 : 0.8,
        metalness: isFilled ? 0.2 : 0.0
      });
      const card = new THREE.Mesh(cardGeo, cardMat);
      card.position.set(-1.2 + i * 0.55, 0.22, -0.6);
      card.castShadow = true;
      propsGroup.add(card);
    }

    // Açılan Kırmızı Yasalar (Casus Kartları)
    for (let i = 0; i < 6; i++) {
      const isFilled = i < redPolicies;
      const cardGeo = new THREE.BoxGeometry(0.48, 0.04, 0.75);
      const cardMat = new THREE.MeshStandardMaterial({
        color: isFilled ? 0xb91c1c : 0x2d171a, // Canlı koyu kırmızı veya boş yuva
        roughness: isFilled ? 0.3 : 0.8,
        metalness: isFilled ? 0.2 : 0.0
      });
      const card = new THREE.Mesh(cardGeo, cardMat);
      card.position.set(-1.4 + i * 0.55, 0.22, 0.5);
      card.castShadow = true;
      propsGroup.add(card);
    }

    // Kaos Pulları (Pirinç/Altın 3 Pul)
    for (let i = 0; i < 3; i++) {
      const active = i < chaosCounter;
      const tokenGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.06, 16);
      const tokenMat = new THREE.MeshStandardMaterial({
        color: active ? 0xf59e0b : 0x332818,
        roughness: active ? 0.2 : 0.7,
        metalness: active ? 0.8 : 0.3
      });
      const token = new THREE.Mesh(tokenGeo, tokenMat);
      token.position.set(-0.35 + i * 0.35, 0.24, -0.05);
      token.castShadow = true;
      propsGroup.add(token);
    }

    scene.add(propsGroup);

    // 5. 3D KARAKTERLER (MASADA OTURAN 4 BOT VE SEN)
    // Koltuk pozisyonları:
    // Bot 1 (Kaya): Sol üst (-3.2, 0, -1.8)
    // Bot 2 (Ece): Tam karşı üst (-0.0, 0, -2.6)
    // Bot 3 (Can): Sağ üst (3.2, 0, -1.8)
    // Bot 4 (Deniz): Sağ kanat (4.2, 0, 0.5)
    // Sen (Komutan): Kamera önü (0, 0, 3.8)
    const seatConfigs = [
      { id: 'bot-1', name: 'Ajan Kaya', pos: [-3.2, 0, -1.5], lookAtY: 0.8, hat: 'fedora', color: 0x242730 },
      { id: 'bot-2', name: 'Diplomat Ece', pos: [0.0, 0, -2.8], lookAtY: 0.8, hat: 'glasses', color: 0x1e293b },
      { id: 'bot-3', name: 'Analist Can', pos: [3.2, 0, -1.5], lookAtY: 0.8, hat: 'bow', color: 0x3d271d },
      { id: 'bot-4', name: 'Taktisyen Deniz', pos: [4.2, 0, 0.6], lookAtY: -1.2, hat: 'beret', color: 0x19271c },
    ];

    const characters = [];

    seatConfigs.forEach((cfg) => {
      const charGroup = new THREE.Group();
      charGroup.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

      // Sandalye
      const chairGeo = new THREE.BoxGeometry(0.9, 1.4, 0.8);
      const chairMat = new THREE.MeshStandardMaterial({ color: 0x111217, roughness: 0.8 });
      const chair = new THREE.Mesh(chairGeo, chairMat);
      chair.position.y = 0.4;
      charGroup.add(chair);

      // Gövde (Ceket / Takım)
      const bodyGeo = new THREE.CylinderGeometry(0.42, 0.55, 1.3, 16);
      const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.7 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.9;
      body.castShadow = true;
      charGroup.add(body);

      // Boyun
      const neckGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.3, 12);
      const neckMat = new THREE.MeshStandardMaterial({ color: 0xc89666, roughness: 0.8 });
      const neck = new THREE.Mesh(neckGeo, neckMat);
      neck.position.y = 1.6;
      charGroup.add(neck);

      // Kafa Grubu (DÖNEBİLEN KAFA NESNESİ!)
      const headGroup = new THREE.Group();
      headGroup.position.y = 1.95;

      // Kafa Küresi
      const headGeo = new THREE.SphereGeometry(0.38, 20, 20);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xd9a274, roughness: 0.7 });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.castShadow = true;
      headGroup.add(headMesh);

      // Gözler (Sağa sola kayabilen gözler)
      const eyeGeo = new THREE.SphereGeometry(0.06, 10, 10);
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x090a0f, roughness: 0.2 });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.13, 0.05, 0.33);
      headGroup.add(leftEye);

      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.13, 0.05, 0.33);
      headGroup.add(rightEye);

      // Karakter Aksesuarları (Şapka, gözlük, beret)
      if (cfg.hat === 'fedora') {
        const brimGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.04, 24);
        const brimMat = new THREE.MeshStandardMaterial({ color: 0x16171c, roughness: 0.8 });
        const brim = new THREE.Mesh(brimGeo, brimMat);
        brim.position.y = 0.22;
        headGroup.add(brim);

        const crownGeo = new THREE.CylinderGeometry(0.35, 0.42, 0.38, 24);
        const crown = new THREE.Mesh(crownGeo, brimMat);
        crown.position.y = 0.4;
        headGroup.add(crown);
      } else if (cfg.hat === 'glasses') {
        const glassGeo = new THREE.TorusGeometry(0.12, 0.02, 8, 16);
        const glassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8 });
        const g1 = new THREE.Mesh(glassGeo, glassMat);
        g1.position.set(-0.13, 0.05, 0.35);
        headGroup.add(g1);
        const g2 = new THREE.Mesh(glassGeo, glassMat);
        g2.position.set(0.13, 0.05, 0.35);
        headGroup.add(g2);
      } else if (cfg.hat === 'beret') {
        const beretGeo = new THREE.SphereGeometry(0.42, 16, 16);
        const beretMat = new THREE.MeshStandardMaterial({ color: 0x121b14 });
        const beret = new THREE.Mesh(beretGeo, beretMat);
        beret.scale.set(1.1, 0.45, 1.1);
        beret.position.set(0.05, 0.28, 0);
        beret.rotation.z = -0.2;
        headGroup.add(beret);
      }

      charGroup.add(headGroup);

      // Masadaki Oylama Kartı / Pulu
      const votePlateGeo = new THREE.BoxGeometry(0.4, 0.03, 0.5);
      const votePlateMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.6 });
      const votePlate = new THREE.Mesh(votePlateGeo, votePlateMat);
      // Masanın hemen ön kenarına koy
      votePlate.position.set(0, 0.25, 0.9);
      charGroup.add(votePlate);

      // Masanın merkezine doğru bakış açısı
      charGroup.lookAt(0, 0.8, 0);

      scene.add(charGroup);

      characters.push({
        id: cfg.id,
        group: charGroup,
        headGroup: headGroup,
        leftEye: leftEye,
        rightEye: rightEye,
        votePlate: votePlate,
        baseRotationY: charGroup.rotation.y,
        targetRotationY: 0,
        swaySpeed: 0.8 + Math.random() * 0.5
      });
    });

    // 6. ETKİLEŞİM & FARE İLE HAFİF KAMERA PARALLAXI
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e) => {
      const rect = currentMount.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 7. ANİMASYON DÖNGÜSÜ (RENDER LOOP)
    let animationFrameId;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Kamera hafif nefes alma / fare paralaksı
      camera.position.x += (mouseX * 0.8 - camera.position.x) * 0.04;
      camera.position.y += ((4.8 + mouseY * 0.4) - camera.position.y) * 0.04;
      camera.lookAt(0, 0.6, 0);

      // Masadaki karakterlerin kafa ve göz hareketleri
      characters.forEach((char, idx) => {
        // İlgili oyuncunun durumunu bul
        const pState = players.find(p => p.id === char.id);
        const expr = pState?.expression || 'neutral';
        const hasVoted = votes[char.id] === 'VOTED';
        const lastVote = lastVoteItem?.votes?.[char.id];

        // 1. Kafa Dönüş Hedefi (Target Rotation Y)
        let targetAngle = 0;
        if (expr === 'look_left') {
          targetAngle = 0.55; // Sola bak
        } else if (expr === 'look_right') {
          targetAngle = -0.55; // Sağa bak
        } else if (expr === 'thinking') {
          targetAngle = Math.sin(elapsedTime * 2 + idx) * 0.25 + 0.15; // Düşünceli sağa sola bakınma
        } else if (expr === 'surprised' || currentClaim?.has_conflict) {
          // Çelişki olduğunda masadaki lider veya ortağa dik dik bakma
          targetAngle = Math.sin(elapsedTime * 8) * 0.15;
        } else {
          // Doğal hafif kafayı çevirip masayı izleme
          targetAngle = Math.sin(elapsedTime * char.swaySpeed + idx) * 0.12;
        }

        // Pürüzsüz kafa dönüşü (Lerp)
        char.headGroup.rotation.y += (targetAngle - char.headGroup.rotation.y) * 0.08;

        // Hafif nefes alma hareketi
        char.group.position.y = Math.sin(elapsedTime * 1.5 + idx) * 0.015;

        // Oylama pulunun rengi
        if (phase === 'VOTING') {
          if (hasVoted) {
            char.votePlate.material.color.setHex(0x065f46); // Yeşil kapalı oy
          } else {
            char.votePlate.material.color.setHex(0x3f3f46); // Bekliyor
          }
        } else if (lastVote) {
          if (lastVote === 'YES') {
            char.votePlate.material.color.setHex(0x10b981); // Açık EVET
          } else {
            char.votePlate.material.color.setHex(0xe11d48); // Açık HAYIR
          }
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!currentMount) return;
      const w = currentMount.clientWidth;
      const h = currentMount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [players, votes, lastVoteItem, bluePolicies, redPolicies, chaosCounter, currentClaim, phase]);

  return (
    <div className="relative w-full h-[380px] sm:h-[440px] md:h-[480px] rounded-3xl overflow-hidden shadow-2xl border border-zinc-800">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      
      {/* 3D Sahne Üzerinde Karakter Konuşma / Tepki Baloncukları HUD */}
      <div className="absolute inset-0 pointer-events-none">
        {players.filter(p => p.id !== yourId).map(p => {
          if (!p.bubble) return null;
          return (
            <div 
              key={p.id}
              className={`absolute transition-all duration-300 transform -translate-x-1/2 ${
                p.id === 'bot-1' ? 'left-[22%] top-[24%]' :
                p.id === 'bot-2' ? 'left-[50%] top-[14%]' :
                p.id === 'bot-3' ? 'left-[78%] top-[24%]' :
                'left-[84%] top-[42%]'
              }`}
            >
              <div className="bg-amber-100 text-zinc-950 border-2 border-zinc-950 px-3 py-1 rounded-full text-xs font-black font-serif shadow-2xl animate-bounce">
                {p.bubble}
              </div>
              <div className="w-2.5 h-2.5 bg-amber-100 border-r-2 border-b-2 border-zinc-950 transform rotate-45 mx-auto -mt-1.5" />
            </div>
          );
        })}
      </div>

      {/* 3D Kontrol İpucu */}
      <div className="absolute top-3 left-4 text-[10px] font-mono text-zinc-400 bg-zinc-900/80 px-2.5 py-1 rounded-md border border-zinc-700/60 pointer-events-none backdrop-blur">
        🎥 3D Masaüstü Perspektifi (Fareyle hafifçe açıyı değiştirebilirsin)
      </div>
    </div>
  );
}
