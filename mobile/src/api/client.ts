import axios from "axios";
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

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: unknown } | undefined;
    if (typeof data?.error === "string") return data.error;
    if (data?.error) return JSON.stringify(data.error);
    return error.message;
  }
  return "Unexpected error";
}
