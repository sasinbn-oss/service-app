/**
 * ที่เก็บไฟล์แนบของใบงาน — Cloudflare R2
 *
 * ทำไมไม่เก็บลงฐานข้อมูลเหมือนรูปอะไหล่
 * ---------------------------------------
 * รูปอะไหล่มีตัวละรูป ทั้งระบบไม่กี่ร้อยรูป เก็บลง Postgres ได้สบาย
 * แต่ไฟล์แนบใบงานคนละเรื่อง — ช่างถ่ายงานละ 3-5 รูป บางงานถ่ายวิดีโอ
 * คลิปเดียว 1 นาทีก็ใหญ่กว่าข้อมูลทั้งระบบรวมกันแล้ว ถ้าเก็บลงฐานข้อมูล
 * ค่าที่เก็บจะแพงขึ้นเป็นร้อยเท่าโดยไม่ได้อะไรกลับมา
 *
 * R2 คิดค่าที่เก็บ $0.015 ต่อ GB ต่อเดือน และไม่คิดค่าโหลดออก (egress)
 * ซึ่งสำคัญกว่าราคาที่เก็บสำหรับงานแบบนี้ เพราะช่างกับหัวหน้าภาคเปิดดูรูป
 * ซ้ำ ๆ ทุกวัน ที่เก็บเจ้าอื่นคิดเงินทุกครั้งที่เปิด
 *
 * ทำไมถังต้องไม่เปิดสาธารณะ
 * ---------------------------
 * รูปในนี้เป็นภาพหน้าร้านลูกค้า ป้ายชื่อสาขา บางทีติดคนในภาพด้วย
 * ถ้าเปิดถังเป็น public ใครเดา URL ถูกก็เปิดดูได้หมดโดยไม่ต้องล็อกอิน
 * จึงใช้วิธีขอลิงก์ชั่วคราว (presigned URL) จากเซิร์ฟเวอร์ทีละครั้งแทน
 * ลิงก์หมดอายุใน 2 ชั่วโมง เท่ากับลิงก์โหลดเอกสารที่ระบบใช้อยู่แล้ว
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** อายุลิงก์ชั่วคราว — เท่ากับลิงก์โหลดเอกสารในระบบ ให้คนใช้จำง่ายว่า "2 ชั่วโมง" */
export const SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

let cachedClient: S3Client | null = null;

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  // ปกติ endpoint เดาได้จาก account id แต่เปิดให้ทับได้เผื่อวันหนึ่งย้ายไป
  // S3-compatible เจ้าอื่น โค้ดทั้งไฟล์นี้เป็น S3 มาตรฐาน ไม่มีอะไรผูกกับ R2
  const endpoint =
    process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;

  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

export function isR2Configured(): boolean {
  return readConfig() !== null;
}

