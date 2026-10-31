/**
 * เลือกรูป/วิดีโอ ย่อ แล้วส่งขึ้นใบงาน
 *
 * แยกออกมาจากหน้าจอเพราะมีสองที่ที่แนบไฟล์ได้ — ตอนเปิดใบงาน กับในใบงานที่เปิดแล้ว
 * สองที่นี้ต่างกันแค่จังหวะที่ส่งขึ้นเซิร์ฟเวอร์ ส่วนการเลือกไฟล์ การย่อ การทำรูปย่อ
 * และเพดานขนาดเป็นเรื่องเดียวกันทั้งหมด ถ้าปล่อยให้ต่างคนต่างเขียน
 * วันที่แก้เพดานหรือแก้วิธีย่อจะต้องไปตามแก้สองที่ แล้วลืมที่หนึ่งเสมอ
 *
 * รูปถูกย่อในเครื่องก่อนส่งเสมอ ไม่ได้ส่งไฟล์ดิบจากกล้อง เพราะรูปจากมือถือ
 * สมัยนี้ใบละ 2-3 MB ในขณะที่รูปกว้าง 1600 px ก็เห็นรอยรั่วหรือรหัส error
 * ได้ชัดเท่ากันที่ขนาดไม่ถึงหนึ่งในสิบ ช่างหน้างานที่เน็ตไม่ดีคือคนที่ได้ประโยชน์
 * ที่สุดจากตรงนี้ — รอส่งรูป 3 MB ผ่าน 4G ในซอยคือเหตุผลที่คนเลิกส่งรูป
 */
import { Image, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";
import { api, apiErrorMessage, UserFacingError } from "../api/client";
import { showAlert } from "./alert";
import { feedback } from "../components/Feedback";
import { pdfThumbnail } from "./pdf";

/** ไฟล์ที่เลือกไว้แล้วแต่ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์ */
export interface PickedAttachment {
  uri: string;
  name: string;
  type: string;
  kind: "IMAGE" | "VIDEO" | "DOCUMENT";
  /** รูปย่อไว้โชว์ในหน้าจอ — วิดีโอบนเว็บทำไม่ได้ จะเป็น null */
  thumbnailUri: string | null;
}

/** กว้างสุดของรูปที่ส่งขึ้นไป — พอเห็นรายละเอียดหน้างานโดยไม่ต้องส่งไฟล์ดิบ */
const MAX_WIDTH = 1600;
/**
 * รูปเอกสาร (ใบเสนอราคา · บิล · ใบเหลือง · ป้ายรุ่น · เอกสารรถ) ละเอียดกว่ารูปหน้างาน (เจ้าของงานขอ ต.ค. 69)
 * ใบ A4 ที่ตัวเลขเล็กเต็มหน้า กว้าง 1600 คุณภาพ 70% อ่านตัวเลขท้ายใบไม่ออก — ไฟล์ใหญ่ขึ้นราวสองเท่า (ยังไม่ถึง 1 MB)
 * รูปหน้างานคงเดิม: ส่งบ่อยกว่ามาก และดูอาการ ไม่ได้อ่านตัวหนังสือ
 */
const DOC_MAX_WIDTH = 2400;
const DOC_QUALITY = 0.85;
const PHOTO_QUALITY = 0.7;

/** doc = รูปเอกสาร ใช้ความละเอียดสูงกว่า (ดู DOC_MAX_WIDTH) */
export type ImageOptions = { doc?: boolean };
/** รูปย่อที่ส่งไปด้วย ใช้แสดงในหน้าใบงาน เก็บในฐานข้อมูลไม่กี่สิบ KB */
const THUMB_WIDTH = 320;
/** วิดีโอยาวสุดที่รับ — ยาวกว่านี้ไม่ได้ช่วยให้เข้าใจอาการเพิ่ม แต่ไฟล์โตตามตรง */
export const MAX_VIDEO_SECONDS = 60;
/** กี่ไฟล์ต่อใบงาน — ตรงกับเพดานฝั่งเซิร์ฟเวอร์ กันคนเผลออัปทั้งอัลบั้ม */
export const MAX_ATTACHMENTS = 20;

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * ใส่ไฟล์ลง FormData ให้ถูกทางของแต่ละแพลตฟอร์ม
 *
 * บนเว็บ FormData คือของเบราว์เซอร์จริง ๆ ต้องใส่ Blob ถ้าใส่ออบเจ็กต์
 * {uri,name,type} แบบที่ React Native รับ มันจะกลายเป็นข้อความ
 * "[object Object]" แล้วฝั่งเซิร์ฟเวอร์จะไม่เห็นไฟล์เลย — พังแบบเงียบ ๆ
 * ที่หาสาเหตุยากเพราะทุกอย่างดูสำเร็จ
 */
export async function appendFile(form: FormData, field: string, uri: string, name: string, type: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append(field, blob, name);
  } else {
    form.append(field, { uri, name, type } as unknown as Blob);
  }
}

