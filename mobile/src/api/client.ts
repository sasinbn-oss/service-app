import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Set EXPO_PUBLIC_API_URL in mobile/.env to your backend's LAN address,
// e.g. http://192.168.1.20:4000, so a phone on Expo Go can reach it.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

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
