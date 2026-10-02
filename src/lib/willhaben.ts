import { detectModel, STORAGE_OPTIONS } from "./models";
import { CONDITIONS } from "./types";

export interface WillhabenDraft {
  url?: string;
  title?: string;
  model?: string;
  storage?: string;
  color?: string;
  condition?: string;
  price?: number;
  battery?: number;
  unlocked?: boolean;
  adCode?: string;
}

/** Returns a normalized willhaben ad URL, or null if the input isn't one. */
export function parseWillhabenUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(host === "willhaben.at" || host === "www.willhaben.at") || !/^\/iad\/kaufen-und-verkaufen\/d\/[a-z0-9-]+-\d{5,}\/?$/i.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

// Ad URLs end in /d/<title-slug>-<numeric id>/
function titleFromUrl(url: URL) {
  const slug = url.pathname.split("/").filter(Boolean).pop() ?? "";
  return decodeURIComponent(slug).replace(/-\d{5,}$/, "").replace(/-/g, " ").trim();
}

// \b doesn't treat umlauts/ß as letters, so use explicit letter lookarounds.
const word = (src: string) => new RegExp(`(?<![a-zäöüß])(?:${src})(?![a-zäöüß])`, "i");

// Most specific first: titanium finishes before plain colour words.
const COLORS: [RegExp, string][] = [
  [word("natur(al)?[ -]?titan(ium)?|titan(ium)?[ -]?natur(al)?"), "Natural Titanium"],
  [word("schwarz[ -]?titan(ium)?|black[ -]?titanium|titan(ium)?[ -]?schwarz"), "Black Titanium"],
  [word("wei(ß|ss)[ -]?titan(ium)?|white[ -]?titanium|titan(ium)?[ -]?wei(ß|ss)"), "White Titanium"],
  [word("blau[ -]?titan(ium)?|blue[ -]?titanium|titan(ium)?[ -]?blau"), "Blue Titanium"],
  [word("w(ü|ue)sten[ -]?titan(ium)?|desert[ -]?titanium"), "Desert Titanium"],
  [word("schwarz|black|mitternacht|midnight|graphit|graphite|space ?(grau|gray|grey)|phantom black"), "Black"],
  [word("wei(ß|ss)|white|polarstern|starlight|silber|silver"), "White / Silver"],
  [word("blau|blue|sierrablau|sierra blue|pazifikblau|pacific blue"), "Blue"],
  [word("gr(ü|ue)n|green|alpine green"), "Green"],
  [word("rot|red|product ?red"), "Red"],
  [word("gold"), "Gold"],
  [word("violett|lila|purple|lavender"), "Purple"],
  [word("rosa|pink|ros(é|e) ?gold"), "Pink"],
  [word("gelb|yellow"), "Yellow"],
  [word("titan|titanium"), "Titanium"],
];

function parsePrice(text: string) {
  for (const m of text.matchAll(/€[ \t\u00a0]*([\d.]+(?:,\d{1,2})?)|([\d.]+(?:,\d{1,2})?)[ \t\u00a0]*€/g)) {
    // Skip shipping costs like "Versand ab € 9,70".
    if (/(versand|ab)\s*$/i.test(text.slice(Math.max(0, m.index - 15), m.index))) continue;
    const n = Number((m[1] ?? m[2]).replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n < 100_000) return n;
  }
  return undefined;
}

function parseStorage(text: string) {
  const found = [...text.matchAll(/(\d{2,4})\s*(GB|TB)\b/gi)].map((m) => `${m[1]}${m[2].toUpperCase()}`);
  const valid = found.filter((s) => STORAGE_OPTIONS.includes(s));
  // RAM is also given in GB, so prefer the largest valid storage size mentioned.
  return valid.sort((a, b) => STORAGE_OPTIONS.indexOf(b) - STORAGE_OPTIONS.indexOf(a))[0];
}

function parseCondition(text: string, adOnly: string) {
  if (word("defekt|kaputt|gebrochen|broken|f(ü|ue)r bastler").test(adOnly)) return CONDITIONS[3];
  const z = text.match(/Zustand\s*:?\s*(neu(wertig)?|wie neu|sehr gut|gut|gebraucht)/i)?.[1]?.toLowerCase();
  if (!z) {
    if (/neuwertig|wie neu|ungeöffnet|originalverpackt/i.test(adOnly)) return CONDITIONS[0];
    if (/sehr gut(?:er|em|en|e)?\s+Zustand|Zustand\s+(?:ist\s+)?sehr gut/i.test(adOnly)) return CONDITIONS[1];
    if (/gut(?:er|em|en|e)?\s+Zustand|Zustand\s+(?:ist\s+)?gut/i.test(adOnly)) return CONDITIONS[2];
    return undefined;
  }
  if (z.startsWith("neu") || z === "wie neu") return CONDITIONS[0];
  return CONDITIONS[1];
}

/** Extracts device details from a willhaben link and/or pasted ad text. */
export function parseWillhaben(urlInput: string, pastedText: string, usedModels: string[] = []): WillhabenDraft {
  const url = parseWillhabenUrl(urlInput);
  const title = url ? titleFromUrl(url) : undefined;
  const text = pastedText.slice(0, 20_000);
  const all = `${title ?? ""}\n${text}`;

  const colorLabel = text.match(/Farbe\s*:?\s*([A-Za-zÄÖÜäöüß ]{3,30})/)?.[1];
  const description = text.match(/Beschreibung\s*([\s\S]{0,600})/)?.[1] ?? "";
  const color = COLORS.find(([re]) => [colorLabel, title, description].some((s) => s && re.test(s)))?.[1];
  const battery = Number(
    text.match(/(\d{2,3})\s?%\s*(?:akku|batterie|battery)/i)?.[1] ?? text.match(/(?:akku|batterie|battery)[a-zäöü]*\s*:?\s*(\d{2,3})\s?%/i)?.[1],
  );

  return {
    url: url?.toString(),
    title,
    model: detectModel(`${title ?? ""} ${text.slice(0, 2000)}`, usedModels),
    storage: parseStorage(all),
    color,
    condition: parseCondition(all, `${title ?? ""}\n${description}`),
    price: parsePrice(text),
    battery: battery >= 50 && battery <= 100 ? battery : undefined,
    unlocked: /entsperrt\s*:?\s*ja|ohne sim-?lock|sim-?lock[ -]?frei/i.test(text) || undefined,
    adCode: text.match(/willhaben-Code\s*:?\s*(\d{6,})/i)?.[1],
  };
}
