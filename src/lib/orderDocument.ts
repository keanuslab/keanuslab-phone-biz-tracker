export async function readOrderDocument(file: File, progress: (message: string) => void): Promise<string> {
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose a file smaller than 15 MB.");
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!pdf && !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PDF, PNG, JPEG or WebP file.");
  const { createWorker } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  const recognize = async (image: File | HTMLCanvasElement) => {
    worker ??= await createWorker("eng+deu", 1, {
      logger: (event) => progress(`${event.status} ${Math.round((event.progress ?? 0) * 100)}%`),
    });
    return (await worker.recognize(image)).data.text;
  };
  try {
    if (!pdf) return await recognize(file);
    const pdfjs = await import("pdfjs-dist");
    const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const document = await task.promise;
    try {
      if (document.numPages > 10) throw new Error("Use an order PDF with at most 10 pages.");
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        progress(`Reading page ${pageNumber} of ${document.numPages}`);
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const items = content.items.filter((item): item is import("pdfjs-dist/types/src/display/api").TextItem => "str" in item);
        const rows = new Map<number, { x: number; text: string }[]>();
        for (const item of items) {
          const vertical = Math.round(item.transform[5] / 3) * 3;
          const row = rows.get(vertical) ?? [];
          row.push({ x: item.transform[4], text: item.str });
          rows.set(vertical, row);
        }
        let text = [...rows.entries()].sort(([left], [right]) => right - left)
          .map(([, row]) => row.sort((left, right) => left.x - right.x).map((item) => item.text).join(" ")).join("\n");
        if (text.replace(/\s/g, "").length < 20) {
          const original = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2, 2400 / Math.max(original.width, original.height)) });
          const canvas = documentCanvas(viewport.width, viewport.height);
          await page.render({ canvas, viewport }).promise;
          text = await recognize(canvas);
          canvas.width = canvas.height = 0;
        }
        pages.push(text);
        page.cleanup();
      }
      return pages.join("\n");
    } finally {
      await task.destroy();
    }
  } finally {
    await worker?.terminate();
  }
}

function documentCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  return canvas;
}