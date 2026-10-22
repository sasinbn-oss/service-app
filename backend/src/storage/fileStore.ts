/**
 * ที่เก็บไฟล์แนบของใบงาน
 *
 * ตอนนี้ชี้ไปที่ Supabase Storage เพราะโปรเจกต์จ่าย Supabase Pro อยู่แล้ว
 * และแผนนั้นรวมที่เก็บไฟล์ 100 GB กับ bandwidth 250 GB/เดือนมาให้ในตัว
 * การไปเปิดบัญชีที่เก็บไฟล์อีกเจ้าจึงเพิ่มบิล เพิ่มคีย์ เพิ่มหน้า dashboard
 * ที่ต้องดูแล โดยไม่ได้พื้นที่เพิ่มในทางปฏิบัติ
 *
 * ทั้งไฟล์นี้เป็น S3 มาตรฐาน ไม่มีอะไรผูกกับ Supabase — ย้ายไปเจ้าอื่น
 * (R2, S3, MinIO) ทำได้ด้วยการเปลี่ยนค่าใน .env ไม่ต้องแก้โค้ด
 *
 * ทำไมไม่เก็บลงฐานข้อมูลเหมือนรูปอะไหล่
 * ---------------------------------------
 * รูปอะไหล่มีตัวละรูป ทั้งระบบไม่กี่ร้อยรูป เก็บลง Postgres ได้สบาย
 * แต่ไฟล์แนบใบงานคนละเรื่อง — ช่างถ่ายงานละ 3-5 รูป บางงานถ่ายวิดีโอ
 * คลิปเดียว 1 นาทีก็ใหญ่กว่าข้อมูลทั้งระบบรวมกันแล้ว ถ้าเก็บลงฐานข้อมูล
 * ค่าที่เก็บจะแพงขึ้นเป็นร้อยเท่าโดยไม่ได้อะไรกลับมา
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
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** อายุลิงก์ชั่วคราว — เท่ากับลิงก์โหลดเอกสารในระบบ ให้คนใช้จำง่ายว่า "2 ชั่วโมง" */
export const SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;

type StorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

let cachedClient: S3Client | null = null;

function readConfig(): StorageConfig | null {
  const endpoint = process.env.STORAGE_ENDPOINT?.trim();
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.STORAGE_BUCKET?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;

  // Supabase ต้องใช้ region จริงของโปรเจกต์ในการเซ็นลายเซ็น ไม่ใช่ "auto"
  // แบบที่ R2 ยอมรับ — เซ็นด้วย region ผิดจะโดนปฏิเสธว่าลายเซ็นไม่ถูกต้อง
  const region = process.env.STORAGE_REGION?.trim() || "us-east-1";

  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
}

export function isFileStoreConfigured(): boolean {
  return readConfig() !== null;
}

function getClient(): { client: S3Client; bucket: string } {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ — ต้องมี STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY และ STORAGE_BUCKET"
    );
  }

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      // Supabase รับเฉพาะแบบ path-style (ชื่อถังอยู่ใน path)
      // ไม่รับแบบ virtual-host ที่เอาชื่อถังไปไว้หน้าโดเมน
      forcePathStyle: true,
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
 * ใส่ path มาเต็ม ๆ ถ้าเอาไปต่อเป็น key ตรง ๆ จะได้โฟลเดอร์แปลก ๆ ในถัง
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
 * เช็คว่าที่เก็บไฟล์ใช้งานได้จริงไหม
 *
 * บอกให้ชัดว่าพังตรงไหน เพราะเวลาตั้งค่าผิดอาการเหมือนกันหมด (อัปไม่ขึ้น)
 * แต่สาเหตุคนละเรื่อง: ยังไม่ใส่ค่า / คีย์ผิด / พิมพ์ชื่อถังผิด / region ผิด
 * ถ้าไม่แยกไว้ คนตั้งค่าจะนั่งเดาอยู่เป็นชั่วโมง
 *
 * เช็คถึงขั้น "ขอลิงก์ชั่วคราวแล้วเปิดได้จริง" ด้วย ไม่ใช่แค่เขียนไฟล์ได้
 * เพราะทั้งฟีเจอร์นี้ตั้งอยู่บนลิงก์ชั่วคราว ถ้าผู้ให้บริการไม่รองรับหรือ
 * เซ็นด้วย region ผิด จะอัปขึ้นได้ปกติแต่ไม่มีใครเปิดรูปดูได้สักคน —
 * ความพังแบบที่จะไปโผล่ตอนช่างกดรูปหน้างาน ไม่ใช่ตอนตั้งค่า
 */
export async function checkFileStore(): Promise<{ ok: boolean; step: string; detail?: string }> {
  const config = readConfig();
  if (!config) {
    const missing = [
      ["STORAGE_ENDPOINT", process.env.STORAGE_ENDPOINT],
      ["STORAGE_ACCESS_KEY_ID", process.env.STORAGE_ACCESS_KEY_ID],
      ["STORAGE_SECRET_ACCESS_KEY", process.env.STORAGE_SECRET_ACCESS_KEY],
      ["STORAGE_BUCKET", process.env.STORAGE_BUCKET],
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);
    return { ok: false, step: "ตั้งค่า", detail: `ยังไม่ได้ใส่: ${missing.join(", ")}` };
  }

  const { client, bucket } = getClient();

  try {
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        step: "คีย์",
        detail: `คีย์ผิด ไม่มีสิทธิ์เข้าถังนี้ หรือ region ไม่ตรง (ตอนนี้ตั้งไว้ ${config.region})`,
      };
    }
    if (status === 404) {
      return { ok: false, step: "ถัง", detail: `ไม่พบถังชื่อ ${bucket}` };
    }
    return { ok: false, step: "เชื่อมต่อ", detail: error?.message || "ต่อไปที่ที่เก็บไฟล์ไม่ได้" };
  }

  // อ่านถังได้ไม่ได้แปลว่าเขียนได้ คีย์แบบอ่านอย่างเดียวก็ผ่านขั้นบน
  const probeKey = `_healthcheck/${Date.now()}.txt`;
  try {
    await uploadObject({ key: probeKey, body: Buffer.from("ok"), contentType: "text/plain" });
  } catch (error: any) {
    return {
      ok: false,
      step: "สิทธิ์เขียน",
      detail: error?.message || "เขียนไฟล์ลงถังไม่ได้ (คีย์อาจเป็นแบบอ่านอย่างเดียว)",
    };
  }

  try {
    const url = await getDownloadUrl(probeKey, { fileName: "healthcheck.txt" });
    const response = await fetch(url);
    if (!response.ok) {
      return {
        ok: false,
        step: "ลิงก์ชั่วคราว",
        detail: `อัปไฟล์ขึ้นได้ แต่เปิดด้วยลิงก์ชั่วคราวไม่ได้ (HTTP ${response.status}) — มักเกิดจาก STORAGE_REGION ไม่ตรงกับ region จริงของโปรเจกต์`,
      };
    }
  } catch (error: any) {
    return {
      ok: false,
      step: "ลิงก์ชั่วคราว",
      detail: error?.message || "ขอลิงก์ชั่วคราวไม่สำเร็จ",
    };
  } finally {
    await deleteObject(probeKey).catch(() => {});
  }

  return { ok: true, step: "พร้อมใช้งาน" };
}
