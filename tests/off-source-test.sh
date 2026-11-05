#!/bin/bash
# ทดสอบ: อะไหล่นอกสโตร์ — จัดหาได้ไหม · หาได้จากที่ไหน / ทำไมหาไม่ได้ (เจ้าของงานขอ 4 พ.ย. 69 · ตามตัวอย่างที่อนุมัติ)
#   · ระบุอะไหล่: ไม่ตอบ/ตอบไม่ครบ = 400 ภาษาไทยทีละข้อ (หาได้ไหม · ชิปแหล่ง · รายละเอียด · เหตุผลหาไม่ได้ · ชิปผิดชุด · ชนิดผิด)
#     ใบไม่ขยับ ไม่มีแถวอะไหล่/แถวของนอกสโตร์ค้าง (ฐานข้อมูล) · หน้าจอรุ่นเก่า (ไม่ส่งช่องเลย) ได้ข้อความบอกให้อัปเดต
#   · ตอบครบ: เก็บ หาได้/หาไม่ได้ · ชิป · รายละเอียด · คนตอบ · เวลา (ฐานข้อมูล) · หน้าใบงานได้ครบ + ชื่อบทบาทคนตอบ
#     · หาไม่ได้ไม่กันส่ง (ข้อ 4) — ใบไปเช็คอะไหล่ตามเดิม
#   · แอดมินเช็คอะไหล่ (ข้อ 1): ผลเช็คเป็นของแอดมิน ตอบต่างจากหัวหน้าภาคได้ · คำตอบหัวหน้าภาคไม่ถูกทับ · ประวัติบอกว่าต่างจากที่แจ้ง
#   · ส่งรายการเดิมซ้ำ (ย้อนกลับมาระบุใหม่): คำตอบเดิมไม่หาย เวลาคนตอบเดิม · ย้อนขั้นไม่ล้างคำตอบ · เปลี่ยนคำตอบ = เวลาใหม่เฉพาะแถวนั้น
#     · ส่งซ้ำโดยไม่มีคำตอบ = 400 และคำตอบเดิมยังอยู่
#   · ใบเก่าที่ไม่มีคำตอบ (ข้อ 6): หน้าใบงานได้ null ("ยังไม่ระบุ") · แอดมินเช็คต่อได้ ไม่บังคับย้อนหลัง · แก้รายการครั้งหน้าต้องตอบ
#   · ปิดงาน ช่างซื้อเอง (ข้อ 7): ถามแค่ซื้อจากที่ไหน — ไม่ตอบ/ไม่มีรายละเอียด/ใช้เหตุผลหาไม่ได้ = 400 · ของจากรายการรอไม่ต้องตอบ
#     · ของนอกสโตร์ใหม่ส่งด้วยรหัสไม่ได้ · ตอบครบ → แถวที่ใช้ไป: ซื้อเอง = หาได้+แหล่ง+คนปิด · ของจากรายการ = ว่าง (ฐานข้อมูล)
#   · ปิดซ้ำหลังเคลมถูกตีกลับ · หัวหน้าภาคปิดแทน · ปิดย้อนหลัง: คำตอบ "ซื้อจาก" ของของที่ช่างซื้อเองรอบก่อนไม่หาย
#     คนตอบ/เวลาเดิม (ฐานข้อมูล) — สองทางหลังส่งแค่รหัสอะไหล่ ไม่มีช่องคำตอบ
#
# ชุดเตรียมของเทสต์เคลม (claim-setup.sh) ให้ตัวช่วย J/DB/POST… · ผู้ใช้/สาขาในประกันของชุดนี้เอง · เก็บกวาด · หยุดกลางทาง = FAIL
# — ข้อปิดซ้ำหลังตีกลับต้องมีใบที่เคลมได้จริง ใช้ชุดเดียวกับเทสต์เคลมแทนการคัดลอกขั้นเตรียมมาเอง (เหตุผลอยู่หัวไฟล์นั้น)
# เก็บกวาดของชุดนี้อยู่ใน claim_extra_cleanup (claim-setup ตั้ง trap EXIT ไว้แล้ว) · ห้ามตั้ง SUF/IDS/OLD_REGION ทับ:
# claim-setup ใช้สามตัวนี้ตอนเก็บกวาด ตั้งใหม่แล้วผู้ใช้ทดสอบเคลมไม่ถูกลบ/ภาคของ S001 ถูกคืนเป็นค่าผิด
SP="$(cd "$(dirname "$0")" && pwd)"
. "$SP/claim-setup.sh"   # source purge-orders.sh ให้แล้ว (purge_orders)
EMSG() { J 'd.error===undefined?"(ไม่มี error) "+JSON.stringify(d).slice(0,160):typeof d.error==="string"?d.error:JSON.stringify(d.error)'; }
AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'")
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
SNAME=$(DB "select name from \"User\" where \"employeeCode\"='S001'")
N1="ลูกบิดประตูทดสอบแหล่ง $SUF"      # หัวหน้าภาคบอกหาได้
N2="ลูกปืนแกนถังทดสอบแหล่ง $SUF"     # หัวหน้าภาคบอกหาไม่ได้
N3="สายน้ำเข้าใบเก่าทดสอบแหล่ง $SUF"  # ใบเก่า — ไม่มีคำตอบ
N4="ปะเก็นซื้อหน้างานทดสอบแหล่ง $SUF" # ช่างซื้อเองตอนปิดงาน
N5="ฝาครอบซื้อก่อนตีกลับทดสอบแหล่ง $SUF" # ช่างซื้อเอง แล้วเคลมถูกตีกลับ (ปิดซ้ำ · ปิดแทน · ปิดย้อนหลัง)
# ลบใบงานก่อนของนอกสโตร์ — แถวอะไหล่ของใบยังอ้างถึงอยู่ · ล้าง IDS ให้ claim-setup ไม่ลบซ้ำ
claim_extra_cleanup() {
  # purge_orders (ถังขยะ → ครบ 30 วัน) — DELETE เปล่าแบบเดิมได้ 400 ตั้งแต่มีถังขยะ ใบของชุดนี้เคยค้างฐานทุกรอบ (4 ใบ/รอบ)
  purge_orders "$A" $IDS
  IDS=""
  DB "delete from \"SparePart\" where \"offCatalog\" and name like '%ทดสอบแหล่ง $SUF'" >/dev/null
}
# สาขาแฟรนไชส์หมดประกัน (ข้อจัดหา/ใบเก่า) กับสาขาบริษัท (ปิดงาน — ไม่มีเรื่องเคลมมาปน) — หัวหน้าภาคย้ายภาคตามสาขา
DOLD=$(DB "select code from \"Branch\" where code like 'D%' and \"cancelledAt\" is null and \"openedAt\" < now() - interval '4 years' order by \"openedAt\" limit 1")
COMP=$(DB "select code from \"Branch\" where code like 'C%' and \"cancelledAt\" is null and zone is not null order by code limit 1")
if [ -z "$DOLD" ] || [ -z "$COMP" ]; then echo "ข้ามทั้งชุด — ต้องมีสาขาแฟรนไชส์หมดประกันและสาขาบริษัท"; exit 0; fi
as_region_of() { DB "update \"User\" set region=(select region from \"Branch\" where code='$1') where \"employeeCode\"='S001'" >/dev/null; S=$(login S001); }
newwo() { POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W72\",\"symptom\":\"ทดสอบแหล่งของนอกสโตร์\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
st() { DB "select status from \"WorkOrder\" where id=$1"; }
pid() { DB "select id from \"SparePart\" where \"offCatalog\" and name='$1'"; }
# คำตอบของแถว: หาได้|ชิป|รายละเอียด|คนตอบ (ว่าง = -) · เวลาตอบแยกอีกตัว
ANS() { DB "select coalesce(p.\"offFound\"::text,'-')||'|'||coalesce(p.\"offKind\",'-')||'|'||coalesce(p.\"offDetail\",'-')||'|'||coalesce(p.\"offAnswerById\"::text,'-') from \"WorkOrderPart\" p join \"SparePart\" s on s.id=p.\"sparePartId\" where p.\"workOrderId\"=$1 and p.kind='$2' and s.name='$3'"; }
AT() { DB "select coalesce(p.\"offAnswerAt\"::text,'-') from \"WorkOrderPart\" p join \"SparePart\" s on s.id=p.\"sparePartId\" where p.\"workOrderId\"=$1 and p.kind='$2' and s.name='$3'"; }
SOURCES="ร้านหาของมาเอง · สั่งออนไลน์ · ของที่ทีมมีอยู่ · อื่น ๆ"
REASONS="ร้านแถวนี้ไม่มี · รุ่นเลิกผลิต · ต้องสั่งจากต่างประเทศ · อื่น ๆ"
D1="ร้านเจริญยนต์ทดสอบ ถ.มิตรภาพ 081-234-5678"
D2="ถามร้านในขอนแก่น 3 ร้านแล้ว ต้องสั่งจาก กทม."
F1="\"offFound\":true,\"offKind\":\"ร้านหาของมาเอง\",\"offDetail\":\"$D1\""
M2="\"offFound\":false,\"offKind\":\"ร้านแถวนี้ไม่มี\",\"offDetail\":\"$D2\""
# ระบุอะไหล่ที่มีแต่ของนอกสโตร์ — $2 = แถว JSON ของ offParts
PARTS() { POST $S "work-orders/$1/parts" "{\"needsParts\":true,\"offParts\":[$2]}"; }

echo "═══ ระบุอะไหล่: ต้องตอบครบ (แฟรนไชส์หมดประกัน $DOLD)"
as_region_of $DOLD
W1=$(newwo $DOLD); IDS="$IDS $W1"
R1=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1}")
R2=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,\"offFound\":null,\"offKind\":null,\"offDetail\":null}")
[ "$(echo "$R1" | EMSG)" = "อะไหล่นอกสโตร์ “$N1”: บอกด้วยว่าหาได้หรือหาไม่ได้ — ไม่เห็นช่องนี้ในฟอร์ม = แอปรุ่นเก่า กดปุ่ม “อัปเดต” บนแถบบนก่อน" ] \
  && [ "$(echo "$R2" | EMSG)" = "อะไหล่นอกสโตร์ “$N1”: บอกด้วยว่าหาได้หรือหาไม่ได้" ] \
  && pass "ไม่ตอบหาได้/หาไม่ได้ → 400 · หน้าจอรุ่นเก่า (ไม่ส่งช่องเลย) บอกให้กดอัปเดต · หน้าจอใหม่ที่ยังไม่ตอบไม่มีคำนั้น" \
  || fail "ไม่ตอบ: $(echo "$R1" | EMSG) / $(echo "$R2" | EMSG)"
