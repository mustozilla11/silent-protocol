import './index.css';
import { GameEngine } from './engine/index.ts';
import { TableScene } from './render/index.ts';
import { GameOverlay } from './ui/index.ts';

/**
 * Adım 4 Giriş Noktası:
 * - /engine: Saf başsız Secret Hitler kural motoru
 * - /render: 3D Masa & Board düz plakaları (henüz olaylara bağlı kart/oyuncu animasyonları yok; Adım 5)
 * - /ui: Canvas üzerine position: absolute / fixed ile oturan HTML/Tailwind arayüz katmanı
 */
const engine = new GameEngine({ humanName: 'Sen' });

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#game-canvas element bulunamadı.');
}

const overlayEl = document.getElementById('ui-overlay');
if (!(overlayEl instanceof HTMLElement)) {
  throw new Error('#ui-overlay element bulunamadı.');
}

const tableScene = new TableScene({ canvas });
const uiOverlay = new GameOverlay(overlayEl, engine);

declare global {
  interface Window {
    __SECRET_HITLER_ENGINE__?: GameEngine;
    __SECRET_HITLER_SCENE__?: TableScene;
    __SECRET_HITLER_UI__?: GameOverlay;
  }
}

window.__SECRET_HITLER_ENGINE__ = engine;
window.__SECRET_HITLER_SCENE__ = tableScene;
window.__SECRET_HITLER_UI__ = uiOverlay;
