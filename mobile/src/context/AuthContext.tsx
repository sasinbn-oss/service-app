import React, { createContext, useContext, useEffect, useState } from "react";
import { clearPageCache } from "../utils/pageCache";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showAlert } from "../utils/alert";
import { api, apiErrorMessage, onAccountDeleted, onViewAsEnded, SELF_TOKEN_KEY, TOKEN_KEY } from "../api/client";
import { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (employeeCode: string, password: string) => Promise<void>;
  register: (employeeCode: string, name: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** ใช้โทเคนใบใหม่หลังเปลี่ยนรหัส แล้วดึงข้อมูลผู้ใช้ล่าสุดมาแทน */
  applyNewToken: (token: string) => Promise<void>;
  /** Super Admin ดูแอปในฐานะพนักงานคนนี้ (ดูได้อย่างเดียว) */
  startViewAs: (userId: number) => Promise<void>;
  /** เลิกดูในฐานะ กลับเป็น Super Admin ตัวเอง */
  stopViewAs: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Super Admin ทำได้ทุกอย่างเท่าแอดมิน — มองเป็น ADMIN พร้อมธง superAdmin (ตรงกับ middleware ฝั่งเซิร์ฟเวอร์) */
function asSession(u: User): User {
  if (u.role === "SUPER_ADMIN") return { ...u, role: "ADMIN", superAdmin: true };
  // แอดมินอะไหล่สิทธิ์เท่าแอดมินทุกอย่าง — ทุกที่ที่เช็ค role === "ADMIN" ใช้ได้เลย ป้ายชื่อดูที่ partsAdmin
  if (u.role === "PARTS_ADMIN") return { ...u, role: "ADMIN", partsAdmin: true };
  // Senior ช่างสิทธิ์เท่าช่างทุกอย่าง แค่เห็นหลายทีม — มองเป็น EMPLOYEE ทุกที่ที่เช็คว่า "เป็นช่าง" (งานของฉัน
  // กล่องงาน หน้าแรก) ใช้ได้เลย ขอบเขตทีมมาจาก teamCoverage ที่เซิร์ฟเวอร์รวมให้แล้ว ไม่ต้องคิดซ้ำในแอป
  // รับธง seniorTech ด้วย เผื่อเซิร์ฟเวอร์แปลง role ให้ก่อนส่ง (ถ้าไม่รับ ป้ายชื่อจะกลายเป็น "ช่าง" เฉย ๆ)
  if (u.role === "SENIOR_TECH" || (u.role === "EMPLOYEE" && u.seniorTech)) return { ...u, role: "EMPLOYEE", seniorTech: true };
  return u;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restoreSession();
    onAccountDeleted((notice) => {
      logout();
      if (notice) showAlert("เข้าสู่ระบบใหม่", notice);
    });
    onViewAsEnded(() => {
      stopViewAs();
    });
    return () => {
      onAccountDeleted(null);
      onViewAsEnded(null);
    };
  }, []);

  async function restoreSession() {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) return;
      const { data } = await api.get<User>("/auth/me");
      setUser(asSession(data));
    } catch {
      // ปิดแอปค้างไว้ระหว่างดูในฐานะจนโทเคนหมดอายุ — กลับเป็น Super Admin ไม่ใช่ให้ล็อกอินใหม่
      const self = await AsyncStorage.getItem(SELF_TOKEN_KEY);
      if (self) {
        await AsyncStorage.multiRemove([SELF_TOKEN_KEY]);
        await AsyncStorage.setItem(TOKEN_KEY, self);
        try {
          const { data } = await api.get<User>("/auth/me");
          setUser(asSession(data));
          return;
        } catch {
          /* โทเคนตัวเองก็หมดแล้ว — ล็อกอินใหม่ */
        }
      }
      await AsyncStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }

  async function login(employeeCode: string, password: string) {
    try {
      const { data } = await api.post("/auth/login", { employeeCode, password });
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      clearPageCache();
      setUser(asSession(data.user));
    } catch (error) {
      throw new Error(apiErrorMessage(error));
    }
  }

  async function register(employeeCode: string, name: string, password: string, phone?: string) {
    try {
      const { data } = await api.post("/auth/register", { employeeCode, name, password, phone });
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      clearPageCache();
      setUser(asSession(data.user));
    } catch (error) {
      throw new Error(apiErrorMessage(error));
    }
  }

  async function applyNewToken(token: string) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    const { data } = await api.get<User>("/auth/me");
    setUser(asSession(data));
  }

  async function startViewAs(userId: number) {
    const own = await AsyncStorage.getItem(TOKEN_KEY);
    try {
      const { data } = await api.post("/auth/view-as", { userId });
      // เก็บโทเคนตัวจริงไว้ก่อนสลับ — ปิดแอปแล้วเปิดใหม่ระหว่างดูก็ยังกลับเป็นตัวเองได้
      if (own) await AsyncStorage.setItem(SELF_TOKEN_KEY, own);
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      // ข้อมูลที่จำไว้ของ Super Admin (ตัวเลข รายการ) ต้องไม่โผล่ในหน้าจอของคนที่ถูกดู
      clearPageCache();
      setUser(asSession(data.user));
    } catch (error) {
      throw new Error(apiErrorMessage(error));
    }
  }

  async function stopViewAs() {
    const self = await AsyncStorage.getItem(SELF_TOKEN_KEY);
    if (!self) return;
    // ปิดบันทึกฝั่งเซิร์ฟเวอร์ — ถ้าโทเคนหมดอายุไปแล้วก็ไม่เป็นไร บันทึกยังบอกเวลาเริ่มดู
    await api.post("/auth/view-as/stop", {}).catch(() => {});
    await AsyncStorage.setItem(TOKEN_KEY, self);
    await AsyncStorage.removeItem(SELF_TOKEN_KEY);
    clearPageCache();
    try {
      const { data } = await api.get<User>("/auth/me");
      setUser(asSession(data));
    } catch {
      await logout();
    }
  }

  async function logout() {
    await AsyncStorage.removeItem(SELF_TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_KEY);
    // ข้อมูลที่จำไว้ของคนนี้ต้องไม่ค้างให้คนถัดไปที่เข้าเครื่องเดียวกันเห็น
    clearPageCache();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, applyNewToken, startViewAs, stopViewAs }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