R3=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,\"offFound\":true}")
R4=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,\"offFound\":true,\"offKind\":\"ร้านแถวนี้ไม่มี\",\"offDetail\":\"$D1\"}")
R5=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,\"offFound\":true,\"offKind\":\"ร้านหาของมาเอง\",\"offDetail\":\"   \"}")
[ "$(echo "$R3" | EMSG)" = "อะไหล่นอกสโตร์ “$N1”: เลือกว่าหาได้จากที่ไหน ($SOURCES)" ] \
  && [ "$(echo "$R4" | EMSG)" = "อะไหล่นอกสโตร์ “$N1”: เลือกว่าหาได้จากที่ไหน ($SOURCES)" ] \
  && [ "$(echo "$R5" | EMSG)" = "อะไหล่นอกสโตร์ “$N1”: ใส่รายละเอียดว่าหาได้จากที่ไหน — ชื่อร้าน · ที่ตั้ง/ลิงก์ · เบอร์" ] \
  && pass "หาได้: ไม่เลือกแหล่ง / ใช้ชิปเหตุผลหาไม่ได้แทนแหล่ง / รายละเอียดเป็นช่องว่าง → 400 ภาษาไทยตามข้อที่ขาด" \
  || fail "หาได้ไม่ครบ: $(echo "$R3" | EMSG) / $(echo "$R4" | EMSG) / $(echo "$R5" | EMSG)"
