import { useEffect, useState } from "react";

/**
 * หน่วงค่าที่คนกำลังพิมพ์ไว้ก่อน แล้วค่อยส่งต่อ
 *
 * หน้าที่ค้นหาในแอปนี้ผูกคำค้นไว้กับตัวโหลดข้อมูลโดยตรง พิมพ์ "C0006"
 * จึงยิงขอข้อมูลหกรอบ รอบละทั้งตาราง — ห้ารอบแรกไม่มีใครได้เห็นเพราะ
 * ถูกรอบถัดไปทับทันที แต่ช่างหน้างานจ่ายค่าเน็ตครบทุกรอบ และคำตอบที่มาถึง
 * ไม่เรียงกันยังทำให้เห็นผลของคำค้นเก่าค้างอยู่ได้ด้วย
 *
 * 350 มิลลิวินาทีคือช่วงที่คนพิมพ์ติดกันปกติจะยังไม่ถูกตัด แต่พอหยุดพิมพ์แล้ว
 * ผลขึ้นเร็วจนไม่รู้สึกว่ารอ
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
