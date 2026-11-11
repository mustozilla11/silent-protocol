import './index.css';
import { GameEngine } from './engine/index.ts';

/**
 * Adım 1 & 2 Giriş Noktası:
 * Şimdilik yalnızca Headless GameEngine başlatılır; 3D (/render) ve UI (/ui) sonraki adımlarda bağlanacaktır.
 */
const engine = new GameEngine({ humanName: 'Oyuncu' });

declare global {
  interface Window {
    __SECRET_HITLER_ENGINE__?: GameEngine;
  }
}

if (typeof window !== 'undefined') {
  window.__SECRET_HITLER_ENGINE__ = engine;
  console.info('[Headless Engine] Hazır. Mevcut faz:', engine.getState().phase);
}
