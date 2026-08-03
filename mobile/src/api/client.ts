import axios from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