function getClient(): { client: S3Client; bucket: string } {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า R2 — ต้องมี R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY และ R2_BUCKET"
    );
  }

  if (!cachedClient) {
    cachedClient = new S3Client({
      // R2 ไม่มี region จริง แต่ SDK บังคับให้ใส่ ค่าที่ Cloudflare กำหนดคือ "auto"
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client: cachedClient, bucket: config.bucket };
}

/**
 * ตัดชื่อไฟล์ให้ปลอดภัย
 *
 * ชื่อไฟล์มาจากมือถือของช่าง มีทั้งภาษาไทย ช่องว่าง วงเล็บ และบางเครื่อง
 * ใส่ path มาเต็ม ๆ ถ้าเอาไปต่อเป็น key ตรง ๆ จะได้โฟลเดอร์แปลก ๆ ใน R2
 * หรือชนกับไฟล์อื่น ตรงนี้เก็บแค่นามสกุลกับตัวอักษรที่ปลอดภัย
 * ส่วนชื่อจริงที่ช่างเห็นเก็บไว้ในฐานข้อมูล (fileName) ไม่ได้หายไปไหน
 */
export function safeName(name: string): string {
  const base = name.trim().split(/[\\/]/).pop() || "file";
  const cleaned = base
    .normalize("NFC")
    .replace(/[^\w.\-฀-๿]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned || "file";
}

/**
 * ที่อยู่ของไฟล์ในถัง
 *
 * แยกโฟลเดอร์ตามใบงานเพราะเวลามีเรื่องต้องไล่ดูย้อนหลัง คนจะเปิดจาก
 * เลขใบงานเสมอ ไม่มีใครไล่จากชื่อไฟล์ และวันหนึ่งถ้าต้องลบไฟล์เก่าทิ้ง
 * ตามนโยบายเก็บ 3 เดือน ลบทั้งโฟลเดอร์ง่ายกว่าไล่ทีละไฟล์
 *
 * ใส่ timestamp นำหน้าชื่อไฟล์ เพราะกล้องมือถือตั้งชื่อซ้ำกันบ่อยมาก
 * (IMG_0001.jpg ของช่างสองคนคนละรูป) ถ้าไม่กันไว้ไฟล์หลังทับไฟล์แรก
 */
export function buildObjectKey(workOrderCode: string, fileName: string): string {
  return `work-orders/${workOrderCode}/${Date.now()}-${safeName(fileName)}`;
}

export async function uploadObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
}

/**
 * ลิงก์ชั่วคราวสำหรับเปิดไฟล์
 *
 * ใส่ชื่อไฟล์จริงกลับเข้าไปใน header ด้วย ไม่งั้นเวลากดโหลดจะได้ไฟล์ชื่อ
 * 1759000000-IMG-0001.jpg ซึ่งไม่มีใครรู้ว่าของใบงานไหน
 */
export async function getDownloadUrl(
  key: string,
  options: { fileName?: string; inline?: boolean } = {}
): Promise<string> {
  const { client, bucket } = getClient();
  const disposition = options.fileName
    ? `${options.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(
        options.fileName
      )}`
    : undefined;

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: disposition,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * เช็คว่าต่อ R2 ได้จริงไหม
 *
 * บอกให้ชัดว่าพังตรงไหน เพราะเวลาตั้งค่าผิดอาการเหมือนกันหมด (อัปไม่ขึ้น)
 * แต่สาเหตุคนละเรื่อง: ยังไม่ใส่ค่า / คีย์ผิด / พิมพ์ชื่อถังผิด / เน็ตออกไม่ได้
 * ถ้าไม่แยกไว้ คนตั้งค่าจะนั่งเดาอยู่เป็นชั่วโมง
 */
export async function checkR2(): Promise<{ ok: boolean; step: string; detail?: string }> {
  const config = readConfig();
  if (!config) {
    const missing = [
      ["R2_ACCOUNT_ID", process.env.R2_ACCOUNT_ID],
      ["R2_ACCESS_KEY_ID", process.env.R2_ACCESS_KEY_ID],
      ["R2_SECRET_ACCESS_KEY", process.env.R2_SECRET_ACCESS_KEY],
      ["R2_BUCKET", process.env.R2_BUCKET],
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);
    return { ok: false, step: "ตั้งค่า", detail: `ยังไม่ได้ใส่: ${missing.join(", ")}` };
  }

  try {
    const { client, bucket } = getClient();
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 401 || status === 403) {
      return { ok: false, step: "คีย์", detail: "คีย์ผิดหรือไม่มีสิทธิ์เข้าถังนี้" };
    }
    if (status === 404) {
      return { ok: false, step: "ถัง", detail: `ไม่พบถังชื่อ ${config.bucket}` };
    }
    return {
      ok: false,
      step: "เชื่อมต่อ",
      detail: error?.message || "ต่อไปที่ R2 ไม่ได้",
    };
  }

  // ต่อถังได้ไม่ได้แปลว่าเขียนได้ คีย์แบบอ่านอย่างเดียวก็ผ่านขั้นบน
  // ลองเขียนไฟล์เปล่าแล้วลบทิ้ง เพื่อให้รู้ตั้งแต่ตอนตั้งค่าว่าอัปได้จริง
  const probeKey = `_healthcheck/${Date.now()}.txt`;
  try {
    await uploadObject({ key: probeKey, body: Buffer.from("ok"), contentType: "text/plain" });
    await deleteObject(probeKey);
  } catch (error: any) {
    return {
      ok: false,
      step: "สิทธิ์เขียน",
      detail: error?.message || "เขียนไฟล์ลงถังไม่ได้ (คีย์อาจเป็นแบบอ่านอย่างเดียว)",
    };
  }

  return { ok: true, step: "พร้อมใช้งาน" };
}
