import './index.css';
import { GameEngine } from './engine/index.ts';
import { TableScene } from './render/index.ts';

/**
 * Adım 3 Giriş Noktası:
 * - GameEngine bağımsız başsız kural motoru olarak başlatılır.
 * - TableScene yalnızca tam ekran #game-canvas üzerine 3D masa, loş aydınlatma,
 *   orbit/pan kamera ve Liberal/Faşist board düz plakalarını kurar.
 */
const engine = new GameEngine({ humanName: 'Oyuncu' });

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#game-canvas element bulunamadı.');
}

const tableScene = new TableScene({ canvas });

declare global {
  interface Window {
    __SECRET_HITLER_ENGINE__?: GameEngine;
    __SECRET_HITLER_SCENE__?: TableScene;
  }
}

window.__SECRET_HITLER_ENGINE__ = engine;
window.__SECRET_HITLER_SCENE__ = tableScene;
