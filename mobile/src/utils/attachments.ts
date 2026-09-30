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
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";
import { api } from "../api/client";
import { showAlert } from "./alert";

/** ไฟล์ที่เลือกไว้แล้วแต่ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์ */
export interface PickedAttachment {
  uri: string;
  name: string;
  type: string;
  kind: "IMAGE" | "VIDEO";
  /** รูปย่อไว้โชว์ในหน้าจอ — วิดีโอบนเว็บทำไม่ได้ จะเป็น null */
  thumbnailUri: string | null;
}

/** กว้างสุดของรูปที่ส่งขึ้นไป — พอเห็นรายละเอียดหน้างานโดยไม่ต้องส่งไฟล์ดิบ */
const MAX_WIDTH = 1600;
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
async function appendFile(form: FormData, field: string, uri: string, name: string, type: string) {
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
  onStage?: (label: string) => void
): Promise<PickedAttachment | null> {
  const permission = fromCamera
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

  const asset = result.assets[0];
  onStage?.("กำลังย่อรูป");
  // ย่อก่อนส่งเสมอ ไม่ใช่แค่ลดคุณภาพ — quality อย่างเดียวได้ไฟล์ 1.5-2.5 MB
  // เพราะความกว้างยังเท่าเดิม ต้องลดขนาดภาพจริงถึงจะเหลือหลักแสนไบต์
  const uri = await shrink(asset.uri, MAX_WIDTH, 0.7);
  // ทำรูปย่อจากรูปที่ย่อแล้ว ไม่ใช่จากไฟล์ดิบอีกรอบ — การถอดรหัสรูป 12 ล้าน
  // พิกเซลคือส่วนที่ช้าที่สุดของทั้งขั้นตอน ทำสองรอบคือรอนานเป็นสองเท่า
  // โดยที่รูปย่อขนาด 320 px ออกมาหน้าตาเหมือนกัน
  const thumbnailUri = await shrink(uri, THUMB_WIDTH, 0.5);
  const name = (asset.fileName ?? `photo-${Date.now()}.jpg`).replace(/\.[^.]+$/, "") + ".jpg";
  return { uri, name, type: "image/jpeg", kind: "IMAGE", thumbnailUri };
}

export async function pickVideoAttachment(
  onStage?: (label: string) => void
): Promise<PickedAttachment | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showAlert("ต้องการสิทธิ์", "กรุณาอนุญาตให้แอปเข้าถึงคลังวิดีโอ");
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    videoMaxDuration: MAX_VIDEO_SECONDS,
  });
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
  const type =
    asset.mimeType ?? (name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
  return { uri: asset.uri, name, type, kind: "VIDEO", thumbnailUri };
}

/** ส่งไฟล์ที่เลือกไว้ขึ้นใบงานที่มีอยู่แล้ว */
export async function uploadAttachment(
  workOrderId: number,
  file: PickedAttachment,
  /** บอกว่ารูปนี้คืออะไร เช่น NAMEPLATE — ไม่ส่งมาคือรูปอาการธรรมดา */
  role?: string
) {
  const form = new FormData();
  await appendFile(form, "file", file.uri, file.name, file.type);
  if (file.thumbnailUri) {
    await appendFile(form, "thumbnail", file.thumbnailUri, "thumb.jpg", "image/jpeg");
  }
  if (role) form.append("role", role);
  await api.post(`/work-orders/${workOrderId}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}
