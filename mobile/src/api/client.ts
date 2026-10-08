import axios from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { feedback } from "../components/Feedback";

// Set EXPO_PUBLIC_API_URL in mobile/.env to the deployed backend, or to your
// machine's LAN address (e.g. http://192.168.1.20:4000) when running locally.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

// Spare part images are either a full external URL or a path served by our own
// API, so relative paths need the backend origin prefixed.
export function resolveImageUrl(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${API_URL}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

export const TOKEN_KEY = "service-app/token";

export const api = axios.create({
  baseURL: `${API_URL}/api`,
});

declare module "axios" {
  interface AxiosRequestConfig {
    /**
     * ข้อความบนหน้าโหลดเต็มจอระหว่างบันทึก หรือ false ถ้าไม่ต้องบังจอ
     * ไม่ใส่ = เลือกให้เองจากชนิดคำขอ (ดู savingText)
     */
    loadingText?: string | false;
  }
}

/*
  หน้าโหลดเต็มจอ + กันกดซ้ำ ตามแบบ OTTERI ทำที่นี่ที่เดียว

  ทุกการบันทึก/ส่ง/ลบในแอปผ่าน api ตัวนี้ (40 กว่าจุด) ถ้าให้แต่ละหน้าทำเอง
  จะมีหน้าที่ลืม แล้วคนกดซ้ำตอนเน็ตช้าได้ใบงานซ้ำสองใบ

  - คำขอที่เปลี่ยนข้อมูล (POST/PUT/PATCH/DELETE) เปิดหน้าโหลดทับทั้งจอทันทีพร้อมบอกว่ากำลังทำอะไร
    กดอะไรต่อไม่ได้จนกว่าจะเสร็จ
  - คำขอเดียวกันเป๊ะ (วิธี + ที่อยู่ + ข้อมูล) ที่ยังไม่เสร็จ คืนผลของคำขอแรก ไม่ส่งซ้ำ —
    กันกรณีกดรัวสองทีในเฟรมเดียวกัน ก่อนหน้าโหลดจะทันขึ้นมาบัง
  - คำขออ่าน (GET) ไม่บังจอ แค่ให้ปุ่มรีเฟรชหมุนจาง ๆ ว่ากำลังอัปเดตเบื้องหลัง
*/
const WRITE_METHODS = ["post", "put", "patch", "delete"];

function savingText(method: string, url: string): string {
  if (url.startsWith("/auth/login")) return "กำลังเข้าสู่ระบบ...";
  if (method === "delete") return "กำลังลบ...";
  if (/^\/work-orders(\/from-outage\/\d+)?$/.test(url) && method === "post") return "กำลังเปิดใบงาน...";
  if (/\/(attachments|image)$/.test(url)) return "กำลังอัปโหลดรูป...";
  if (url.startsWith("/documents")) return "กำลังสร้างเอกสาร...";
  return "กำลังบันทึก...";
}

let writing: string[] = [];
let reading = 0;
const readListeners = new Set<(busy: boolean) => void>();

function setReading(delta: number) {
  const before = reading > 0;
  reading = Math.max(0, reading + delta);
  if (before !== reading > 0) readListeners.forEach((l) => l(reading > 0));
}

/** ปุ่มรีเฟรชใช้รู้ว่ามีข้อมูลกำลังอัปเดตเบื้องหลังอยู่ไหม */
export function subscribeBackgroundReads(listener: (busy: boolean) => void): () => void {
  readListeners.add(listener);
  listener(reading > 0);
  return () => {
    readListeners.delete(listener);
  };
}

type Tracked = { __track?: "read" | string };

function begin(config: { method?: string; url?: string; loadingText?: string | false } & Tracked) {
  const method = (config.method ?? "get").toLowerCase();
  if (!WRITE_METHODS.includes(method)) {
    config.__track = "read";
    setReading(1);
    return;
  }
  if (config.loadingText === false) return;
  const text = config.loadingText ?? savingText(method, config.url ?? "");
  config.__track = text;
  writing = [...writing, text];
  feedback.loading(text);
}

function end(config: Tracked | undefined) {
  if (!config?.__track) return;
  if (config.__track === "read") {
    setReading(-1);
  } else {
    const i = writing.lastIndexOf(config.__track);
    if (i >= 0) writing = writing.filter((_, j) => j !== i);
    feedback.loading(writing.length ? writing[writing.length - 1] : null);
  }
  config.__track = undefined;
}

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  begin(config as typeof config & Tracked);
  return config;
});

/**
 * บัญชีถูก Super Admin ลบระหว่างที่ยังเปิดแอปค้างอยู่ — ออกจากระบบทันที
 * ไม่งั้นทุกหน้าจะขึ้นแค่ "บัญชีนี้ถูกลบแล้ว" ซ้ำ ๆ โดยไม่พากลับหน้าเข้าระบบ
 */
let accountDeletedHandler: (() => void) | null = null;
export function onAccountDeleted(handler: (() => void) | null) {
  accountDeletedHandler = handler;
}

api.interceptors.response.use(
  (response) => {
    end(response.config as Tracked);
    return response;
  },
  (error) => {
    end((error?.config ?? undefined) as Tracked | undefined);
    if (error?.response?.status === 401 && error.response.data?.accountDeleted) accountDeletedHandler?.();
    return Promise.reject(error);
  }
);

const inflight = new Map<string, Promise<unknown>>();

function dedupeKey(method: string, url: string, data: unknown): string | null {
  // ไฟล์แนบเทียบเนื้อหาไม่ได้ ใช้แค่ที่อยู่ — สองคำขออัปโหลดไปที่เดียวกันพร้อมกันคือกดซ้ำ
  if (typeof FormData !== "undefined" && data instanceof FormData) return `${method} ${url} [file]`;
  try {
    return `${method} ${url} ${JSON.stringify(data ?? null)}`;
  } catch {
    return null;
  }
}

for (const method of WRITE_METHODS as ("post" | "put" | "patch" | "delete")[]) {
  const original = api[method].bind(api) as (...args: unknown[]) => Promise<unknown>;
  // delete ไม่มี body ตัวที่สองคือ config
  const wrapped = (url: string, ...rest: unknown[]) => {
    const key = dedupeKey(method, url, method === "delete" ? null : rest[0]);
    if (key) {
      const running = inflight.get(key);
      if (running) return running;
    }
    const p = original(url, ...rest).finally(() => {
      if (key) inflight.delete(key);
    });
    if (key) inflight.set(key, p);
    return p;
  };
  (api as unknown as Record<string, unknown>)[method] = wrapped;
}

/**
 * A deployed web build that still points at localhost was built without
 * EXPO_PUBLIC_API_URL. That shows up as an ordinary network error, which sends
 * people hunting in the wrong place, so name the real cause.
 */
function isMisconfiguredWebBuild(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const servedLocally = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  return !servedLocally && /localhost|127\.0\.0\.1/.test(API_URL);
}

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: unknown } | undefined;
    if (typeof data?.error === "string") return data.error;
    if (data?.error) return JSON.stringify(data.error);

    if (!error.response && isMisconfiguredWebBuild()) {
      return (
        "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ เพราะเว็บนี้ถูก build โดยไม่ได้ตั้งค่า EXPO_PUBLIC_API_URL " +
        "ให้ตั้งค่าเป็น URL ของ backend แล้ว build ใหม่"
      );
    }
    if (!error.response) {
      return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต (ถ้าเพิ่งเปิดใช้ครั้งแรกอาจต้องรอเซิร์ฟเวอร์ตื่นสักครู่)";
    }
    return error.message;
  }
  return "Unexpected error";
}