R6=$(PARTS $W1 "{\"name\":\"$N2\",\"quantity\":1,\"offFound\":false,\"offKind\":\"สั่งออนไลน์\",\"offDetail\":\"$D2\"}")
R7=$(PARTS $W1 "{\"name\":\"$N2\",\"quantity\":1,\"offFound\":false,\"offKind\":\"ร้านแถวนี้ไม่มี\"}")
[ "$(echo "$R6" | EMSG)" = "อะไหล่นอกสโตร์ “$N2”: เลือกเหตุผลที่หาไม่ได้ ($REASONS)" ] \
  && [ "$(echo "$R7" | EMSG)" = "อะไหล่นอกสโตร์ “$N2”: ใส่รายละเอียดว่าทำไมหาไม่ได้ — ถามที่ไหนไปแล้ว · ต้องสั่งจากที่ไหน" ] \
  && pass "หาไม่ได้: ใช้ชิปแหล่งแทนเหตุผล / ไม่มีรายละเอียด → 400 ภาษาไทย (ข้อ 3 — บังคับเหตุผล + รายละเอียด)" \
  || fail "หาไม่ได้ไม่ครบ: $(echo "$R6" | EMSG) / $(echo "$R7" | EMSG)"
R8=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,\"offFound\":\"ใช่\",\"offKind\":\"ร้านหาของมาเอง\",\"offDetail\":\"$D1\"}")
R9=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,$F1},{\"name\":\"$N2\",\"quantity\":1,\"offFound\":false}")
echo "$R8" | grep -q "คำตอบหาได้/หาไม่ได้ของอะไหล่นอกสโตร์ไม่ถูกต้อง" \
  && [ "$(echo "$R9" | EMSG)" = "อะไหล่นอกสโตร์ “$N2”: เลือกเหตุผลที่หาไม่ได้ ($REASONS)" ] \
  && pass "ชนิดข้อมูลผิด → 400 ข้อความไทย · สองแถว แถวแรกครบ → ข้อความชี้แถวที่สอง" || fail "ชนิด/แถวที่สอง: $(echo "$R8" | head -c 200) / $(echo "$R9" | EMSG)"
[ "$(st $W1)|$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W1")|$(DB "select count(*) from \"SparePart\" where name in ('$N1','$N2')")" = "NEW|0|0" ] \
  && pass "ปฏิเสธทุกครั้ง: ใบยังรอระบุอะไหล่ ไม่มีแถวอะไหล่ ไม่สร้างแถวของนอกสโตร์ทิ้งไว้ (ฐานข้อมูล)" \
  || fail "หลังปฏิเสธ: $(st $W1) · แถว $(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$W1") · ของนอก $(DB "select count(*) from \"SparePart\" where name in ('$N1','$N2')")"

echo
echo "═══ ตอบครบ: เก็บคำตอบ · หาไม่ได้ไม่กันส่ง"
R=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,\"unit\":\"ชิ้น\",$F1},{\"name\":\"$N2\",\"quantity\":2,\"unit\":\"ตัว\",\"note\":\"ขนาด 30×62×16\",$M2}")
P1=$(pid "$N1"); P2=$(pid "$N2")
[ "$(st $W1)" = "PARTS_SOURCING" ] && pass "มีตัวที่หาไม่ได้ก็ส่งได้ — ใบไปแอดมินเช็คอะไหล่ตามเดิม (ข้อ 4)" || fail "สถานะ: $(st $W1) · $(echo "$R" | EMSG)"
[ "$(ANS $W1 WAITING "$N1")" = "true|ร้านหาของมาเอง|$D1|$SID" ] && [ "$(ANS $W1 WAITING "$N2")" = "false|ร้านแถวนี้ไม่มี|$D2|$SID" ] \
  && [ "$(AT $W1 WAITING "$N1")" != "-" ] && [ "$(AT $W1 WAITING "$N2")" != "-" ] \
  && pass "ฐานข้อมูล: หาได้ · ร้านหาของมาเอง · รายละเอียด / หาไม่ได้ · ร้านแถวนี้ไม่มี · รายละเอียด · คนตอบ = หัวหน้าภาค · มีเวลาตอบ" \
  || fail "คำตอบในฐานข้อมูล: $(ANS $W1 WAITING "$N1") / $(ANS $W1 WAITING "$N2")"
