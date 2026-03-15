import type { RuntimeEnvMap } from "@/lib/runtime-env";

/**
 * Injects cross-browser/cross-device compatibility CSS and meta tags
 * to ensure the iframe game works on all browsers and devices.
 */
export function injectCompatibilityLayer(html: string): string {
  const compatCSS = `<style data-gameforge-compat>
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
canvas { display: block; touch-action: none; }
</style>`;

  const compatMeta = `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`;

  const hasViewport = /name\s*=\s*["']viewport["']/i.test(html);

  if (/<head[^>]*>/i.test(html)) {
    let result = html;
    if (!hasViewport) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>${compatMeta}`);
    }
    // Insert compat CSS right after <head> (after potential meta injection)
    result = result.replace(/<head([^>]*)>/i, `<head$1>${compatCSS}`);
    return result;
  }

  return `${!hasViewport ? compatMeta : ""}${compatCSS}${html}`;
}

/**
 * Patches Element.requestPointerLock so that failures (e.g. sandbox restrictions)
 * are silently caught instead of throwing and crashing the game.
 * Injected before any game code runs.
 */
export function injectPointerLockShim(html: string): string {
  const shim = `<script>(function(){
  var orig = Element.prototype.requestPointerLock;
  if (!orig) return;
  Element.prototype.requestPointerLock = function() {
    try {
      var result = orig.apply(this, arguments);
      if (result && typeof result.catch === "function") {
        return result.catch(function() {});
      }
      return result;
    } catch(_e) {}
  };
})();<\/script>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${shim}`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${shim}`);
  }
  return `${shim}${html}`;
}

/**
 * Injects a script that ensures the iframe window grabs focus on any
 * pointerdown/click. This is critical when embedded inside Dockview,
 * which steals focus to the panel container on activation.
 */
export function injectFocusBridge(html: string): string {
  const script = `<script>(function(){
  function grab(){window.focus();}
  document.addEventListener("pointerdown",grab,true);
  document.addEventListener("click",grab,true);
  window.addEventListener("load",function(){
    setTimeout(grab,50);
  });
})();<\/script>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${script}`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${script}`);
  }
  return `${script}${html}`;
}
