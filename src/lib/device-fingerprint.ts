// Impressão digital do aparelho: sobrevive a limpar o navegador e ao navegador do TikTok.
// Roda apenas no navegador (chamar dentro de useEffect).
export async function getDeviceFingerprint(): Promise<string> {
  const parts: string[] = [];
  try {
    const c = document.createElement("canvas");
    c.width = 240; c.height = 60;
    const x = c.getContext("2d");
    if (x) {
      x.textBaseline = "top"; x.font = "16px Arial"; x.fillStyle = "#f60"; x.fillRect(10, 5, 100, 30);
      x.fillStyle = "#069"; x.fillText("Caminho das Cartas ✨ 7", 4, 20);
      x.fillStyle = "rgba(102,204,0,0.7)"; x.fillText("Caminho das Cartas ✨ 7", 8, 24);
      parts.push(c.toDataURL());
    }
  } catch {}
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      parts.push(String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)));
      parts.push(String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)));
    }
  } catch {}
  parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`, String(window.devicePixelRatio));
  parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "", navigator.language || "");
  parts.push(String(navigator.hardwareConcurrency || ""), String((navigator as any).deviceMemory || ""));
  parts.push(String(navigator.maxTouchPoints || 0), navigator.platform || "");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