D=$(GET $A "work-orders/$W1")
DW() { echo "$D" | J 'const p=d.waitingParts.find(x=>x.name==='"'$1'"');p?[p.offCatalog,p.offFound,p.offKind,p.offDetail,p.offAnswerRole,p.offAnswerByName,!!p.offAnswerAt,p.unit,p.note??"-"].join("|"):"none"'; }
[ "$(DW "$N1")" = "true|true|ร้านหาของมาเอง|$D1|หัวหน้าภาค|$SNAME|true|ชิ้น|-" ] \
  && [ "$(DW "$N2")" = "true|false|ร้านแถวนี้ไม่มี|$D2|หัวหน้าภาค|$SNAME|true|ตัว|ขนาด 30×62×16" ] \
  && pass "หน้าใบงานได้คำตอบครบ + บทบาท/ชื่อคนตอบ + เวลา (หน้าจอขึ้น \"หัวหน้าภาคแจ้ง · เวลา\") · หน่วย/หมายเหตุเดิมอยู่ครบ" \
  || fail "หน้าใบงาน: $(DW "$N1") / $(DW "$N2")"

echo
echo "═══ แอดมินเช็คอะไหล่ — ผลเช็คของแอดมินไม่ทับคำตอบหัวหน้าภาค (ข้อ 1)"
R=$(POST $A "work-orders/$W1/parts-sourcing" "{\"results\":[{\"sparePartId\":$P1,\"inStock\":false},{\"sparePartId\":$P2,\"inStock\":true}]}")
INS() { DB "select coalesce(\"inStock\"::text,'-') from \"WorkOrderPart\" where \"workOrderId\"=$1 and \"sparePartId\"=$2 and kind='WAITING'"; }
[ "$(INS $W1 $P1)|$(INS $W1 $P2)|$(st $W1)" = "false|true|PARTS_SOURCING" ] \
  && [ "$(ANS $W1 WAITING "$N1")" = "true|ร้านหาของมาเอง|$D1|$SID" ] && [ "$(ANS $W1 WAITING "$N2")" = "false|ร้านแถวนี้ไม่มี|$D2|$SID" ] \
  && pass "แอดมินตอบต่างจากที่หัวหน้าภาคแจ้งได้ (ยังหาไม่ได้ / หาได้) · ผลเช็คเป็นของแอดมิน คำตอบหัวหน้าภาคยังอยู่ · ตัวที่หาไม่ได้รอของที่ขั้นเดิม (ฐานข้อมูล)" \
  || fail "เช็คอะไหล่: $(INS $W1 $P1)|$(INS $W1 $P2)|$(st $W1) · $(ANS $W1 WAITING "$N1") · $(echo "$R" | EMSG)"
NOTE=$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$W1 and action='PARTS_BACKORDERED' order by id desc limit 1")
echo "$NOTE" | grep -qF "$N1 ×1 — ยังหาไม่ได้ (หัวหน้าภาคแจ้งว่าหาได้)" && echo "$NOTE" | grep -qF "$N2 ×2 — หาได้ (หัวหน้าภาคแจ้งว่าหาไม่ได้)" \
  && pass "ประวัติเช็คอะไหล่บอกว่าต่างจากที่หัวหน้าภาคแจ้ง — คนอ่านย้อนหลังรู้ว่าเปลี่ยนเพราะเช็คแล้ว" || fail "ประวัติ: $NOTE"

echo
echo "═══ ส่งรายการเดิมซ้ำ — คำตอบไม่หาย เวลาคนตอบเดิม"
AT1=$(AT $W1 WAITING "$N1"); AT2=$(AT $W1 WAITING "$N2")
POST $A "work-orders/$W1/rollback" '{"toStage":"NEW","reason":"ทดสอบ — ระบุอะไหล่ใหม่"}' >/dev/null
[ "$(st $W1)|$(ANS $W1 WAITING "$N1")|$(AT $W1 WAITING "$N1")" = "NEW|true|ร้านหาของมาเอง|$D1|$SID|$AT1" ] \
  && pass "ย้อนกลับไประบุอะไหล่: ผลเช็คของแอดมินถูกล้างตามเดิม แต่คำตอบหัวหน้าภาคไม่หาย (ฐานข้อมูล)" || fail "หลังย้อน: $(st $W1) · $(ANS $W1 WAITING "$N1")"
sleep 1
R=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,\"unit\":\"อัน\",$F1},{\"name\":\"$N2\",\"quantity\":2,\"unit\":\"ตัว\",\"note\":\"ขนาด 30×62×16\",$M2}")
[ "$(st $W1)" = "PARTS_SOURCING" ] && [ "$(AT $W1 WAITING "$N1")|$(AT $W1 WAITING "$N2")" = "$AT1|$AT2" ] \
  && [ "$(ANS $W1 WAITING "$N1")" = "true|ร้านหาของมาเอง|$D1|$SID" ] \
  && [ "$(DB "select unit from \"WorkOrderPart\" where \"workOrderId\"=$W1 and \"sparePartId\"=$P1")" = "อัน" ] \
  && pass "ส่งคำตอบเดิมซ้ำ (แก้แค่หน่วย): คำตอบเดิม · เวลาตอบเดิมทั้งสองแถว · หน่วยใหม่ (ฐานข้อมูล)" \
  || fail "ส่งซ้ำ: $(st $W1) · เวลา $(AT $W1 WAITING "$N1") ≠ $AT1 หรือ $(AT $W1 WAITING "$N2") ≠ $AT2 · $(echo "$R" | EMSG)"
