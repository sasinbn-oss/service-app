import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, apiErrorMessage, TOKEN_KEY } from "../api/client";
import { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (employeeCode: string, password: string) => Promise<void>;
  register: (employeeCode: string, name: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) return;
      const { data } = await api.get<User>("/auth/me");
      setUser(data);
    } catch {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }

  async function login(employeeCode: string, password: string) {
    try {
      const { data } = await api.post("/auth/login", { employeeCode, password });
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
    } catch (error) {
      throw new Error(apiErrorMessage(error));
    }
  }

  async function register(employeeCode: string, name: string, password: string, phone?: string) {
    try {
      const { data } = await api.post("/auth/register", { employeeCode, name, password, phone });
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
    } catch (error) {
      throw new Error(apiErrorMessage(error));
    }
  }

  async function logout() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