async function shrink(uri: string, width: number, compress: number): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
  const saved = await image.saveAsync({ compress, format: SaveFormat.JPEG });
  return saved.uri;
}

/**
 * เลือกหรือถ่ายรูป แล้วย่อให้เรียบร้อยก่อนคืนกลับ
 *
 * คืน null เมื่อผู้ใช้กดยกเลิกหรือไม่ให้สิทธิ์ — ทั้งสองอย่างไม่ใช่ข้อผิดพลาด
 */
export async function pickImageAttachment(
  fromCamera: boolean,
  onStage?: (label: string) => void,
  opts: ImageOptions = {}
): Promise<PickedAttachment | null> {
  // เว็บเปิดกล้องผ่าน <input capture> ซึ่งไม่ต้องขอสิทธิ์ — ขอผ่าน getUserMedia บนคอมที่ไม่มีกล้อง
  // จะได้ "ไม่อนุญาต" ทั้งที่แค่อยากเลือกไฟล์ (ปุ่มถ่ายทันทีเปิดบนเว็บตั้งแต่ ต.ค. 69)
  const permission =
    fromCamera && Platform.OS === "web"
      ? { granted: true }
      : fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showAlert(
      "ต้องการสิทธิ์",
      fromCamera ? "กรุณาอนุญาตให้แอปใช้กล้อง" : "กรุณาอนุญาตให้แอปเข้าถึงรูปภาพ"
    );
    return null;
  }

  const options = { mediaTypes: ["images"] as ImagePicker.MediaType[], quality: 1 };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) return null;

  onStage?.("กำลังย่อรูป");
  return prepareImage(result.assets[0], opts);
}

/**
 * เลือกจากคลังทีละหลายรูป — กรอบไฟล์ตรวจหน้างานที่ช่างถ่ายมาเป็นชุด
 * กดเลือกทีละรูปสิบรอบคือเหตุผลที่คนส่งแค่รูปเดียว
 */
export async function pickImageAttachments(
  onStage?: (label: string) => void,
  opts: ImageOptions = {}
): Promise<PickedAttachment[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showAlert("ต้องการสิทธิ์", "กรุณาอนุญาตให้แอปเข้าถึงรูปภาพ");
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: 10,
  });
  if (result.canceled) return [];
  const out: PickedAttachment[] = [];
  for (const [i, asset] of result.assets.entries()) {
    onStage?.(result.assets.length > 1 ? `กำลังย่อรูป ${i + 1}/${result.assets.length}` : "กำลังย่อรูป");
    out.push(await prepareImage(asset, opts));
  }
  return out;
}

async function prepareImage(asset: ImagePicker.ImagePickerAsset, opts: ImageOptions): Promise<PickedAttachment> {
  // ย่อก่อนส่งเสมอ ไม่ใช่แค่ลดคุณภาพ — quality อย่างเดียวได้ไฟล์ 1.5-2.5 MB
  // เพราะความกว้างยังเท่าเดิม ต้องลดขนาดภาพจริงถึงจะเหลือหลักแสนไบต์
  // ไม่ขยายรูปที่เล็กกว่าเพดาน — เดิมย่อเป็นกว้าง 1600 เสมอ ภาพแคปหน้าจอ/รูปจาก LINE (กว้าง ~1100)
  // จึงถูกขยายขึ้น ตัวหนังสือแตกเบลอและไฟล์ใหญ่ขึ้นเปล่า ๆ (เจ้าของงานเจอกับใบเสนอราคา ต.ค. 69)
  const cap = opts.doc ? DOC_MAX_WIDTH : MAX_WIDTH;
  const width = asset.width > 0 ? Math.min(asset.width, cap) : cap;
  const uri = await shrink(asset.uri, width, opts.doc ? DOC_QUALITY : PHOTO_QUALITY);
  // ทำรูปย่อจากรูปที่ย่อแล้ว ไม่ใช่จากไฟล์ดิบอีกรอบ — การถอดรหัสรูป 12 ล้าน
  // พิกเซลคือส่วนที่ช้าที่สุดของทั้งขั้นตอน ทำสองรอบคือรอนานเป็นสองเท่า
  // โดยที่รูปย่อขนาด 320 px ออกมาหน้าตาเหมือนกัน
  const thumbnailUri = await shrink(uri, THUMB_WIDTH, 0.5);
  const name = (asset.fileName ?? `photo-${Date.now()}.jpg`).replace(/\.[^.]+$/, "") + ".jpg";
  return { uri, name, type: "image/jpeg", kind: "IMAGE", thumbnailUri };
}

