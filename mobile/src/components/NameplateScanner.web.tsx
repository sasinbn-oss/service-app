/**
 * สแกนป้ายรุ่นด้วยกล้อง — ทีละบรรทัดตามแบบป้ายของยี่ห้อ (เจ้าของงานขอ ต.ค. 69: กันช่างคีย์ Serial/รุ่นผิด)
 *
 * ทำไมทีละบรรทัด ไม่ถ่ายทั้งป้าย: ทดลองกับรูปป้ายจริงแล้ว อ่านทั้งป้ายถูกแค่ 6/10 ช่อง ส่วนครอปทีละบรรทัด
 * ตัวเลขอ่านถูกเกือบทุกเฟรม — กรอบบนจอคือส่วนที่ครอปไปอ่าน ช่างแค่เล็งบรรทัดให้อยู่ในกรอบ
 * อ่านต่อเนื่องหลายเฟรมแล้วโหวต (utils/nameplate.ts) ไม่รับค่าจากเฟรมเดียว · เก็บภาพบรรทัดไว้ให้คนเทียบ
 *
 * วาดลง <body> เอง (ไม่ใช่ Modal) — เปิดจากในฟอร์มปิดงานซึ่งเป็น Modal อยู่แล้ว Modal ซ้อนบนเว็บไม่น่าเชื่อถือ
 * ทำบนเว็บเท่านั้น (ช่างใช้แอปผ่านเว็บในมือถือ) — แอปมือถือใช้ NameplateScanner.tsx ที่ให้พิมพ์เอง
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ocrWorker } from "../utils/ocr";
import { extract, matchModel, PlateTemplate, PlateValue, vote } from "../utils/nameplate";

/** ความสูงที่ขยายบรรทัดก่อนส่งอ่าน — ตัวอักษรสูงราว 30–60 px อ่านแม่นที่สุด */
const READ_HEIGHT = 120;