POST $A "work-orders/$W1/rollback" '{"toStage":"NEW","reason":"ทดสอบ — หาของได้แล้ว"}' >/dev/null
sleep 1
D2B="Shopee ร้านอะไหล่ทดสอบ (ลิงก์ในไลน์กลุ่ม)"
PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1,\"unit\":\"อัน\",$F1},{\"name\":\"$N2\",\"quantity\":2,\"unit\":\"ตัว\",\"note\":\"ขนาด 30×62×16\",\"offFound\":true,\"offKind\":\"สั่งออนไลน์\",\"offDetail\":\"$D2B\"}" >/dev/null
[ "$(ANS $W1 WAITING "$N2")" = "true|สั่งออนไลน์|$D2B|$SID" ] && [ "$(AT $W1 WAITING "$N2")" != "$AT2" ] && [ "$(AT $W1 WAITING "$N1")" = "$AT1" ] \
  && pass "เปลี่ยนคำตอบแถวเดียว (หาไม่ได้ → หาได้ · สั่งออนไลน์): แถวนั้นได้คำตอบ+เวลาใหม่ · อีกแถวเวลาเดิม (ฐานข้อมูล)" \
  || fail "เปลี่ยนคำตอบ: $(ANS $W1 WAITING "$N2") · $(AT $W1 WAITING "$N2") vs $AT2 · N1 $(AT $W1 WAITING "$N1") vs $AT1"
POST $A "work-orders/$W1/rollback" '{"toStage":"NEW","reason":"ทดสอบ — ส่งโดยไม่มีคำตอบ"}' >/dev/null
R=$(PARTS $W1 "{\"name\":\"$N1\",\"quantity\":1},{\"name\":\"$N2\",\"quantity\":2}")
echo "$R" | EMSG | grep -q "บอกด้วยว่าหาได้หรือหาไม่ได้" && [ "$(st $W1)" = "NEW" ] \
  && [ "$(ANS $W1 WAITING "$N1")|$(ANS $W1 WAITING "$N2")" = "true|ร้านหาของมาเอง|$D1|$SID|true|สั่งออนไลน์|$D2B|$SID" ] \
  && pass "ส่งรายการเดิมโดยไม่มีคำตอบ → 400 · คำตอบที่เก็บไว้ไม่ถูกล้าง (ฐานข้อมูล)" || fail "ส่งไม่มีคำตอบ: $(echo "$R" | EMSG) · $(ANS $W1 WAITING "$N1")"

echo
echo "═══ ใบเก่าที่ไม่มีคำตอบ — ไม่บังคับย้อนหลัง (ข้อ 6)"
W2=$(newwo $DOLD); IDS="$IDS $W2"
# ใบที่ระบุของนอกสโตร์ไว้ก่อนมีคำถามนี้ — แถวอะไหล่ไม่มีคำตอบ ใส่ทาง SQL แบบที่ migration ทิ้งไว้ให้แถวเดิม
P3=$(DB "insert into \"SparePart\"(\"partCode\",name,\"offCatalog\",\"updatedAt\") values ('[นอกสโตร์] $N3','$N3',true,now()) returning id" | head -1)
DB "insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",quantity,kind) values ($W2,$P3,1,'WAITING');
    update \"WorkOrder\" set status='PARTS_SOURCING', \"needsParts\"=true where id=$W2" >/dev/null
[ "$(GET $A "work-orders/$W2" | J 'const p=d.waitingParts[0];[p.offCatalog,p.offFound,p.offKind,p.offDetail,p.offAnswerAt,p.offAnswerRole].join("|")')" = "true|||||" ] \
  && pass "หน้าใบงานของใบเก่า: คำตอบว่างทุกช่อง (หน้าจอขึ้น \"ยังไม่ระบุ\")" || fail "ใบเก่า API: $(GET $A "work-orders/$W2" | J 'JSON.stringify(d.waitingParts[0])')"
R=$(POST $A "work-orders/$W2/parts-sourcing" "{\"results\":[{\"sparePartId\":$P3,\"inStock\":true}]}")
[ "$(st $W2)" != "PARTS_SOURCING" ] && [ "$(ANS $W2 WAITING "$N3")" = "-|-|-|-" ] \
  && pass "แอดมินเช็คใบเก่าต่อได้โดยไม่มีคำตอบของหัวหน้าภาค → $(st $W2) · แถวยังว่าง (ไม่บังคับย้อนหลัง)" || fail "เช็คใบเก่า: $(st $W2) · $(echo "$R" | EMSG)"
POST $A "work-orders/$W2/rollback" '{"toStage":"NEW","reason":"ทดสอบ — แก้รายการใบเก่า"}' >/dev/null
R=$(PARTS $W2 "{\"name\":\"$N3\",\"quantity\":1}")
R2=$(PARTS $W2 "{\"name\":\"$N3\",\"quantity\":1,\"offFound\":false,\"offKind\":\"รุ่นเลิกผลิต\",\"offDetail\":\"ตัวแทนไม่มีของแล้ว ต้องหารุ่นแทน\"}")
echo "$R" | EMSG | grep -q "“$N3”: บอกด้วยว่าหาได้หรือหาไม่ได้" \
  && [ "$(ANS $W2 WAITING "$N3")" = "false|รุ่นเลิกผลิต|ตัวแทนไม่มีของแล้ว ต้องหารุ่นแทน|$SID" ] && [ "$(st $W2)" = "PARTS_SOURCING" ] \
  && pass "แก้รายการใบเก่าครั้งหน้า: ต้องตอบ (400 ถ้าไม่ตอบ) · ตอบแล้วแถวเดิมได้คำตอบ (ฐานข้อมูล)" || fail "แก้ใบเก่า: $(echo "$R" | EMSG) / $(echo "$R2" | EMSG) · $(ANS $W2 WAITING "$N3")"

