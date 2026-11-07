import * as Location from "expo-location";

/**
 * พิกัดตอนกดถึงหน้างาน (งานของฉัน · หน้าใบงาน) — ไม่ได้ก็ไม่เป็นไร (ปิด GPS · ไม่อนุญาต · คอมไม่มี GPS) เซิร์ฟเวอร์บันทึกว่าไม่มีพิกัด
 * ไม่บล็อกช่าง: GPS ในร้าน/ห้างคลาดบ่อย ระบบแค่บันทึกตามจริงให้ตรวจย้อนหลังได้
 */
export async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const p = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
    ]);
    return p ? { latitude: p.coords.latitude, longitude: p.coords.longitude } : null;
  } catch {
    return null;
  }
}
