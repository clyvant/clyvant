// Loads a composition (videos/<id>/comp.js + build/timeline.json) and exposes the
// frame-stepping API the renderer drives: window.__meta, window.__renderFrame(i).
import { Studio } from './runtime.js';

window.addEventListener('error', (e) => { window.__error = String(e.message || e); });
window.addEventListener('unhandledrejection', (e) => { window.__error = String((e.reason && e.reason.stack) || e.reason); });

(async () => {
  try {
    const comp = new URLSearchParams(location.search).get('comp');
    const tl = await (await fetch(`/${comp}/build/timeline.json`, { cache: 'no-store' })).json();
    const mod = await import(`/${comp}/comp.js`);
    const studio = new Studio(tl, comp);
    window.studio = studio;
    await mod.default(studio);
    await studio.ready();
    window.__meta = { fps: studio.fps, frames: studio.frames, width: 1080, height: 1920 };
    window.__renderFrame = (i) => studio.renderFrame(i);
    window.__ready = true;
  } catch (e) {
    window.__error = String((e && e.stack) || e);
  }
})();