echo
echo "═══ ปิดงาน: ช่างซื้อเองถามแค่ซื้อจากที่ไหน (ข้อ 7 · สาขาบริษัท $COMP)"
as_region_of $COMP
TEAM=$(DB "select zone from \"Branch\" where code='$COMP'")
W3=$(newwo $COMP); IDS="$IDS $W3"
PARTS $W3 "{\"name\":\"$N1\",\"quantity\":1,$F1}" >/dev/null
POST $A "work-orders/$W3/parts-sourcing" "{\"results\":[{\"sparePartId\":$P1,\"inStock\":true}]}" >/dev/null
POST $A "work-orders/$W3/quote" '{"skip":true,"note":"ทดสอบ — ข้ามเสนอราคา"}' >/dev/null
POST $S "work-orders/$W3/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
POST $A "work-orders/$W3/parts-check" "{\"results\":[{\"sparePartId\":$P1,\"inStock\":true}]}" >/dev/null
POST $A "work-orders/$W3/confirm-appointment" '{}' >/dev/null
[ "$(st $W3)" = "ASSIGNED" ] || fail "เตรียมใบปิดงานไม่ถึงขั้นปล่อยงาน: $(st $W3)"
for r in NAMEPLATE BEFORE AFTER; do
  curl -s -X POST "localhost:4000/api/work-orders/$W3/attachments" -H "$(H $A)" -F "file=@$SP/site-photo.png;type=image/png" -F "role=$r" >/dev/null
done
# ชื่อไม่ใช่ CLOSE — นั่นคือตัวปิดงานของ claim-setup (ใบเคลม · ช่างของชุดเคลม) ที่ส่วนท้ายใช้ ตั้งชื่อซ้ำแล้วทับกัน
CLOSE_W3() { POST $A "work-orders/$W3/close" "{\"result\":\"FIXED\",\"note\":\"เปลี่ยนลูกบิดกับปะเก็น ทดสอบแหล่ง\",\"workerIds\":[$AID],$1}"; }
C1=$(CLOSE_W3 "\"offParts\":[{\"name\":\"$N1\",\"quantity\":1},{\"name\":\"$N4\",\"quantity\":1}]")
C2=$(CLOSE_W3 "\"offParts\":[{\"name\":\"$N1\",\"quantity\":1},{\"name\":\"$N4\",\"quantity\":1,\"offKind\":\"สั่งออนไลน์\"}]")
C3=$(CLOSE_W3 "\"offParts\":[{\"name\":\"$N4\",\"quantity\":1,\"offFound\":false,\"offKind\":\"ร้านแถวนี้ไม่มี\",\"offDetail\":\"ซื้อร้านหน้าสาขา\"}]")
[ "$(echo "$C1" | EMSG)" = "อะไหล่นอกสโตร์ “$N4”: เลือกว่าซื้อจากที่ไหน ($SOURCES) — ไม่เห็นช่องนี้ในฟอร์ม = แอปรุ่นเก่า กดปุ่ม “อัปเดต” บนแถบบนก่อน" ] \
  && [ "$(echo "$C2" | EMSG)" = "อะไหล่นอกสโตร์ “$N4”: ใส่รายละเอียดว่าซื้อจากที่ไหน — ชื่อร้าน · ที่ตั้ง/ลิงก์ · เบอร์" ] \
  && [ "$(echo "$C3" | EMSG)" = "อะไหล่นอกสโตร์ “$N4”: เลือกว่าซื้อจากที่ไหน ($SOURCES)" ] \
  && [ "$(st $W3)" = "ASSIGNED" ] \
  && pass "ของที่ซื้อเองไม่บอกแหล่ง / ไม่มีรายละเอียด / ใช้เหตุผลหาไม่ได้ → 400 ภาษาไทย · ของจากรายการรอ ($N1) ไม่ถูกถาม · ใบยังไม่ปิด" \
  || fail "ปิดงานไม่ครบ: $(echo "$C1" | EMSG) / $(echo "$C2" | EMSG) / $(echo "$C3" | EMSG) · $(st $W3)"
C4=$(CLOSE_W3 "\"parts\":[{\"sparePartId\":$P2,\"quantity\":1}],\"offParts\":[]")
[ "$(echo "$C4" | EMSG)" = "ของนอกสโตร์ที่ซื้อเองหน้างาน ใส่ในกล่องอะไหล่นอกสโตร์ พร้อมบอกว่าซื้อจากที่ไหน" ] && [ "$(st $W3)" = "ASSIGNED" ] \
  && pass "ของนอกสโตร์ที่ไม่อยู่ในใบส่งด้วยรหัส (ข้ามคำถาม) → 400 · ใบยังไม่ปิด" || fail "ส่งด้วยรหัส: $(echo "$C4" | EMSG) · $(st $W3)"
R=$(CLOSE_W3 "\"offParts\":[{\"name\":\"$N1\",\"quantity\":1},{\"name\":\"$N4\",\"quantity\":1,\"unit\":\"ชิ้น\",\"offKind\":\"ร้านหาของมาเอง\",\"offDetail\":\"ร้านหน้าสาขาทดสอบ 02-111-2222\"}]")
[ "$(st $W3)" = "DONE" ] && [ "$(ANS $W3 USED "$N4")" = "true|ร้านหาของมาเอง|ร้านหน้าสาขาทดสอบ 02-111-2222|$AID" ] \
  && [ "$(ANS $W3 USED "$N1")" = "-|-|-|-" ] && [ "$(ANS $W3 WAITING "$N1")" = "true|ร้านหาของมาเอง|$D1|$SID" ] \
  && pass "ปิดงานได้: ของที่ซื้อเอง = หาได้ · แหล่ง · รายละเอียด · คนปิด · ของจากรายการรอไม่มีคำตอบของตัวเอง · คำตอบหัวหน้าภาคในรายการรอยังอยู่ (ฐานข้อมูล)" \
  || fail "ปิดงาน: $(st $W3) · $(echo "$R" | EMSG) · ซื้อเอง $(ANS $W3 USED "$N4") · จากรายการ $(ANS $W3 USED "$N1")"