export async function pickVideoAttachment(
  onStage?: (label: string) => void,
  fromCamera = false
): Promise<PickedAttachment | null> {
  const permission =
    fromCamera && Platform.OS === "web"
      ? { granted: true }
      : fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showAlert("ต้องการสิทธิ์", fromCamera ? "กรุณาอนุญาตให้แอปใช้กล้อง" : "กรุณาอนุญาตให้แอปเข้าถึงคลังวิดีโอ");
    return null;
  }

  const options = { mediaTypes: ["videos"] as ImagePicker.MediaType[], videoMaxDuration: MAX_VIDEO_SECONDS };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  // videoMaxDuration ตัดตอนถ่ายใหม่ได้ แต่ไม่กันคลิปเก่าที่เลือกจากคลัง
  if (asset.duration && asset.duration > (MAX_VIDEO_SECONDS + 5) * 1000) {
    showAlert(
      "คลิปยาวเกินไป",
      `รับได้ไม่เกิน ${MAX_VIDEO_SECONDS} วินาที — ตัดให้เหลือเฉพาะช่วงที่เห็นอาการก่อนส่ง`
    );
    return null;
  }

  onStage?.("กำลังเตรียมวิดีโอ");
  return prepareVideo(asset);
}

/**
 * เลือกวิดีโอจากคลังทีละหลายคลิป (เจ้าของงานขอ ต.ค. 69 — แนบไฟล์ได้หลายไฟล์ทีเดียวทั้งระบบ)
 * คลิปที่ยาวเกินถูกตัดออกแล้วบอกชื่อ คลิปที่เหลือยังแนบได้ ไม่ต้องเลือกใหม่ทั้งชุด
 */
export async function pickVideoAttachments(onStage?: (label: string) => void): Promise<PickedAttachment[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showAlert("ต้องการสิทธิ์", "กรุณาอนุญาตให้แอปเข้าถึงคลังวิดีโอ");
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    videoMaxDuration: MAX_VIDEO_SECONDS,
    allowsMultipleSelection: true,
    selectionLimit: 10,
  });
  if (result.canceled) return [];
  const long = result.assets.filter((a) => a.duration && a.duration > (MAX_VIDEO_SECONDS + 5) * 1000);
  if (long.length) {
    showAlert(
      "คลิปยาวเกินไป",
      `รับได้ไม่เกิน ${MAX_VIDEO_SECONDS} วินาที — ไม่ได้แนบ: ${long.map((a) => a.fileName ?? "วิดีโอ").join(", ")}`
    );
  }
  const out: PickedAttachment[] = [];
  const kept = result.assets.filter((a) => !long.includes(a));
  for (const [i, asset] of kept.entries()) {
    onStage?.(kept.length > 1 ? `กำลังเตรียมวิดีโอ ${i + 1}/${kept.length}` : "กำลังเตรียมวิดีโอ");
    out.push(await prepareVideo(asset));
  }
  return out;
}