export default function NameplateScanner({
  template,
  registryModel,
  onDone,
  onClose,
}: {
  template: PlateTemplate;
  /** รุ่นในทะเบียนเครื่อง — ใช้แก้ O↔0 S↔5 ของช่องรุ่น */
  registryModel?: string | null;
  onDone: (values: Record<string, PlateValue>) => void;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [lineIdx, setLineIdx] = useState(0);
  const idx = useRef(0);
  const [got, setGot] = useState<Record<string, PlateValue>>({});
  const [live, setLive] = useState<Record<string, { value: string | null; n: number }>>({});
  const result = useRef<Record<string, PlateValue>>({});
  const reads = useRef<Record<string, (string | null)[]>>({});
  const line = template.lines[lineIdx];

  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:2147483100;display:flex";
    document.body.appendChild(el);
    setHost(el);
    return () => el.remove();
  }, []);

  // เปิดกล้องหลัง + โหลดตัวอ่านพร้อมกัน — โหลดตัวอ่านครั้งแรกช้า ไม่ควรรอกล้องเสร็จก่อน
  useEffect(() => {
    let stream: MediaStream | null = null;
    let gone = false;
    (async () => {
      try {
        const [s] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          }),
          ocrWorker(),
        ]);
        stream = s;
        if (gone) return s.getTracks().forEach((t) => t.stop());
        const v = video.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => undefined);
        }
        setState("ready");
      } catch (e) {
        if (gone) return;
        const name = (e as { name?: string })?.name;
        setError(
          name === "NotAllowedError"
            ? "เบราว์เซอร์ไม่อนุญาตให้ใช้กล้อง — อนุญาตกล้องให้เว็บนี้ หรือปิดแล้วพิมพ์เอง"
            : name === "NotFoundError"
              ? "เครื่องนี้ไม่มีกล้อง — ปิดแล้วพิมพ์เอง"
              : (e as Error)?.message || "เปิดกล้องไม่ได้ — ปิดแล้วพิมพ์เอง"
        );
        setState("error");
      }
    })();
    return () => {
      gone = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** ครอปส่วนของภาพกล้องที่อยู่ใต้กรอบ — วิดีโอแสดงแบบ cover จึงต้องแปลงพิกัดจอเป็นพิกัดภาพ */
  function cropUnderBox(): { read: HTMLCanvasElement; thumb: HTMLCanvasElement } | null {
    const v = video.current;
    const b = box.current;
    if (!v || !b || !v.videoWidth) return null;
    const vr = v.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const scale = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
    const offX = (v.videoWidth * scale - vr.width) / 2;
    const offY = (v.videoHeight * scale - vr.height) / 2;
    const sx = (br.left - vr.left + offX) / scale;
    const sy = (br.top - vr.top + offY) / scale;
    const sw = br.width / scale;
    const sh = br.height / scale;
    if (sw < 4 || sh < 4) return null;

    // ภาพที่ส่งอ่าน: ขยาย + ขาวดำ + ยืดความต่าง (ป้ายโลหะสีเทา ตัวหนังสือจาง)
    const read = document.createElement("canvas");
    const k = READ_HEIGHT / sh;
    read.width = Math.min(1800, Math.round(sw * k));
    read.height = READ_HEIGHT;
    const rc = read.getContext("2d", { willReadFrequently: true })!;
    rc.drawImage(v, sx, sy, sw, sh, 0, 0, read.width, read.height);
    const img = rc.getImageData(0, 0, read.width, read.height);
    const d = img.data;
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = g;
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const g = ((d[i] - lo) * 255) / span;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    rc.putImageData(img, 0, 0);

    // ภาพเล็กสีจริงไว้ให้คนเทียบ — เก็บไปกับใบเคลม จึงย่อให้เล็ก
    const thumb = document.createElement("canvas");
    thumb.width = Math.min(360, Math.round(sw));
    thumb.height = Math.round((thumb.width * sh) / sw);
    thumb.getContext("2d")!.drawImage(v, sx, sy, sw, sh, 0, 0, thumb.width, thumb.height);
    return { read, thumb };
  }

  // อ่านต่อเนื่องเฉพาะบรรทัดปัจจุบัน — ครบทุกช่องของบรรทัดแล้วไปบรรทัดถัดไปเอง
  useEffect(() => {
    if (state !== "ready" || !line) return;
    let stop = false;
    for (const f of line.fields) reads.current[f.key] = [];
    setLive({});
    (async () => {
      const worker = await ocrWorker();
      while (!stop) {
        const shot = cropUnderBox();
        if (!shot) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        const text = (await worker.recognize(shot.read)).data.text;
        if (stop) break;
        const next: Record<string, { value: string | null; n: number }> = {};
        for (const f of line.fields) {
          if (result.current[f.key]) continue;
          const r = extract(f, text);
          const list = reads.current[f.key];
          list.push(r);
          const won = vote(list);
          next[f.key] = { value: r, n: r ? list.filter((x) => x === r).length : 0 };
          if (won) {
            const crop = shot.thumb.toDataURL("image/jpeg", 0.7);
            const m = f.model ? matchModel(won, registryModel) : { value: won, needsCheck: false };
            result.current[f.key] = { value: m.value, source: "SCAN", crop, needsCheck: m.needsCheck };
          }
        }
        setLive(next);
        setGot({ ...result.current });
        if (line.fields.every((f) => result.current[f.key])) {
          (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(30);
          await new Promise((r) => setTimeout(r, 500));
          if (!stop) advance();
          break;
        }
      }
    })().catch((e) => {
      if (!stop) {
        setError((e as Error)?.message ?? "อ่านป้ายไม่สำเร็จ");
        setState("error");
      }
    });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, lineIdx]);

  function advance() {
    if (idx.current + 1 >= template.lines.length) return onDone({ ...result.current });
    idx.current += 1;
    setLineIdx(idx.current);
  }

  if (!host) return null;
  const allFields = template.lines.flatMap((l) => l.fields);
  return createPortal(
    <div style={S.wrap}>
      <video ref={video} playsInline muted autoPlay style={S.video} />
      <div style={S.top}>
        <button style={S.close} onClick={onClose} aria-label="ปิดสแกน">✕</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.title}>สแกนป้ายรุ่น</div>
          <div style={S.sub}>
            บรรทัด {Math.min(lineIdx + 1, template.lines.length)}/{template.lines.length}
          </div>
        </div>
      </div>

      <div style={S.prompt}>
        {state === "loading"
          ? "กำลังเปิดกล้องและโหลดตัวอ่านป้าย (ครั้งแรกราว 7 MB)…"
          : state === "error"
            ? error
            : `เล็ง${line?.prompt ?? ""}ให้อยู่ในกรอบ ถือนิ่ง ๆ`}
      </div>
      <div ref={box} style={S.box} aria-label="กรอบสแกน" />

      {state === "ready" && line ? (
        <div style={S.liveRow}>
          {line.fields.map((f) => {
            const done = got[f.key];
            const l = live[f.key];
            return (
              <div key={f.key} style={{ ...S.chip, ...(done ? S.chipOk : null) }} aria-label={`อ่าน ${f.label}`}>
                {f.label}: {done ? `✓ ${done.value}` : l?.value ? `${l.value} (${l.n}/3)` : "กำลังอ่าน…"}
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={S.bottom}>
        <div style={S.gotList}>
          {allFields.map((f) => (
            <div key={f.key} style={S.gotRow}>
              <span style={{ opacity: 0.75 }}>{f.label}</span>
              <b style={{ fontFamily: "ui-monospace,Menlo,monospace" }}>{got[f.key]?.value ?? "—"}</b>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghost} onClick={advance} disabled={state !== "ready"} aria-label="ข้ามบรรทัดนี้">
            ข้ามบรรทัดนี้ (พิมพ์เอง)
          </button>
          <button style={S.done} onClick={() => onDone({ ...result.current })} aria-label="เสร็จสแกน">
            เสร็จ
          </button>
        </div>
      </div>
    </div>,
    host
  );
}

const font = '"Noto Sans Thai","Inter",system-ui,sans-serif';
const S: Record<string, React.CSSProperties> = {
  wrap: { position: "fixed", inset: 0, background: "#000", color: "#fff", fontFamily: font, overflow: "hidden" },
  video: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  top: {
    position: "absolute", left: 0, right: 0, top: 0, display: "flex", alignItems: "center", gap: 10,
    padding: "calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px", background: "linear-gradient(#000c, #0000)",
  },
  close: { width: 38, height: 38, borderRadius: 19, border: "none", background: "#fff3", color: "#fff", fontSize: 18 },
  title: { fontWeight: 800, fontSize: 16 },
  sub: { fontSize: 12.5, opacity: 0.8 },
  prompt: {
    position: "absolute", left: "7%", right: "7%", top: "calc(38% - 54px)", textAlign: "center", fontSize: 14,
    fontWeight: 700, textShadow: "0 1px 3px #000",
  },
  // กรอบ = ส่วนที่ครอปไปอ่าน · สัดส่วน 5:1 พอดีหนึ่งบรรทัดของป้าย
  box: {
    position: "absolute", left: "7%", width: "86%", top: "38%", aspectRatio: "5 / 1", border: "3px solid #38BDF8",
    borderRadius: 10, boxShadow: "0 0 0 9999px #0008",
  },
  liveRow: { position: "absolute", left: "7%", right: "7%", top: "calc(38% + 18vw + 16px)", display: "flex", flexWrap: "wrap", gap: 6 },
  chip: { background: "#0009", border: "1px solid #fff5", borderRadius: 999, padding: "4px 10px", fontSize: 12.5 },
  chipOk: { background: "#065F46e6", borderColor: "#34D399" },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", gap: 10,
    padding: "12px 14px calc(env(safe-area-inset-bottom, 0px) + 14px)", background: "linear-gradient(#0000, #000d 30%)",
  },
  gotList: { display: "flex", flexDirection: "column", gap: 3, fontSize: 13 },
  gotRow: { display: "flex", justifyContent: "space-between", gap: 10 },
  ghost: { flex: 1, padding: "12px 8px", borderRadius: 10, border: "1.5px solid #fff8", background: "transparent", color: "#fff", fontWeight: 700, fontFamily: font },
  done: { flex: 1, padding: "12px 8px", borderRadius: 10, border: "none", background: "#0369A1", color: "#fff", fontWeight: 800, fontFamily: font },
};
