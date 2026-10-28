import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

const loading: Promise<string | null>[] = [];

/**
 * A font file from src/ under a family name. Returns the family for `fontFamily`, a fallback after it:
 *
 *   import lilita from "../fonts/LilitaOne-Regular.ttf";
 *   export const DISPLAY = loadFont("Lilita One", lilita);   // '"Lilita One", sans-serif'
 *
 * Call it at the top of a module. Every frame waits for the file (the compositions call useFonts), and naming the
 * family in song.json's `theme.font` sets the captions in it too. `weight` defaults to the whole range, so bold text
 * uses the file as drawn. Not delayRender() at the top of a module: Remotion's entry, which runs after it, drops the
 * handle, and the timer left behind fails every render longer than its timeout.
 */
export function loadFont(family: string, url: string, o: { weight?: string; style?: string; fallback?: string } = {}): string {
  if (typeof FontFace !== "undefined") {
    const face = new FontFace(family, `url("${url}")`, { weight: o.weight ?? "100 900", style: o.style ?? "normal" });
    loading.push(face.load().then((f) => {
      document.fonts.add(f);
      return null;
    }, (e) => `loadFont: "${family}" from ${url} did not load (${e})`));
  }
  return `"${family}", ${o.fallback ?? "sans-serif"}`;
}

/**
 * Holds the composition's frames until every loadFont() file has loaded. Given the theme's `font`, it warns when none of
 * the families it names is loaded or installed: the text would fall back to the browser's default without a word.
 */
export function useFonts(font?: string): void {
  const [handle] = useState(() => (loading.length ? delayRender("loadFont") : null));
  useEffect(() => {
    if (handle === null) return warnUnloaded(font);
    Promise.all(loading).then((failed) => {
      const e = failed.find(Boolean);
      if (e) return cancelRender(new Error(e));
      warnUnloaded(font);
      continueRender(handle);
    });
  }, [handle]);
}

const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "emoji", "math"]);
let warned = false;

/** Logged by the main tab only, once per render, as the storyboard's warnings are */
function warnUnloaded(font: string | undefined) {
  const named = (font ?? "").split(",").map((f) => f.trim().replace(/^["']|["']$/g, "")).filter((f) => f && !GENERIC.has(f));
  if (warned || !named.length || typeof document === "undefined" || window.remotion_isMainTab === false) return;
  const g = document.createElement("canvas").getContext("2d");
  if (!g) return;
  const width = (f: string) => {
    g.font = `40px ${f}`;
    return g.measureText("Hamburgefonstiv 가나다 0123").width;
  };
  if (named.some((f) => ["serif", "monospace"].some((d) => width(`"${f}", ${d}`) !== width(d)))) return;
  warned = true;
  console.warn(`theme.font: ${named.map((f) => `"${f}"`).join(", ")} ${named.length > 1 ? "are" : "is"} neither loaded nor `
    + "installed, so text falls back to the browser's default: import the module that calls loadFont()");
}