async function prepareVideo(asset: { uri: string; fileName?: string | null; mimeType?: string | null }): Promise<PickedAttachment> {
  let thumbnailUri: string | null = null;
  try {
    // เว็บทำรูปปกวิดีโอไม่ได้ (expo-video-thumbnails ไม่รองรับ) ปล่อยว่างไว้
    // แล้วแสดงไอคอนแทน ดีกว่าบล็อกไม่ให้ส่งวิดีโอจากคอมพิวเตอร์
    const shot = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
    thumbnailUri = await shrink(shot.uri, THUMB_WIDTH, 0.5);
  } catch {
    thumbnailUri = null;
  }
  const name = asset.fileName ?? `video-${Date.now()}.mp4`;
  const type = asset.mimeType || (name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
  return { uri: asset.uri, name, type, kind: "VIDEO", thumbnailUri };
}

/** ชนิดไฟล์ที่ที่แนบแต่ละที่รับ — ใช้กับไฟล์ที่ลากมาวาง (filesToAttachments) */
export interface AcceptKinds {
  image?: boolean;
  video?: boolean;
  pdf?: boolean;
  /** รูปเป็นรูปเอกสาร — ย่อแบบละเอียด (ดู DOC_MAX_WIDTH) */
  doc?: boolean;
}

/** ข้อความบอกว่าที่นี่รับไฟล์อะไร — ขึ้นตอนลากไฟล์มาวาง และตอนวางไฟล์ผิดชนิด */
export function acceptLabel(accept: AcceptKinds) {
  return [accept.image && "รูป", accept.video && "วิดีโอ", accept.pdf && "PDF"].filter(Boolean).join(" · ");
}

function imageWidth(uri: string): Promise<number> {
  return new Promise((resolve) => Image.getSize(uri, (w) => resolve(w), () => resolve(0)));
}

/** ความยาวคลิป (วินาที) จากไฟล์บนเว็บ — อ่านไม่ได้ให้ผ่านไป เซิร์ฟเวอร์ยังมีเพดานขนาดกันอยู่ */
function videoSeconds(uri: string): Promise<number | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const done = (s: number | null) => {
      clearTimeout(timer);
      v.removeAttribute("src");
      resolve(s);
    };
    const timer = setTimeout(() => done(null), 5000);
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = uri;
  });
}

/** ตรงกับเพดานวิดีโอฝั่งเซิร์ฟเวอร์ (60 MB) — ไฟล์ที่ลากมาวางไม่ผ่านตัวเลือกคลิปที่ตัดความยาวให้ */
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

/**
 * ไฟล์ที่ลากมาวาง (เว็บ — ดู components/FileDropZone) → ไฟล์แนบที่ย่อ/ทำรูปย่อแล้ว แบบเดียวกับที่เลือกผ่านปุ่ม
 *
 * ไฟล์ที่ที่นี่ไม่รับ (ชนิดผิด · ใหญ่เกิน · คลิปยาวเกิน) ถูกตัดออกแล้วบอกชื่อทีเดียว ไฟล์ที่เหลือยังแนบได้
 * — ลากมาทั้งโฟลเดอร์แล้วมีไฟล์ Word ปนมาไฟล์เดียว ไม่ควรทำให้ต้องลากใหม่ทั้งชุด
 */
export async function filesToAttachments(
  files: File[],
  accept: AcceptKinds,
  onStage?: (label: string) => void
): Promise<PickedAttachment[]> {
  const out: PickedAttachment[] = [];
  const rejected: string[] = [];
  for (const [i, file] of files.entries()) {
    const step = files.length > 1 ? ` ${i + 1}/${files.length}` : "";
    const type = file.type || "";
    const uri = URL.createObjectURL(file);
    try {
      if (type.startsWith("image/") && accept.image) {
        onStage?.(`กำลังย่อรูป${step}`);
        out.push(await prepareImage({ uri, width: await imageWidth(uri), height: 0, fileName: file.name } as ImagePicker.ImagePickerAsset, { doc: accept.doc }));
      } else if (type.startsWith("video/") && accept.video) {
        const secs = await videoSeconds(uri);
        if (file.size > MAX_VIDEO_BYTES) rejected.push(`${file.name} (ใหญ่เกิน ${formatSize(MAX_VIDEO_BYTES)})`);
        else if (secs && secs > MAX_VIDEO_SECONDS + 5) rejected.push(`${file.name} (ยาวเกิน ${MAX_VIDEO_SECONDS} วินาที)`);
        else {
          onStage?.(`กำลังเตรียมวิดีโอ${step}`);
          out.push(await prepareVideo({ uri, fileName: file.name, mimeType: type }));
        }
      } else if ((type === "application/pdf" || /\.pdf$/i.test(file.name)) && accept.pdf) {
        if (file.size > MAX_PDF_BYTES) rejected.push(`${file.name} (ใหญ่เกิน ${formatSize(MAX_PDF_BYTES)})`);
        else {
          const name = /\.pdf$/i.test(file.name) ? file.name : `${file.name || "document"}.pdf`;
          out.push({ uri, name, type: "application/pdf", kind: "DOCUMENT", thumbnailUri: await pdfThumbnail(uri) });
        }
      } else {
        rejected.push(file.name);
      }
    } catch {
      // รูปที่เบราว์เซอร์เปิดไม่ได้ (เช่น HEIC จาก iPhone บนคอม Windows) — บอกชื่อ ไม่ทำให้ไฟล์อื่นพัง
      rejected.push(`${file.name} (เปิดไฟล์ไม่ได้)`);
    }
  }
  if (rejected.length) {
    showAlert("บางไฟล์แนบที่นี่ไม่ได้", `ที่นี่รับ ${acceptLabel(accept)} — ไม่ได้แนบ: ${rejected.join(", ")}`);
  }
  return out;
}

