import { Dispatch, SetStateAction, useCallback, useState } from "react";

/**
 * จำข้อมูลที่โหลดล่าสุดของแต่ละหน้าไว้ในหน่วยความจำ ตาม "เปลี่ยนหน้าเร็ว" ของต้นแบบ OTTERI
 *
 * เปิดหน้าจากเมนูแต่ละครั้งคือหน้าใหม่ (state ว่าง) จึงต้องรอโหลดใหม่ทุกครั้งที่กลับมา
 * ทั้งที่ข้อมูลเมื่อครู่ยังใช้ได้ — จำไว้แล้วแสดงทันที หน้ายังโหลดใหม่เบื้องหลังตามเดิม
 * (ปุ่มรีเฟรชหมุนจาง ๆ ระหว่างนั้น) ข้อมูลที่เห็นจึงไม่เก่าเกินกว่าเสี้ยววินาที
 *
 * อยู่ในหน่วยความจำเท่านั้น ไม่ลงเครื่อง และล้างทุกครั้งที่เข้า/ออกจากระบบ —
 * เครื่องที่ใช้ร่วมกันหลายคนต้องไม่เห็นข้อมูลของคนก่อนแม้แต่แวบเดียว
 */
const cache = new Map<string, unknown>();

export function clearPageCache() {
  cache.clear();
}

/**
 * ใช้แทน useState ของข้อมูลหลักในหน้า คืนค่าตัวที่สามว่ามีของที่จำไว้ไหม
 * เอาไปตั้งค่าเริ่มของ loading: useState(!cached)
 */
export function useCachedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [cached] = useState(() => cache.has(key));
  const [value, setValue] = useState<T>(() => (cache.has(key) ? (cache.get(key) as T) : initial));
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        cache.set(key, v);
        return v;
      });
    },
    [key]
  );
  return [value, set, cached];
}
