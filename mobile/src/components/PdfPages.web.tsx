/**
 * หน้า PDF ในหน้าดูไฟล์ (เว็บ) — เจ้าของงานขอ ต.ค. 69: ใบเสนอราคา PDF กดแล้วเปิดดูไม่ได้
 * (Chrome บน Android ดาวน์โหลดลงเครื่องแทน) · วาดทีละหน้าด้วย pdf.js (utils/pdf.web.ts) หน้าแรกขึ้นก่อน
 *
 * โหลดไฟล์ตรงจากที่เก็บด้วยลิงก์ชั่วคราวก่อน — ถ้าที่เก็บไม่ตอบ CORS (fetch ข้ามโดเมนไม่ได้ ต่างจาก <img>)
 * ค่อยขอผ่านเซิร์ฟเวอร์ (GET /:id/attachments/:aid/file) ช้ากว่าแต่เปิดได้แน่
 * ซูม = วาดใหม่ที่ความกว้างใหม่ (ไม่ใช่ขยายภาพเดิม ตัวหนังสือถึงยังคม) แล้วเลื่อนดูในกรอบ
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api, apiErrorMessage } from "../api/client";
import { openPdf, renderPage, type PdfDoc } from "../utils/pdf.web";

/** PDF ยาวมาก (สแกนทั้งเล่ม) วาดแค่ช่วงต้น ที่เหลือเปิดไฟล์ดู — วาดทุกหน้าในมือถือกินแรมจนแท็บค้าง */
const MAX_PAGES = 30;

export default function PdfPages({
  workOrderId,
  attachmentId,
  url,
  width,
  zoom,
  onFail,
}: {
  workOrderId: number;
  attachmentId: number;
  /** ลิงก์ชั่วคราว — ยังไม่มาก็รอ (หมุน) */
  url: string | undefined;
  /** ความกว้างหน้าที่ซูม 100% */
  width: number;
  zoom: number;
  /** เปิดไม่ได้ทั้งสองทาง — หน้าดูไฟล์ขึ้นปุ่ม "เปิดไฟล์" แบบเดิมแทน */
  onFail: (message: string) => void;
}) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    if (!url) return;
    let alive = true;
    let opened: PdfDoc | null = null;
    setDoc(null);
    (async () => {
      try {
        opened = await openPdf({ url });
      } catch {
        try {
          const res = await api.get<ArrayBuffer>(`/work-orders/${workOrderId}/attachments/${attachmentId}/file`, {
            responseType: "arraybuffer",
            loadingText: false,
          });
          opened = await openPdf({ data: res.data });
        } catch (e) {
          if (alive) failRef.current(apiErrorMessage(e));
          return;
        }
      }
      if (alive) setDoc(opened);
      else void opened.destroy();
    })();
    return () => {
      alive = false;
      if (opened) void opened.destroy();
    };
  }, [url, workOrderId, attachmentId]);

  useEffect(() => {
    if (!doc) return;
    let stopped = false;
    const tasks: { cancel: () => void }[] = [];
    (async () => {
      for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
        const canvas = canvases.current[n - 1];
        if (stopped || !canvas) return;
        try {
          const task = await renderPage(doc, n, canvas, Math.round(width * zoom));
          if (!task) continue;
          tasks.push(task);
          await task.promise;
        } catch {
          // ยกเลิกเพราะซูมใหม่ / หน้าเสียหน้าเดียว — หน้าอื่นยังวาดต่อ
        }
      }
    })();
    return () => {
      stopped = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [doc, width, zoom]);

  if (!doc) {
    return (
      <View style={styles.wait}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.waitText}>กำลังเปิด PDF…</Text>
      </View>
    );
  }
  const pages = Array.from({ length: Math.min(doc.numPages, MAX_PAGES) }, (_, i) => i + 1);
  return (
    <div style={{ overflow: "auto", width: "100%", height: "100%" }} aria-label={`PDF ${doc.numPages} หน้า`}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // ซูมจนกว้างกว่ากรอบ — ชิดซ้ายให้เลื่อนดูได้ครบ (กึ่งกลางจะตัดขอบซ้ายทิ้ง)
          alignItems: zoom > 1 ? "flex-start" : "center",
          gap: 10,
          padding: 12,
          width: "max-content",
          minWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        {pages.map((n) => (
          <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <canvas
              ref={(el) => {
                canvases.current[n - 1] = el;
              }}
              style={{ background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,.45)", width: Math.round(width * zoom) }}
            />
            <Text style={styles.pageNo}>
              หน้า {n} / {doc.numPages}
            </Text>
          </div>
        ))}
        {doc.numPages > MAX_PAGES ? (
          <Text style={styles.more}>แสดง {MAX_PAGES} หน้าแรก — กดปุ่มเปิดไฟล์ด้านบนเพื่อดูหน้าที่เหลือ</Text>
        ) : null}
      </div>
    </div>
  );
}

const styles = StyleSheet.create({
  wait: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  waitText: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  pageNo: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  more: { color: "#FCD34D", fontSize: 13 },
});