/** ตรงกับเพดาน PDF ฝั่งเซิร์ฟเวอร์ — เช็คก่อนส่งจะได้ไม่ต้องรออัปจนจบแล้วค่อยรู้ว่าใหญ่ไป */
const MAX_PDF_BYTES = 15 * 1024 * 1024;

/**
 * เลือก PDF — ใช้เฉพาะใบเสนอราคากับบิล (เซิร์ฟเวอร์ไม่รับ PDF เป็นรูปหน้างาน)
 *
 * ใบเสนอราคาออกจากโปรแกรมบัญชีเป็น PDF อยู่แล้ว ส่งไฟล์ตรง ๆ ตัวเลขคมชัด
 * ไม่ต้องแคปหน้าจอเป็นรูปก่อน ไม่ย่อและไม่มีรูปย่อ — หน้าจอแสดงไอคอนเอกสารแทน
 *
 * เลือกได้หลายไฟล์ — งานเดียวอาจมีใบเสนอราคาค่าอะไหล่กับค่าบริการแยกกัน หรือบิลหลายใบ
 * ไฟล์ที่ใหญ่เกินถูกตัดออกแล้วบอกชื่อ ไฟล์ที่เหลือยังแนบได้ ไม่ต้องเลือกใหม่ทั้งชุด
 */
export async function pickPdfAttachments(): Promise<PickedAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) return [];
  const big = result.assets.filter((a) => a.size && a.size > MAX_PDF_BYTES);
  if (big.length) {
    showAlert("ไฟล์ใหญ่เกินไป", `PDF แนบได้ไม่เกิน ${formatSize(MAX_PDF_BYTES)} — ไม่ได้แนบ: ${big.map((a) => a.name).join(", ")}`);
  }
  const kept = result.assets.filter((a) => !big.includes(a));
  // รูปหน้าแรกเป็นรูปย่อ (เว็บ) — รายการไฟล์แนบเห็นว่าเป็นเอกสารอะไรก่อนกด · ทำไม่ได้ก็แนบได้ตามปกติ
  return Promise.all(
    kept.map(async (asset) => {
      const name = /\.pdf$/i.test(asset.name) ? asset.name : `${asset.name || "document"}.pdf`;
      const thumbnailUri = await pdfThumbnail(asset.uri);
      return { uri: asset.uri, name, type: "application/pdf", kind: "DOCUMENT" as const, thumbnailUri };
    })
  );
}

/** ไอคอนแทนรูปย่อ สำหรับไฟล์ที่ไม่มีรูปย่อ */
export function attachmentIcon(kind: string) {
  return kind === "VIDEO" ? "videocam-outline" : kind === "DOCUMENT" ? "document-text-outline" : "image-outline";
}

