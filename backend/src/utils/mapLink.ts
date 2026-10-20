/**
 * ดึงพิกัดจากลิงก์ Google Maps ที่แอดมินวาง (หน้าจัดการสาขา — เจ้าของงานขอ ต.ค. 69)
 *
 * ทะเบียนสาขาส่วนใหญ่ไม่มีพิกัด คนที่ไปหน้าร้านแชร์ลิงก์จากแอปแผนที่มาง่ายกว่าคัดลอกตัวเลขสองช่อง
 * ลิงก์ยาวอ่านพิกัดได้เลย · ลิงก์สั้น (maps.app.goo.gl) ต้องตามไปหาลิงก์จริงก่อน — ทำที่เซิร์ฟเวอร์
 * เพราะเบราว์เซอร์ตามลิงก์ข้ามโดเมนไม่ได้ (CORS)
 */

/** ตามลิงก์สั้นเฉพาะโดเมน Google — กันไม่ให้ช่องนี้กลายเป็นทางให้เซิร์ฟเวอร์ไปเรียกที่อื่นแทนใคร */
const ALLOWED_HOSTS = /(^|\.)(goo\.gl|google\.com|google\.co\.th|maps\.app\.goo\.gl)$/i;

function inRange(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** อ่านพิกัดจากข้อความ — ลิงก์ยาวของ Google Maps หรือตัวเลข "13.75, 100.50" ตรง ๆ · อ่านไม่ได้ = null */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const s = decodeURIComponent(text.trim());
  const patterns = [
    // ตำแหน่งหมุดจริงของสถานที่ — แม่นกว่าจุดกลางจอ (@) จึงลองก่อน
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const latitude = Number(m[1]);
      const longitude = Number(m[2]);
      if (inRange(latitude, longitude)) return { latitude, longitude };
    }
  }
  return null;
}

/** ลิงก์สั้น → ตามไปไม่เกิน 5 ทอดจนได้ลิงก์ที่มีพิกัด · ทุกทอดต้องเป็นโดเมน Google */
export async function resolveMapLink(text: string): Promise<{ latitude: number; longitude: number } | null> {
  const direct = parseCoordinates(text);
  if (direct) return direct;
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.test(url.hostname)) return null;
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const next = res.headers.get("location");
    if (!next) return parseCoordinates(url.toString());
    url = new URL(next, url);
    const found = parseCoordinates(url.toString());
    if (found) return found;
  }
  return null;
}
