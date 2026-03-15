const DEFAULT_RENDER_DELAY_MS = 1_500;
const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;
const JPEG_QUALITY = 0.7;

/**
 * This script is injected BEFORE any game code runs.
 * It monkey-patches getContext so every WebGL canvas gets preserveDrawingBuffer: true,
 * and hooks requestAnimationFrame to capture right after a game render callback.
 */
const PREAMBLE_SCRIPT = `<script>(function(){
  // Force preserveDrawingBuffer on all WebGL contexts
  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
      attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attrs);
  };
})();<\/script>`;

function buildCaptureScript(delayMs: number) {
  return `<script>(function(){
  var CHANNEL = "__gf_thumb__";
  var DELAY = ${delayMs};
  var sent = false;

  function send(url) {
    if (sent) return;
    sent = true;
    parent.postMessage({ channel: CHANNEL, dataUrl: url }, "*");
  }

  function isNonBlack(canvas) {
    try {
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return true; // can't check, assume ok
      var data = ctx.getImageData(0, 0, Math.min(canvas.width, 64), Math.min(canvas.height, 64)).data;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i] > 10 || data[i+1] > 10 || data[i+2] > 10) return true;
      }
      return false;
    } catch(e) {
      return true; // cross-origin or WebGL, assume ok
    }
  }

  function captureCanvas(canvas) {
    try {
      var url = canvas.toDataURL("image/jpeg", ${JPEG_QUALITY});
      if (url && url.length > 200 && url !== "data:,") {
        send(url);
        return true;
      }
    } catch(e) {}
    return false;
  }

  // Hook into requestAnimationFrame to capture right after a game render
  var frameCount = 0;
  var captureAfterFrame = false;
  var origRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function(cb) {
    return origRAF.call(window, function(ts) {
      cb(ts);
      frameCount++;
      if (captureAfterFrame) {
        captureAfterFrame = false;
        var canvas = document.querySelector("canvas");
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          captureCanvas(canvas);
        }
      }
    });
  };

  function tryCapture() {
    if (sent) return;
    var canvas = document.querySelector("canvas");
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      // Try direct capture first
      var url = canvas.toDataURL("image/jpeg", ${JPEG_QUALITY});
      if (url && url.length > 200 && url !== "data:,") {
        // Check if it's not all black by drawing to a temp canvas
        var tmp = document.createElement("canvas");
        tmp.width = 32; tmp.height = 32;
        var tmpCtx = tmp.getContext("2d");
        if (tmpCtx) {
          tmpCtx.drawImage(canvas, 0, 0, 32, 32);
          if (isNonBlack(tmp)) {
            send(url);
            return;
          }
        } else {
          // Can't verify, just send it
          send(url);
          return;
        }
      }
      // Direct capture was black/empty, schedule capture after next render frame
      captureAfterFrame = true;
      return;
    }
    // No canvas found yet
  }

  // Retry periodically until delay is reached
  var start = Date.now();
  var interval = setInterval(function() {
    if (sent) { clearInterval(interval); return; }
    if (Date.now() - start > DELAY) {
      clearInterval(interval);
      // Final attempt
      tryCapture();
      if (!sent) {
        // Last resort: capture after one more frame
        captureAfterFrame = true;
        setTimeout(function() {
          if (!sent) fallbackCapture();
        }, 1000);
      }
      return;
    }
    tryCapture();
  }, 300);

  function fallbackCapture() {
    if (sent) return;
    try {
      var w = Math.min(document.documentElement.scrollWidth || 800, 1280);
      var h = Math.min(document.documentElement.scrollHeight || 600, 720);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">'
        + '<foreignObject width="100%" height="100%">'
        + new XMLSerializer().serializeToString(document.documentElement)
        + '</foreignObject></svg>';
      var img = new Image();
      var blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      var blobUrl = URL.createObjectURL(blob);
      img.onload = function() {
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        var ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          send(c.toDataURL("image/jpeg", ${JPEG_QUALITY}));
        } else {
          send(null);
        }
        URL.revokeObjectURL(blobUrl);
      };
      img.onerror = function() {
        send(null);
        URL.revokeObjectURL(blobUrl);
      };
      img.src = blobUrl;
    } catch (e) {
      send(null);
    }
  }
})();<\/script>`;
}

export interface CaptureOptions {
  delayMs?: number;
}

export function captureThumbnail(
  gameCode: string,
  options?: CaptureOptions,
): Promise<string | null> {
  const delayMs = options?.delayMs ?? DEFAULT_RENDER_DELAY_MS;
  const timeoutMs = delayMs + 6_000;

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;border:none;opacity:0;pointer-events:none;";
    iframe.sandbox.add("allow-scripts", "allow-same-origin");

    let resolved = false;
    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      window.removeEventListener("message", onMessage);
    };
    const finish = (dataUrl: string | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      if (!dataUrl) {
        resolve(null);
        return;
      }
      resizeDataUrl(dataUrl, THUMB_WIDTH, THUMB_HEIGHT)
        .then(resolve)
        .catch(() => resolve(dataUrl));
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    const onMessage = (event: MessageEvent) => {
      if (event.data?.channel !== "__gf_thumb__") return;
      clearTimeout(timer);
      finish(event.data.dataUrl ?? null);
    };

    window.addEventListener("message", onMessage);

    // Inject preamble BEFORE game code (patches getContext)
    // Inject capture script AFTER game code
    const captureScript = buildCaptureScript(delayMs);
    let srcDoc = gameCode;

    // Insert preamble as early as possible (before any scripts)
    if (/<head[^>]*>/i.test(srcDoc)) {
      srcDoc = srcDoc.replace(/<head([^>]*)>/i, `<head$1>${PREAMBLE_SCRIPT}`);
    } else if (/<html[^>]*>/i.test(srcDoc)) {
      srcDoc = srcDoc.replace(/<html([^>]*)>/i, `<html$1>${PREAMBLE_SCRIPT}`);
    } else {
      srcDoc = `${PREAMBLE_SCRIPT}${srcDoc}`;
    }

    // Insert capture script at end of body/head
    if (/<\/body>/i.test(srcDoc)) {
      srcDoc = srcDoc.replace(/<\/body>/i, `${captureScript}</body>`);
    } else if (/<\/html>/i.test(srcDoc)) {
      srcDoc = srcDoc.replace(/<\/html>/i, `${captureScript}</html>`);
    } else {
      srcDoc = `${srcDoc}${captureScript}`;
    }

    iframe.srcdoc = srcDoc;
    document.body.appendChild(iframe);
  });
}

export function resizeDataUrl(
  dataUrl: string,
  maxW: number,
  maxH: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