/** ส่งไฟล์ที่เลือกไว้ขึ้นใบงานที่มีอยู่แล้ว */
export async function uploadAttachment(
  workOrderId: number,
  file: PickedAttachment,
  /** บอกว่ารูปนี้คืออะไร เช่น NAMEPLATE — ไม่ส่งมาคือรูปอาการธรรมดา */
  role?: string,
  /** หลักฐานเคลม (role CLAIM_*) ต้องบอกว่าเป็นของอะไหล่ชิ้นไหน */
  sparePartId?: number,
  /**
   * ไฟล์นี้เป็นไฟล์ที่เท่าไรของชุด — หลอดในหน้าโหลดเต็มจอนับรวมทั้งชุด (ไฟล์ 3/12 · 40%)
   * ไม่ส่งมา = ไฟล์เดียว · วิดีโอหลายสิบ MB บนเน็ตมือถือใช้เวลาเป็นนาที เห็นแค่ตัวหมุนจะคิดว่าค้าง
   */
  batch: { index: number; total: number } = { index: 0, total: 1 },
  /**
   * quiet = ไม่เปิดหน้าโหลดเต็มจอและหลอดกลาง — ช่องไฟล์เคลมส่งไฟล์ทันทีที่เลือก (ฟอร์มปิดงาน)
   * ถ้าบังทั้งจอทุกครั้งที่เลือกรูป ช่างกรอกช่องอื่นต่อระหว่างรอไม่ได้ ซึ่งเป็นเหตุผลที่ต้องส่งทันที
   * ความคืบหน้าส่งให้ช่องนั้นวาดเองผ่าน onProgress (0–1)
   * parallel = ไม่ให้ตัวกันกดซ้ำของ api/client รวมคำขอนี้กับคำขอแนบอื่นที่ยังไม่เสร็จ (ดูด้านล่าง)
   */
  opts: { quiet?: boolean; onProgress?: (p: number) => void; parallel?: boolean } = {}
): Promise<UploadedAttachment> {
  const form = new FormData();
  await appendFile(form, "file", file.uri, file.name, file.type);
  if (file.thumbnailUri) {
    await appendFile(form, "thumbnail", file.thumbnailUri, "thumb.jpg", "image/jpeg");
  }
  if (role) form.append("role", role);
  if (sparePartId !== undefined) form.append("sparePartId", String(sparePartId));
  // ขึ้นหลอดที่ 0% ทันที ไม่ต้องรอเหตุการณ์แรกจากเบราว์เซอร์ (ไฟล์เล็กบางทีไม่มีเลย)
  if (!opts.quiet) feedback.progress({ done: batch.index, total: batch.total, current: 0 });
  opts.onProgress?.(0);
  const res = await api.post<UploadedAttachment>(`/work-orders/${workOrderId}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    // หน้าโหลดเปิดตอนคำขอเริ่ม (api/client) — ตั้งหลอดหลังจากนั้น ไม่งั้นโดนล้างทิ้งตอนหน้าโหลดปิดระหว่างไฟล์
    onUploadProgress: (e) => {
      const current = e.total ? Math.min(1, e.loaded / e.total) : 0;
      if (!opts.quiet) feedback.progress({ done: batch.index, total: batch.total, current });
      opts.onProgress?.(current);
    },
    loadingText: opts.quiet ? false : "กำลังส่งไฟล์...",
    // ตัวกันกดซ้ำของ api/client เทียบแค่ที่อยู่ (เทียบเนื้อไฟล์ไม่ได้) — ไฟล์เดียวกันที่แนบให้หลายชิ้นพร้อมกันจึงถูกนับเป็นกดซ้ำ
    // คำขอที่สองไม่ถูกส่ง แต่ช่องของชิ้นนั้นขึ้น "แนบแล้ว" ด้วยแถวของชิ้นแรก · ช่องเคลมกันกดซ้ำของตัวเองอยู่แล้ว (ช่องละหนึ่งไฟล์)
    dedupe: opts.parallel ? false : undefined,
  });
  // คืนแถวที่สร้าง — ช่องไฟล์เคลมต้องรู้ id ไว้ลบตอนเลือกไฟล์ใหม่แทน (ไฟล์เดิมยังไม่ได้ส่งกับใบเคลมไหน)
  return res.data;
}

/** แถวไฟล์ที่เซิร์ฟเวอร์สร้างให้ (attachmentShape) — เอาเฉพาะที่ฝั่งแอปใช้ */
export interface UploadedAttachment {
  id: number;
  kind: string;
  role: string | null;
  sparePartId?: number | null;
  fileName: string;
  createdAt: string;
  thumbnailDataUrl?: string | null;
}

/**
 * ส่งหลายไฟล์ต่อกันทีละไฟล์ (หลอดในหน้าโหลดนับรวมทั้งชุด)
 * ไฟล์ที่พังกลางชุดหยุดตรงนั้นแล้วบอกว่าส่งไปแล้วกี่ไฟล์ — ไฟล์ก่อนหน้าขึ้นใบงานแล้ว ไม่ต้องเลือกซ้ำ
 */
export async function uploadAttachments(workOrderId: number, files: PickedAttachment[], role?: string, sparePartId?: number) {
  for (const [index, file] of files.entries()) {
    try {
      await uploadAttachment(workOrderId, file, role, sparePartId, { index, total: files.length });
    } catch (e) {
      if (index === 0) throw e;
      throw new UserFacingError(`ส่งแล้ว ${index} จาก ${files.length} ไฟล์ — ${file.name}: ${apiErrorMessage(e)}`);
    }
  }
}

/** ตัวเลือกไฟล์บางตัวคืนไฟล์เดียว บางตัวคืนหลายไฟล์ — ที่แนบทุกที่รับได้ทั้งสองแบบ */
export function asList(picked: PickedAttachment | PickedAttachment[] | null): PickedAttachment[] {
  return Array.isArray(picked) ? picked : picked ? [picked] : [];
}
