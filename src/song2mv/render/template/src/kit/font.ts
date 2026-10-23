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

/** Holds the composition's frames until every loadFont() file has loaded */
export function useFonts(): void {
  const [handle] = useState(() => (loading.length ? delayRender("loadFont") : null));
  useEffect(() => {
    if (handle === null) return;
    Promise.all(loading).then((failed) => {
      const e = failed.find(Boolean);
      if (e) cancelRender(new Error(e));
      else continueRender(handle);
    });
  }, [handle]);
}