[ "$(GET $A "work-orders/$W3" | J 'const p=d.parts.find(x=>x.name==='"'$N4'"');p?[p.offFound,p.offKind,p.offAnswerRole].join("|"):"none"')" = "true|ร้านหาของมาเอง|แอดมิน" ] \
  && pass "หน้าใบงาน: อะไหล่ที่ใช้ได้คำตอบซื้อจากที่ไหน + บทบาทคนปิด" || fail "อะไหล่ที่ใช้ API: $(GET $A "work-orders/$W3" | J 'JSON.stringify(d.parts)' | head -c 300)"

echo
echo "═══ ใบรออะไหล่ที่แยกจากใบนี้ได้คำตอบเดิมไปด้วย"
R=$(POST $A "work-orders/$W3/follow-up" "{\"parts\":[{\"sparePartId\":$P1,\"quantity\":1}],\"note\":\"ทดสอบแหล่ง — ของไม่ครบ\"}")
CH=$(echo "$R" | J 'd.createdChild?d.createdChild.id:""'); [ -n "$CH" ] && IDS="$CH $IDS"
[ -n "$CH" ] && [ "$(ANS $CH WAITING "$N1")" = "true|ร้านหาของมาเอง|$D1|$SID" ] && [ "$(AT $CH WAITING "$N1")" = "$(AT $W3 WAITING "$N1")" ] \
  && [ "$(DB "select coalesce(unit,'-') from \"WorkOrderPart\" where \"workOrderId\"=$CH and \"sparePartId\"=$P1")" = "-" ] \
  && pass "แยกใบรออะไหล่: ของนอกสโตร์ตัวเดิมได้คำตอบ · คนตอบ · เวลาเดิมจากใบต้นทาง (ไม่ขึ้น \"ยังไม่ระบุ\") (ฐานข้อมูล)" \
  || fail "ใบรออะไหล่: $(echo "$R" | EMSG) · $( [ -n "$CH" ] && ANS $CH WAITING "$N1")"

echo
echo "═══ ปิดซ้ำหลังเคลมถูกตีกลับ · หัวหน้าภาคปิดแทน · ปิดย้อนหลัง — คำตอบ \"ซื้อจาก\" เดิมไม่หาย (สาขาในประกัน $BC)"
# replaceParts ลบแล้วสร้างแถวที่ใช้ไปใหม่ทั้งชุดทุกทางปิด — ถ้าไม่ติดคำตอบเดิมมา (withOldAnswers) แถวที่ช่างซื้อเองรอบก่อน
# จะกลายเป็น "ยังไม่ระบุ" (ทางที่ส่งแค่รหัส) หรือได้เวลาตอบเป็นตอนที่แค่กดปิดซ้ำ (ทางที่ฟอร์มเติมคำตอบเดิมไว้ให้)
as_region_of $BC
D5="ร้านวัสดุทดสอบ หน้าตลาดกระบี่ 075-111-222"
B5="{\"name\":\"$N5\",\"quantity\":1,\"offKind\":\"ร้านหาของมาเอง\",\"offDetail\":\"$D5\"}"
TODAY=$(day 0)
# ช่างปิดงานพร้อมเคลม + ของนอกสโตร์ที่ซื้อเอง — $1 ใบเคลม (JSON) · ใช้ CLOSE ของ claim-setup (ป้าย/เช็ค/เหตุผลตั้งต้น)
CLOSE_OFF() { CLOSE "$1" "$PLATE" "$CHECK" "$(claim_skips "$1")" "\"offParts\":[$B5]"; }
# ใบที่ช่างปิดพร้อมของซื้อเอง แล้ว Admin Spare Part ตีกลับ — เหลือแถวที่ใช้ไปพร้อมคำตอบรอบแรก ใบกลับมาที่ช่าง
sent_back() {
  claim_order 1
  claim_files $PID
  local r; r=$(CLOSE_OFF "[$(claim_json $PID)]")
  [ "$(echo "$r" | J 'd.status')" = "CLAIM_REVIEW" ] || fail "เตรียม: ปิดงานพร้อมเคลมไม่ถึงรอตรวจเคลม ($(echo "$r" | EMSG))"
  P5=$(pid "$N5")
  AT5=$(AT $ID USED "$N5")
  MS5=$(DB "select (extract(epoch from p.\"offAnswerAt\")*1000)::bigint from \"WorkOrderPart\" p where p.\"workOrderId\"=$ID and p.kind='USED' and p.\"sparePartId\"=$P5")
  POST $PA "work-orders/$ID/claim-review" '{"approve":false,"reason":"รูปชิ้นส่วนไม่ชัด ถ่ายใหม่ ทดสอบแหล่ง"}' >/dev/null
}

sent_back
FIRST="true|ร้านหาของมาเอง|$D5|$TID"
[ "$(st $ID)|$(ANS $ID USED "$N5")|$(AT $ID USED "$N5")" = "IN_PROGRESS|$FIRST|$AT5" ] && [ "$AT5" != "-" ] \
  && pass "ตีกลับ: ใบกลับมาที่ช่าง · แถวที่ใช้ไปยังมีคำตอบซื้อจากที่ไหน + คนตอบ (ช่าง) + เวลาของรอบแรก (ฐานข้อมูล)" \
  || fail "หลังตีกลับ: $(st $ID) · $(ANS $ID USED "$N5") · $(AT $ID USED "$N5") vs $AT5"
sleep 1
C2="[$(claim_json $PID "ประตูล็อกไม่ลง ขึ้น Error dL ตอนกดเริ่ม ทดสอบแหล่ง")]"
R=$(CLOSE_OFF "$C2")
[ "$(st $ID)" = "CLAIM_REVIEW" ] && [ "$(ANS $ID USED "$N5")|$(AT $ID USED "$N5")" = "$FIRST|$AT5" ] \
  && pass "ช่างปิดซ้ำหลังตีกลับ (ฟอร์มเติมคำตอบเดิมไว้ให้ ส่งกลับมาเหมือนเดิม): คำตอบ · คนตอบ · เวลาตอบของรอบแรก (ฐานข้อมูล)" \
  || fail "ปิดซ้ำ: $(st $ID) · $(echo "$R" | EMSG) · $(ANS $ID USED "$N5") · $(AT $ID USED "$N5") vs $AT5"
[ "$(GET $A "work-orders/$ID" | J 'const p=d.parts.find(x=>x.name==='"'$N5'"');p?[p.offFound,p.offKind,p.offDetail,new Date(p.offAnswerAt).getTime()].join("|"):"none"')" \
    = "true|ร้านหาของมาเอง|$D5|$MS5" ] && [ -n "$MS5" ] \
  && pass "หน้าใบงานหลังปิดซ้ำ: \"ซื้อจาก · ร้านหาของมาเอง\" + รายละเอียด + เวลาตอบของรอบแรก (ไม่ใช่เวลาที่กดปิดซ้ำ)" \
  || fail "หน้าใบงานหลังปิดซ้ำ: $(GET $A "work-orders/$ID" | J 'JSON.stringify(d.parts)' | head -c 300)"

POST $PA "work-orders/$ID/claim-review" '{"approve":false,"reason":"วิดีโอยังไม่เห็นมิเตอร์ ทดสอบแหล่ง"}' >/dev/null
sleep 1
R=$(POST $S "work-orders/$ID/supervisor-close" "{\"reason\":\"TECH_FIXED\",\"note\":\"ช่างเข้าซ่อมเสร็จแล้ว ทดสอบแหล่งปิดแทน\",\"workerIds\":[$TID],\"visitDate\":\"$TODAY\",\"parts\":[{\"sparePartId\":$PID,\"quantity\":1},{\"sparePartId\":$P5,\"quantity\":1}]}")
[ "$(st $ID)" = "DONE" ] && [ "$(ANS $ID USED "$N5")|$(AT $ID USED "$N5")" = "$FIRST|$AT5" ] \
  && pass "หัวหน้าภาคปิดแทน (ส่งแค่รหัส ไม่มีช่องคำตอบ): ของที่ช่างซื้อเองยังมีคำตอบ · คนตอบ · เวลาเดิม ไม่กลายเป็น \"ยังไม่ระบุ\" (ฐานข้อมูล)" \
  || fail "ปิดแทน: $(st $ID) · $(echo "$R" | EMSG) · $(ANS $ID USED "$N5") · $(AT $ID USED "$N5") vs $AT5"

sent_back
[ "$(st $ID)|$(ANS $ID USED "$N5")" = "IN_PROGRESS|$FIRST" ] || fail "เตรียมปิดย้อนหลัง: $(st $ID) · $(ANS $ID USED "$N5")"
sleep 1
DONE_AT=$(node -e 'console.log(new Date(Date.now()-60e3).toISOString())')
# วันเข้างาน = วันไทยของเวลาซ่อมเสร็จ — คร่อมเที่ยงคืนแล้ววันเข้างานต้องไม่หลังเวลาเสร็จ
DONE_DAY=$(node -e 'console.log(new Date(Date.parse(process.argv[1])+7*3600e3).toISOString().slice(0,10))' "$DONE_AT")
R=$(POST $A "work-orders/$ID/backfill-close" "{\"reason\":\"ช่างซ่อมเสร็จแล้วแต่ไม่ได้กดในแอป\",\"team\":\"กระบี่\",\"visitDate\":\"$DONE_DAY\",\"result\":\"FIXED\",\"closedAt\":\"$DONE_AT\",\"workerIds\":[$TID],\"note\":\"ทดสอบแหล่ง ปิดย้อนหลัง\",\"parts\":[{\"sparePartId\":$PID,\"quantity\":1},{\"sparePartId\":$P5,\"quantity\":1}]}")
[ "$(st $ID)" = "DONE" ] && [ "$(ANS $ID USED "$N5")|$(AT $ID USED "$N5")" = "$FIRST|$AT5" ] \
  && pass "แอดมินปิดย้อนหลัง (ส่งแค่รหัส): ของที่ช่างซื้อเองยังมีคำตอบ · คนตอบ · เวลาเดิม (ฐานข้อมูล)" \
  || fail "ปิดย้อนหลัง: $(st $ID) · $(echo "$R" | EMSG) · $(ANS $ID USED "$N5") · $(AT $ID USED "$N5") vs $AT5"

# ไม่ใช่ [ -z "$FAILED" ] เปล่า ๆ — claim-setup ตั้ง trap ERR ไว้ บรรทัดนั้นจะพิมพ์ FAIL "หยุดกลางทาง" ซ้ำอีกบรรทัด
[ -z "${FAILED:-}" ] || exit 1
