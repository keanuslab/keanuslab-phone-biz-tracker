const AD_PATH = /^\/iad\/kaufen-und-verkaufen\/d\/[a-z0-9-]+-\d{5,}\/?$/i;
const MAX_HTML_BYTES = 3_000_000;

export function validWillhabenUrl(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || !["willhaben.at", "www.willhaben.at"].includes(url.hostname.toLowerCase()) || !AD_PATH.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function plainText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, (entity) => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity.toLowerCase()] ?? entity)
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function parseWillhabenPage(html, url) {
  const script = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) throw new Error("The listing data could not be read.");
  let ad;
  try {
    ad = JSON.parse(script).props?.pageProps?.advertDetails;
  } catch {
    throw new Error("The listing data could not be read.");
  }
  const expectedId = url.pathname.match(/-(\d{5,})\/?$/)?.[1];
  if (!ad || String(ad.id) !== expectedId) throw new Error("This listing is unavailable or has expired.");
  const attributes = Object.fromEntries((ad.attributes?.attribute ?? []).map((entry) => [entry.name, entry.values?.[0]]));
  const image = html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const imageUrl = image && /^https:\/\/cache\.willhaben\.at\//i.test(image) ? image : undefined;
  const price = Number(String(attributes["PRICE/AMOUNT"] ?? attributes.PRICE ?? "").replace(",", "."));
  const title = plainText(ad.description).slice(0, 200);
  if (!title) throw new Error("The listing title could not be read.");
  return {
    url: url.toString(),
    adCode: String(ad.id),
    title,
    description: plainText(attributes.DESCRIPTION).slice(0, 10_000),
    price: Number.isFinite(price) && price > 0 ? price : undefined,
    imageUrl,
  };
}

export async function fetchWillhabenListing(input, fetcher = fetch) {
  const url = validWillhabenUrl(input);
  if (!url) throw new Error("Enter a valid willhaben listing link.");
  const response = await fetcher(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PhoneBiz/1.0)", Accept: "text/html" },
  });
  if (!response.ok || response.status >= 300) throw new Error("The listing could not be loaded. It may have expired or blocked automated access.");
  if (!response.headers.get("content-type")?.includes("text/html")) throw new Error("The listing returned an unexpected response.");
  if (Number(response.headers.get("content-length")) > MAX_HTML_BYTES) throw new Error("The listing page is too large.");
  const chunks = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The listing returned an empty response.");
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) throw new Error("The listing page is too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseWillhabenPage(new TextDecoder().decode(bytes), url);
}
