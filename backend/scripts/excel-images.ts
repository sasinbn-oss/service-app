/**
 * Extracts images that Excel stores "in the cell" (Insert > Picture > Place in
 * Cell), which is how modern Excel embeds product photos.
 *
 * ExcelJS cannot read these — it reports the cell as a #VALUE! error — because
 * the picture is not a drawing anchored over the sheet but a *rich value*
 * referenced from the cell through several layers of indirection:
 *
 *   cell@vm  ->  metadata.xml valueMetadata[vm-1].rc@v
 *            ->  metadata.xml futureMetadata[that].rvb@i
 *            ->  rdrichvalue.xml rv[that] first <v>
 *            ->  richValueRel.xml rel[that]@r:id
 *            ->  richValueRel.xml.rels  ->  xl/media/imageN.png
 *
 * We walk that chain and return a map of row number -> image bytes.
 */
import JSZip from "jszip";
import fs from "fs";

export interface ExtractedImage {
  buffer: Buffer;
  mimeType: string;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

function matchAll(xml: string, pattern: RegExp): RegExpMatchArray[] {
  return Array.from(xml.matchAll(pattern));
}

export async function extractInCellImages(
  filePath: string
): Promise<Map<number, ExtractedImage>> {
  const result = new Map<number, ExtractedImage>();

  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const readText = async (name: string): Promise<string | null> => {
    const file = zip.file(name);
    return file ? file.async("text") : null;
  };

  const [sheetXml, metadataXml, richValueXml, richValueRelXml, richValueRelsXml] =
    await Promise.all([
      readText("xl/worksheets/sheet1.xml"),
      readText("xl/metadata.xml"),
      readText("xl/richData/rdrichvalue.xml"),
      readText("xl/richData/richValueRel.xml"),
      readText("xl/richData/_rels/richValueRel.xml.rels"),
    ]);

  // Any missing link in the chain simply means this workbook has no in-cell
  // images, which is a normal case rather than an error.
  if (!sheetXml || !metadataXml || !richValueXml || !richValueRelXml || !richValueRelsXml) {
    return result;
  }

  // vm index (1-based) -> rich value index
  const valueMetadataBlock = metadataXml.match(/<valueMetadata[^>]*>([\s\S]*?)<\/valueMetadata>/);
  const futureMetadataBlock = metadataXml.match(
    /<futureMetadata[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/
  );
  if (!valueMetadataBlock || !futureMetadataBlock) return result;

  const futureIndexes = matchAll(futureMetadataBlock[1], /<xlrd:rvb\s+i="(\d+)"\s*\/>/g).map((m) =>
    Number(m[1])
  );
  const valueToFuture = matchAll(valueMetadataBlock[1], /<rc[^>]*\sv="(\d+)"[^>]*\/>/g).map((m) =>
    Number(m[1])
  );

  // rich value index -> richValueRel index (the first <v> of each <rv>)
  const richValueToRel = matchAll(richValueXml, /<rv[^>]*>([\s\S]*?)<\/rv>/g).map((m) => {
    const firstValue = m[1].match(/<v>(\d+)<\/v>/);
    return firstValue ? Number(firstValue[1]) : -1;
  });

  // richValueRel index -> relationship id -> media path
  const relIds = matchAll(richValueRelXml, /<rel\s+r:id="([^"]+)"\s*\/>/g).map((m) => m[1]);
  const relTargets = new Map<string, string>();
  for (const m of matchAll(richValueRelsXml, /<Relationship\s+([^>]*)\/>/g)) {
    const id = m[1].match(/Id="([^"]+)"/)?.[1];
    const target = m[1].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relTargets.set(id, target);
  }

  // Finally, walk every cell that carries a vm attribute.
  for (const cell of matchAll(sheetXml, /<c\s+r="([A-Z]+)(\d+)"[^>]*\svm="(\d+)"[^>]*/g)) {
    const rowNumber = Number(cell[2]);
    const vm = Number(cell[3]);

    const futureIdx = valueToFuture[vm - 1];
    if (futureIdx === undefined) continue;
    const richValueIdx = futureIndexes[futureIdx];
    if (richValueIdx === undefined) continue;
    const relIdx = richValueToRel[richValueIdx];
    if (relIdx === undefined || relIdx < 0) continue;
    const relId = relIds[relIdx];
    if (!relId) continue;
    const target = relTargets.get(relId);
    if (!target) continue;

    const mediaPath = `xl/${target.replace(/^\.\.\//, "")}`;
    const mediaFile = zip.file(mediaPath);
    if (!mediaFile) continue;

    const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "";
    result.set(rowNumber, {
      buffer: await mediaFile.async("nodebuffer"),
      mimeType: MIME_BY_EXT[ext] ?? "image/png",
    });
  }

  return result;
}
