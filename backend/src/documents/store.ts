/**
 * ที่พักไฟล์เอกสารที่เพิ่งสร้าง ระหว่างรอผู้ใช้กดดาวน์โหลด
 *
 * เก็บไว้ในหน่วยความจำ ไม่ลงฐานข้อมูล เพราะเป็นไฟล์ชั่วคราวที่มีอายุสั้น
 * ผู้ใช้กดดาวน์โหลดแล้วก็เอาไปเก็บที่เครื่องตัวเองต่อ — และการไม่แตะ schema
 * แปลว่าเปิดใช้ฟีเจอร์นี้ได้โดยไม่ต้องรัน migration ใหม่
 *
 * ข้อแลกเปลี่ยน: ถ้าเซิร์ฟเวอร์รีสตาร์ท (บน Render free tier เกิดขึ้นเมื่อไม่มีคนใช้)
 * ลิงก์ที่ยังไม่ได้กดจะหายไป ต้องสั่งให้ผู้ช่วยออกเอกสารใหม่
 */
import crypto from "crypto";

export interface StoredDocument {
  id: string;
  /** กุญแจในลิงก์ดาวน์โหลด — ทำให้ลิงก์ใช้ได้ตรง ๆ โดยไม่ต้องแนบ token ของผู้ใช้ */
  token: string;
  filename: string;
  /** ชื่อสำรองแบบ ASCII สำหรับตัวโหลดที่อ่าน filename*= ไม่ได้ */
  asciiFilename: string;
  mimeType: string;
  data: Buffer;
  /** คนที่สั่งสร้าง เก็บไว้เพื่อการตรวจสอบย้อนหลังใน log */
  ownerId: number;
  createdAt: number;
}

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_DOCUMENTS = 200;

const documents = new Map<string, StoredDocument>();

function evictExpired() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, doc] of documents) {
    if (doc.createdAt < cutoff) documents.delete(id);
  }
  // กันหน่วยความจำบวมถ้ามีการสร้างถี่มากในช่วงสั้น ๆ — ทิ้งอันที่เก่าสุดก่อน
  while (documents.size > MAX_DOCUMENTS) {
    const oldest = documents.keys().next().value;
    if (oldest === undefined) break;
    documents.delete(oldest);
  }
}

export function saveDocument(input: {
  filename: string;
  asciiFilename: string;
  mimeType: string;
  data: Buffer;
  ownerId: number;
}): StoredDocument {
  evictExpired();
  const doc: StoredDocument = {
    id: crypto.randomBytes(9).toString("base64url"),
    token: crypto.randomBytes(24).toString("base64url"),
    createdAt: Date.now(),
    ...input,
  };
  documents.set(doc.id, doc);
  return doc;
}

/**
 * คืนเอกสารเมื่อ token ตรงเท่านั้น เทียบแบบ timing-safe เพื่อไม่ให้เดาทีละตัวอักษรได้
 */
export function getDocument(id: string, token: string): StoredDocument | null {
  evictExpired();
  const doc = documents.get(id);
  if (!doc) return null;

  const given = Buffer.from(token);
  const expected = Buffer.from(doc.token);
  if (given.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(given, expected)) return null;

  return doc;
}

/** ลิงก์แบบ path เดียว ฝั่งแอปเติม origin ของ backend เอง */
export function documentPath(doc: StoredDocument): string {
  return `/api/assistant/documents/${doc.id}?token=${doc.token}`;
}
