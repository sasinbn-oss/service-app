#!/bin/bash
# ทดสอบ: อะไหล่ที่ไปแต่ละสาขา (GET /work-orders/reports/branch-parts — เจ้าของงานขอ ต.ค. 69)
#   · นับเป็นชิ้น (quantity 3 = 3) แยก "ใช้แล้ว" (USED ของใบที่ช่างปิดแล้ว) กับ "เบิกแล้ว · งานยังไม่จบ" (ออกจากคลังแล้ว ใบยังไม่ปิด)
#     ใบหนึ่งอยู่แบบเดียว — ใบที่ปิดแล้วไม่นับตัวที่เบิกซ้ำ · ใบที่แอดมินเปิดงานใหม่ไม่นับ USED ที่ค้าง
#     · ใบที่เคลมถูกตีกลับ (รอช่างปิดใหม่) ยังนับใช้แล้วตามรอบที่ปิด ไม่นับตัวที่เบิก
#   · ของนอกสโตร์อยู่ใน "ใช้แล้ว" พร้อมป้าย ไม่มีวันเป็น "เบิกแล้ว" · ยกเลิก/ใบทดสอบไม่นับ · ใบรออะไหล่ (ใบแยก) · ใบงาน SUB นับปกติ
#   · ค่าเริ่มต้น = ทั้งหมด (ใบปี 2566 ยังขึ้น) · ปุ่มช่วงวันที่แต่ละแบบตัดตามวันไทยตรงขอบ · วันเบิกโอน = ประวัติโอน
#   · กรองภาค/ทีม/ค้นหา (ไม่ตีความ % เป็น wildcard) · ตามอะไหล่รวมได้เท่าตามสาขา · หน้าถัดไป · แถวของกลุ่ม · สาขา/เครื่อง (ลิงก์ในใบงาน)
#   · Excel อ่านได้ ยอดตรง ใช้แล้ว/เบิกแล้วคนละคอลัมน์ ไม่มีช่องรวม · คำขอผิดได้ 400 ภาษาไทย (30 ก.พ. · ปี 0000 · NUL · ช่องซ้ำ) · สิทธิ์: แอดมิน/Super Admin เท่านั้น — ดูในฐานะหัวหน้าภาคก็ 403
#   ตัวเลขทุกชุดเทียบกับฐานข้อมูลตรง ๆ ด้วย psql ไม่ใช่เทียบกับ API อย่างเดียว
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAtc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
REP() { curl -s "localhost:4000/api/work-orders/reports/branch-parts$2" -H "$(H $1)"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/work-orders/reports/branch-parts$2" -H "$(H $1)"; }
enc() { node -pe 'encodeURIComponent(process.argv[1])' "$1"; }

SUF=$((RANDOM % 90000 + 10000))
# สาขาขึ้นต้น C = สาขาบริษัท — ใบที่เดินผ่าน API จริงไม่ต้องเสนอราคา
M="CZB$SUF"; BA="${M}A"; BB="${M}B"; BC="${M}C"; BD="CZD$SUF"; BE="CZE$SUF"
R1="ภาคทดสอบอะไหล่สาขา$SUF-1"; R2="ภาคทดสอบอะไหล่สาขา$SUF-2"; R3="ภาคทดสอบอะไหล่สาขา$SUF-3"
T1="ทีมทดสอบอะไหล่$SUF-1"; T2="ทีมทดสอบอะไหล่$SUF-2"; T3="ทีมทดสอบอะไหล่$SUF-3"
L94="คลังลาดพร้าว 94"
START=$(DB "select coalesce(max(id),0) from \"ViewAsLog\"")
cleanup() {
  DB "delete from \"WorkOrder\" where code like 'ZBW$SUF-%' or \"branchId\" in (select id from \"Branch\" where code in ('$BA','$BB','$BC','$BD','$BE'));
      delete from \"Branch\" where code in ('$BA','$BB','$BC','$BD','$BE');
      delete from \"SparePart\" where \"partCode\" like 'ZBP-$SUF-%' or \"partCode\" = '[นอกสโตร์] สายพานร้านข้างนอก $SUF';
      delete from \"ViewAsLog\" where id > $START;
      delete from \"User\" where \"employeeCode\" like 'ZBP%$SUF';
      update \"User\" set role='EMPLOYEE', team='กรุงเทพ' where \"employeeCode\"='T001';
      update \"User\" set role='SUPERVISOR', region='ใต้' where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT

A=$(login A001); T=$(login T001); S=$(login S001)
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'"); TNAME=$(DB "select name from \"User\" where id=$TID")

# ── สาขา อะไหล่ เครื่อง (ข้อมูลสมมติทั้งหมด) ──
DB "insert into \"Branch\"(code,name,region,zone) values
  ('$BA','ร้านทดสอบ$SUF เอ','$R1','$T1'),('$BB','ร้านทดสอบ$SUF บี','$R1','$T2'),
  ('$BC','ร้านทดสอบ$SUF ซี','$R2','$T2'),('$BD','ร้านทดสอบช่วงวันที่ $SUF','$R3','$T3'),('$BE','ร้านทดสอบเคลมตีกลับ $SUF','$R3','$T3')"
DB "insert into \"SparePart\"(\"partCode\",name,\"offCatalog\",\"updatedAt\") values
  ('ZBP-$SUF-P1','ตลับลูกปืนทดสอบ $SUF',false,now()),('ZBP-$SUF-P2','บอร์ดทดสอบ $SUF',false,now()),
  ('ZBP-$SUF-P3','วาล์วทดสอบ $SUF',false,now()),('ZBP-$SUF-DT','อะไหล่ทดสอบช่วงวันที่ $SUF',false,now()),
  ('[นอกสโตร์] สายพานร้านข้างนอก $SUF','สายพานร้านข้างนอก $SUF',true,now())"
pid() { DB "select id from \"SparePart\" where \"partCode\"='$1'"; }
P1=$(pid ZBP-$SUF-P1); P2=$(pid ZBP-$SUF-P2); P3=$(pid ZBP-$SUF-P3); DT=$(pid ZBP-$SUF-DT); OFF=$(pid "[นอกสโตร์] สายพานร้านข้างนอก $SUF")
DB "insert into \"Machine\"(\"branchId\",code,type,brand,\"updatedAt\") values
  ((select id from \"Branch\" where code='$BA'),'W1','WASHER','Speed Queen',now()),
  ((select id from \"Branch\" where code='$BA'),'W2','WASHER',null,now()),
  ((select id from \"Branch\" where code='$BB'),'W1','WASHER',null,now())"
mid() { DB "select m.id from \"Machine\" m join \"Branch\" b on b.id=m.\"branchId\" where b.code='$1' and m.code='$2'"; }
MA1=$(mid $BA W1); MA2=$(mid $BA W2); MB1=$(mid $BB W1)

# ใบงาน: $1 ป้าย $2 สาขา $3 ขั้น $4 เวลาปิด (นิพจน์ SQL หรือ null) $5 เครื่อง $6 คอลัมน์เพิ่ม $7 ค่าเพิ่ม
wo() {
  DB "insert into \"WorkOrder\"(code,\"branchId\",\"machineId\",title,status,\"closedAt\",\"closedById\",\"updatedAt\"$6)
      values ('ZBW$SUF-$1',(select id from \"Branch\" where code='$2'),nullif('$5','')::int,'ทดสอบรายงานอะไหล่ที่ไปแต่ละสาขา','$3',
              $4,case when ($4) is null then null else $TID end,now()$7) returning id"
}
# แถวอะไหล่: $1 ใบ $2 อะไหล่ $3 จำนวน $4 USED/WAITING $5 คอลัมน์เพิ่ม $6 ค่าเพิ่ม
part() { DB "insert into \"WorkOrderPart\"(\"workOrderId\",\"sparePartId\",quantity,kind$5) values ($1,$2,$3,'$4'$6)"; }
ISS=',"inStock",warehouse,"requisitionNo","checkedAt"'
iss() { echo ",true,'$L94','$1',$2"; }

# O1 สาขา A ปิดแล้ว: ใช้ P1 ×3 + ของนอกสโตร์ ×1 · ตัวที่เบิกไว้ก่อนปิด (P1 ×3) ต้องไม่นับซ้ำ
O1=$(wo 01 $BA DONE "now()-interval '10 days'" $MA1)
part $O1 $P1 3 USED; part $O1 $OFF 1 USED; part $O1 $P1 3 WAITING "$ISS" "$(iss RQ-ZBP1 "now()-interval '12 days'")"
# O2 สาขา A ยังไม่จบ (รอคอนเฟิร์มลูกค้า): P2 ×2 เบิกแล้ว · P3 เช็คว่ามีแต่ยังไม่มีเลขใบเบิก = ยังไม่เบิก
O2=$(wo 02 $BA AWAITING_CONFIRM null $MA1)
part $O2 $P2 2 WAITING "$ISS" "$(iss RQ-ZBP2 "now()-interval '2 days'")"
part $O2 $P3 1 WAITING ',"inStock",warehouse,"checkedAt"' ",true,'$L94',now()-interval '2 days'"
# O3 สาขา B แอดมินเปิดงานใหม่ ช่างเข้างานอีกรอบ (คนปิดถูกล้าง): P1 ×1 เบิกเพื่อโอน (เช็คเมื่อ 20 วันก่อน โอนเมื่อ 5 วันก่อน)
#    USED P2 ×5 ค้างจากรอบก่อน (ไม่นับ — รอบใหม่) · ของนอกสโตร์มีเลขใบเบิก (ข้อมูลผิดปกติ — ต้องไม่เป็น "เบิกแล้ว")
O3=$(wo 03 $BB IN_PROGRESS null $MB1)
part $O3 $P1 1 WAITING ',"inStock",warehouse,"transferFrom","transferReqNo","transferNo","checkedAt"' \
  ",true,'$L94','คลังภูเก็ต','PK-ZBP3','TR-ZBP3',now()-interval '20 days'"
part $O3 $OFF 1 WAITING "$ISS" "$(iss RQ-ZBPOFF "now()-interval '20 days'")"
part $O3 $P2 5 USED
DB "insert into \"WorkOrderLog\"(\"workOrderId\",action,status,\"createdAt\") values ($O3,'TRANSFER_REQUESTED','PARTS_IN_TRANSIT',now()-interval '5 days')"
# O4 สาขา B รอตรวจเคลม (ช่างปิดแล้ว): ใช้ P2 ×1 + ส่งเคลม · ตัวที่เบิกไว้ไม่นับซ้ำ
O4=$(wo 04 $BB CLAIM_REVIEW "now()-interval '3 days'" $MB1)
part $O4 $P2 1 USED; part $O4 $P2 1 WAITING "$ISS" "$(iss RQ-ZBP4 "now()-interval '6 days'")"
DB "insert into \"PartClaim\"(\"workOrderId\",\"sparePartId\",\"partCode\",\"partName\",\"branchCode\",\"branchName\",symptom,\"checkNote\")
    values ($O4,$P2,'ZBP-$SUF-P2','บอร์ดทดสอบ $SUF','$BB','ร้านทดสอบ$SUF บี','ทดสอบ','ทดสอบ')"
# O5 สาขา C ยกเลิก (เบิกแล้วและมี USED) · O6 ใบทดสอบที่ปิดแล้ว · O6B ใบทดสอบที่ยังไม่จบ (คัดลอกเลขใบเบิกมา) — ไม่นับทั้งหมด
O5=$(wo 05 $BC CANCELLED null "")
part $O5 $P1 4 WAITING "$ISS" "$(iss RQ-ZBP5 "now()-interval '4 days'")"; part $O5 $P1 4 USED
O6=$(wo 06 $BC DONE "now()-interval '1 day'" "" ',"isTest","testOfId"' ",true,$O1")
part $O6 $P1 7 USED
O6B=$(wo 06B $BC AWAITING_CONFIRM null "" ',"isTest","testOfId"' ",true,$O2")
part $O6B $P1 7 WAITING "$ISS" "$(iss RQ-ZBP6 "now()-interval '1 day'")"
# O7 สาขา C ใบรออะไหล่ (ใบแยกจาก O1) ทีม SUB ปิดแล้ว: ใช้ P3 ×2
O7=$(wo 07 $BC DONE "now()-interval '1 day'" "" ',"parentId","closeSubTeam"' ",$O1,'ทีม SUB ทดสอบ $SUF'")
part $O7 $P3 2 USED
# O8 สาขา A ปิดไปตั้งแต่ปี 2566 (เครื่อง W2): ใช้ P3 ×1 — ค่าเริ่มต้น "ทั้งหมด" ต้องเห็น
O8=$(wo 08 $BA DONE "'2023-03-15 03:00:00'" $MA2)
part $O8 $P3 1 USED
# O10 สาขา E เคลมถูกตีกลับ รอช่างปิดใหม่ (ตีกลับล้างแค่เวลาปิด คนปิดยังอยู่): ช่างใส่ P1 ×2 ไปแล้วตอนปิด 8 วันก่อน
#     → ยังนับใช้แล้ว 2 ลงวันที่ปิดรอบนั้น · ตัวที่เบิกไว้ (P1 ×1) ไม่นับเป็นเบิกแล้ว (ใบหนึ่งอยู่แบบเดียว)
O10=$(wo 10 $BE IN_PROGRESS null "")
DB "update \"WorkOrder\" set \"closedById\"=$TID where id=$O10"
part $O10 $P1 2 USED; part $O10 $P1 1 WAITING "$ISS" "$(iss RQ-ZBP10 "now()-interval '9 days'")"
DB "insert into \"WorkOrderLog\"(\"workOrderId\",action,status,\"createdAt\") values
    ($O10,'CLOSED','CLAIM_REVIEW',now()-interval '8 days'),($O10,'CLAIM_REJECTED','IN_PROGRESS',now()-interval '6 days')"
DB "insert into \"PartClaim\"(\"workOrderId\",\"sparePartId\",\"partCode\",\"partName\",\"branchCode\",\"branchName\",symptom,\"checkNote\",status)
    values ($O10,$P1,'ZBP-$SUF-P1','ตลับลูกปืนทดสอบ $SUF','$BE','ร้านทดสอบเคลมตีกลับ $SUF','ทดสอบ','ทดสอบ','REJECTED')"

# O9 สาขา A เดินผ่าน API จริง: ระบุอะไหล่ → เช็คคลัง → นัดวัน → แอดมินเบิก (ใบเบิก RQ-ZBP9) → รอคอนเฟิร์มลูกค้า
O9=$(POST $A work-orders "{\"branchCode\":\"$BA\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"W9\",\"symptom\":\"ทดสอบรายงานอะไหล่ที่ไปแต่ละสาขา\"}]}" | J 'd.orders[0].id')
POST $A "work-orders/$O9/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$P2,\"quantity\":2}]}" >/dev/null
POST $A "work-orders/$O9/parts-sourcing" "{\"results\":[{\"sparePartId\":$P2,\"inStock\":true,\"warehouse\":\"$L94\"}]}" >/dev/null
VISIT=$(node -e "console.log(new Date(Date.now()+7*3600e3+3*86400e3).toISOString().slice(0,10))")
POST $A "work-orders/$O9/assign" "{\"team\":\"$T1\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
POST $A "work-orders/$O9/parts-check" "{\"results\":[{\"sparePartId\":$P2,\"inStock\":true,\"warehouse\":\"$L94\",\"requisitionNo\":\"RQ-ZBP9\"}]}" >/dev/null
[ "$(DB "select w.status||'|'||p.\"requisitionNo\"||'|'||p.quantity from \"WorkOrder\" w join \"WorkOrderPart\" p on p.\"workOrderId\"=w.id where w.id=$O9 and p.kind='WAITING'")" = "AWAITING_CONFIRM|RQ-ZBP9|2" ] \
  && pass "เตรียมใบผ่าน API จริง: ระบุ → เช็คคลัง → นัด → เบิก RQ-ZBP9 → รอคอนเฟิร์มลูกค้า (ฐานข้อมูล)" || fail "ใบผ่าน API: $(DB "select status from \"WorkOrder\" where id=$O9")"

# ── ช่วงวันที่: สาขา D ใบปิดแล้วตรงขอบของแต่ละปุ่ม (วันไทย) จำนวนเป็นเลขยกกำลังสอง ยอดรวมบอกได้ว่าแถวไหนเข้า ──
FX=$(node -e '
const B=7*3600e3, now=Date.now(), ymd=t=>new Date(t+B).toISOString().slice(0,10), today=ymd(now);
const y=+today.slice(0,4), m=+today.slice(5,7)-1, d=(Y,M,D)=>new Date(Date.UTC(Y,M,D)).toISOString().slice(0,10), st=(Y,M)=>Date.UTC(Y,M,1)-B;
const fx=[[1,st(y,m)],[2,st(y,m)-60e3],[4,st(y,m-2)],[8,st(y,m-2)-60e3],[16,st(y,0)],[32,st(y,0)-60e3],[64,Date.UTC(2023,2,15,3)],[128,now-5*60e3],[256,st(y,m-1)-60e3]];
const issued=[512,Date.UTC(2023,2,15,3)];
const R={all:[null,null],thisMonth:[d(y,m,1),today],lastMonth:[d(y,m-1,1),d(y,m,0)],"3months":[d(y,m-2,1),today],thisYear:[d(y,0,1),today]};
const c=ymd(st(y,m)); R.custom=[c,c];
const sum=([f,t])=>[...fx,issued].filter(([,ms])=>(!f||ymd(ms)>=f)&&(!t||ymd(ms)<=t)).reduce((n,[q])=>n+q,0);
const sql=ms=>new Date(ms).toISOString().replace("T"," ").replace("Z","");
for(const [q,ms] of fx) console.log(`F ${q} ${sql(ms)}`);
console.log(`I ${issued[0]} ${sql(issued[1])}`);
for(const [k,r] of Object.entries(R)) console.log(`R ${k} ${r[0]??"-"} ${r[1]??"-"} ${sum(r)}`);')
while read -r TAG Q D1 D2; do
  [ "$TAG" = F ] || continue
  W=$(wo "D$Q" $BD DONE "'$D1 $D2'" ""); part $W $DT $Q USED
done <<< "$FX"
read -r _ IQ ID1 ID2 <<< "$(echo "$FX" | grep '^I ')"
WI=$(wo DI $BD AWAITING_CONFIRM null ""); part $WI $DT $IQ WAITING "$ISS" "$(iss RQ-ZBPD "'$ID1 $ID2'")"

ST=$(DB "select string_agg(status||(case when \"isTest\" then '*' else '' end),',' order by code) from \"WorkOrder\" where code like 'ZBW$SUF-0%'")
[ "$ST" = "DONE,AWAITING_CONFIRM,IN_PROGRESS,CLAIM_REVIEW,CANCELLED,DONE*,AWAITING_CONFIRM*,DONE,DONE" ] \
  && pass "เตรียมใบสมมติ: ปิดแล้ว · รอคอนเฟิร์ม · ช่างเข้างานรอบสอง · รอตรวจเคลม · ยกเลิก · ใบทดสอบ×2 · ใบแยก SUB · ปิดปี 2566 (ฐานข้อมูล)" || fail "สถานะใบสมมติ: $ST"

echo "═══ นับเป็นชิ้น แยกใช้แล้ว / เบิกแล้ว"
R=$(REP $A "?q=$M")
[ "$(echo "$R" | J '[d.range.key,d.range.from,d.range.to,d.range.label].join("|")')" = "all|||ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ)" ] \
  && pass "ไม่ส่งช่วงวันที่ = ทั้งหมด (ตั้งแต่เริ่มใช้ระบบ) ไม่มีวันเริ่ม" || fail "ช่วงเริ่มต้น: $(echo "$R" | J 'JSON.stringify(d.range)')"
[ "$(echo "$R" | J 'Object.values(d.summary).join(",")+"|"+Object.values(d.chips).join(",")')" = "3,4,7,8,5,13|13,8,5" ] \
  && pass "ตัวเลขบนสุด: 3 สาขา · 4 อะไหล่ · 7 ใบ · ใช้แล้ว 8 · เบิกแล้ว 5 · รวม 13 ชิ้น (ปุ่มสถานะ 13/8/5)" || fail "summary: $(echo "$R" | J 'JSON.stringify([d.summary,d.chips])')"
G() { echo "$R" | J "d.groups.map(g=>[g.key,g.used,g.issued,g.pieces,g.orders,g.partCount].join(':')).join(' ')"; }
[ "$(G)" = "$BA:5:4:9:4:4 $BB:1:1:2:2:2 $BC:2:0:2:1:1" ] \
  && pass "ตามสาขา: A ใช้ 5 เบิก 4 · B ใช้ 1 (รอตรวจเคลม) เบิก 1 (โอน) · C ใช้ 2 (ใบแยก) — มากสุดก่อน" || fail "กลุ่มสาขา: $(G)"
[ "$(echo "$R" | J "d.groups[0].topParts.filter(p=>p.sparePartId==$P1).map(p=>p.used+':'+p.issued).join()")" = "3:0" ] \
  && pass "จำนวน 3 = 3 ชิ้น (P1 ที่สาขา A) · ตัวที่เบิกไว้ก่อนปิดงานไม่นับซ้ำ" || fail "P1 ที่ A: $(echo "$R" | J 'JSON.stringify(d.groups[0].topParts)')"
DBA=$(DB "select coalesce(sum(p.quantity) filter (where p.kind='USED' and (w.status in ('DONE','CLAIM_REVIEW') or (w.\"closedById\" is not null and w.status<>'CANCELLED'))),0)||':'||
  coalesce(sum(p.quantity) filter (where p.kind='WAITING' and w.status not in ('DONE','CLAIM_REVIEW','CANCELLED') and w.\"closedById\" is null and not s.\"offCatalog\"
    and ((p.\"inStock\" and coalesce(p.\"requisitionNo\",'')<>'') or coalesce(p.\"transferReqNo\",'')<>'')),0)
  from \"WorkOrderPart\" p join \"WorkOrder\" w on w.id=p.\"workOrderId\" join \"Branch\" b on b.id=w.\"branchId\" join \"SparePart\" s on s.id=p.\"sparePartId\"
  where b.code='$BA' and not w.\"isTest\"")
[ "$DBA" = "5:4" ] && pass "สาขา A ตรงกับฐานข้อมูล (psql): ใช้แล้ว 5 · เบิกแล้ว 4" || fail "psql สาขา A = $DBA"

RP=$(REP $A "?q=$M&view=part")
GP() { echo "$RP" | J "d.groups.map(g=>[g.sparePartId,g.used,g.issued,g.pieces,g.branchCount,g.offCatalog].join(':')).join(' ')"; }
[ "$(GP)" = "$P2:1:4:5:2:false $P1:3:1:4:2:false $P3:3:0:3:2:false $OFF:1:0:1:1:true" ] \
  && pass "ตามอะไหล่: P2 5 · P1 4 · P3 3 · นอกสโตร์ 1 (offCatalog) — มากสุดก่อน" || fail "กลุ่มอะไหล่: $(GP)"
[ "$(echo "$RP" | J "d.groups.reduce((n,g)=>n+g.pieces,0)")|$(echo "$R" | J "d.groups.reduce((n,g)=>n+g.pieces,0)")" = "13|13" ] \
  && pass "รวมตามอะไหล่ = รวมตามสาขา = 13 ชิ้น" || fail "ยอดสองมุมไม่ตรง"
[ "$(echo "$RP" | J "d.groups.find(g=>g.sparePartId==$P1).topBranches.map(b=>b.branchCode+'×'+b.pieces).join(' ')")" = "$BA×3 $BB×1" ] \
  && pass "ไปที่สาขาไหนบ้าง: P1 → A ×3 · B ×1 (ใบยกเลิก/ใบทดสอบที่สาขา C ไม่ขึ้น)" || fail "topBranches P1"
[ "$(echo "$RP" | J "d.groups.find(g=>g.sparePartId==$OFF).issued")" = "0" ] \
  && pass "ของนอกสโตร์ที่มีเลขใบเบิก (ข้อมูลผิดปกติ) ไม่เป็น \"เบิกแล้ว\"" || fail "นอกสโตร์ขึ้นเป็นเบิกแล้ว"

RU=$(REP $A "?q=$M&kind=used"); RI=$(REP $A "?q=$M&kind=issued")
[ "$(echo "$RU" | J "d.groups.map(g=>g.key+':'+g.pieces).join(' ')+'|'+d.summary.used+','+d.summary.issued+'|'+d.chips.all")" = "$BA:5 $BC:2 $BB:1|8,0|13" ] \
  && [ "$(echo "$RI" | J "d.groups.map(g=>g.key+':'+g.pieces).join(' ')+'|'+d.summary.branches+','+d.summary.parts+','+d.summary.issued")" = "$BA:4 $BB:1|2,2,5" ] \
  && pass "ปุ่มสถานะ: ใช้แล้ว (A 5 · C 2 · B 1) · เบิกแล้ว (A 4 · B 1 · 2 สาขา 2 อะไหล่) · ตัวเลขบนปุ่มไม่เปลี่ยน" || fail "kind: $(echo "$RU" | J 'JSON.stringify(d.groups.map(g=>g.pieces))') / $(echo "$RI" | J 'JSON.stringify(d.groups.map(g=>g.pieces))')"

echo "═══ ช่วงวันที่ (วันไทย ตรงขอบ)"
while read -r TAG K F1 T1D EXP; do
  [ "$TAG" = R ] || continue
  if [ "$K" = custom ]; then QS="?branchCode=$BD&from=$F1&to=$T1D"; else QS="?branchCode=$BD&range=$K"; fi
  OUT=$(REP $A "$QS" | J '[d.range.key,d.range.from??"-",d.range.to??"-",d.summary.pieces].join(" ")')
  [ "$OUT" = "$K $F1 $T1D $EXP" ] && pass "ช่วง $K ($F1 – $T1D): $EXP ชิ้น — ขอบตามเวลาไทย" || fail "ช่วง $K: ได้ [$OUT] ควรเป็น [$K $F1 $T1D $EXP]"
done <<< "$FX"
[ "$(REP $A "?branchCode=$BD" | J 'd.summary.used+"|"+d.summary.issued')" = "511|512" ] \
  && pass "ไม่เลือกช่วง: ใบปี 2566 ทั้งใช้แล้วและเบิกแล้วยังขึ้น" || fail "ทั้งหมดไม่ครบ"
NOW7=$(node -e "console.log(new Date(Date.now()+7*3600e3-7*86400e3).toISOString().slice(0,10))")
TODAY=$(node -e "console.log(new Date(Date.now()+7*3600e3).toISOString().slice(0,10))")
OLD=$(node -e "console.log(new Date(Date.now()+7*3600e3-30*86400e3).toISOString().slice(0,10))")
OLD2=$(node -e "console.log(new Date(Date.now()+7*3600e3-10*86400e3).toISOString().slice(0,10))")
[ "$(REP $A "?branchCode=$BB&from=$NOW7&to=$TODAY" | J 'd.summary.issued+"|"+d.summary.used')|$(REP $A "?branchCode=$BB&from=$OLD&to=$OLD2" | J 'd.summary.pieces')" = "1|1|0" ] \
  && pass "เบิกเพื่อโอนนับวันจากประวัติโอน (5 วันก่อน) ไม่ใช่วันเช็คคลัง (20 วันก่อน)" || fail "วันเบิกโอน"
[ "$(CODE $A "?range=custom&from=$TODAY")|$(REP $A "?from=$TODAY&to=$OLD" | J d.error)|$(CODE $A "?view=xyz")" = "400|วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด|400" ] \
  && pass "ช่วงไม่ครบ / กลับหัว / มุมมองผิด = 400 ข้อความไทย" || fail "ตรวจคำขอผิด"
BAD=""
for qs in "?range=custom&from=2026-02-30&to=2026-03-05" "?from=0000-01-01&to=2026-01-01" "/counts?branchCode=$BA&from=0001-01-01&to=2026-01-01" \
          "?q=a%00b" "/detail?view=branch&key=a%00b" "?q=a&q=b" "?cursor=1&cursor=2" "?format=csv"; do
  OUT=$(curl -g -s -w '|%{http_code}' "localhost:4000/api/work-orders/reports/branch-parts$qs" -H "$(H $A)")
  echo "$OUT" | grep -qE '^\{"error":"[^"]*[ก-๙][^"]*"\}\|400$' || BAD="$BAD [$qs → $OUT]"
done
[ -z "$BAD" ] && pass "30 ก.พ. · ปี 0000/0001 · ตัวอักษร NUL · ช่องซ้ำ · รูปแบบไฟล์ผิด = 400 ข้อความไทย (ไม่ใช่ 500/อังกฤษ/ปัดไปวันอื่น)" || fail "คำขอผิด:$BAD"
[ "$(REP $A "?range=custom&from=2024-02-29&to=2024-02-29" | J 'd.range.from')" = "2024-02-29" ] && pass "29 ก.พ. ปีอธิกสุรทินยังใช้ได้" || fail "29 ก.พ. 2567"

echo "═══ ตัวกรอง · ค้นหา · หน้าถัดไป"
[ "$(REP $A "?region=$(enc "$R1")" | J "d.groups.map(g=>g.key).join(' ')+'|'+d.summary.pieces")" = "$BA $BB|11" ] \
  && pass "กรองภาค R1: สาขา A, B · 11 ชิ้น" || fail "ภาค"
[ "$(REP $A "?team=$(enc "$T2")" | J "d.groups.map(g=>g.key).join(' ')+'|'+d.summary.used+','+d.summary.issued")" = "$BB $BC|3,1" ] \
  && pass "กรองทีม T2 (ทีมของสาขา ข้ามภาคได้): B, C · ใช้ 3 เบิก 1" || fail "ทีม"
[ "$(REP $A "?q=ZBP-$SUF-P2" | J "d.groups.map(g=>g.key+':'+g.pieces).join(' ')")" = "$BA:4 $BB:1" ] \
  && pass "ค้นรหัสอะไหล่ P2: A 4 · B 1 (USED ค้างในใบที่เปิดกลับมาไม่นับ)" || fail "ค้นอะไหล่: $(REP $A "?q=ZBP-$SUF-P2" | J 'JSON.stringify(d.groups.map(g=>[g.key,g.pieces]))')"
[ "$(REP $A "?q=zbw$SUF-07" | J "d.groups.map(g=>g.key+':'+g.pieces).join(' ')")|$(REP $A "?q=$(enc "ร้านทดสอบ$SUF บี")" | J 'd.summary.pieces')" = "$BC:2|2" ] \
  && pass "ค้นเลขใบงาน (ตัวพิมพ์เล็กก็เจอ) · ค้นชื่อสาขา" || fail "ค้นใบงาน/ชื่อสาขา"
[ "$(REP $A "?q=$(enc "ZBP-$SUF-P%")" | J 'd.groupCount')" = "0" ] && pass "พิมพ์ % ค้นเป็นตัวอักษร ไม่ใช่ wildcard" || fail "% ถูกตีความ"
P1J=$(REP $A "?q=$M&limit=2"); C1=$(echo "$P1J" | J 'd.nextCursor'); P2J=$(REP $A "?q=$M&limit=2&cursor=$C1")
[ "$(echo "$P1J" | J "d.groups.map(g=>g.key).join(' ')+'|'+d.groupCount")|$C1|$(echo "$P2J" | J "d.groups.map(g=>g.key).join(' ')+'|'+d.nextCursor")" = "$BA $BB|3|2|$BC|null" ] \
  && pass "หน้าละ 2 กลุ่ม: หน้าแรก A B (มีหน้าถัดไป) · หน้าสอง C (หมดแล้ว)" || fail "หน้าถัดไป: $C1"
[ "$(REP $A "?q=$M&view=part&limit=3&cursor=3" | J "d.groups.map(g=>g.sparePartId).join()+'|'+d.nextCursor")" = "$OFF|null" ] \
  && pass "ตามอะไหล่หน้าสอง: เหลือของนอกสโตร์" || fail "หน้าถัดไปตามอะไหล่"

echo "═══ ยอดทั้งระบบเทียบฐานข้อมูล"
TOT_DB=$(DB "select coalesce(sum(p.quantity) filter (where p.kind='USED' and (w.status in ('DONE','CLAIM_REVIEW') or (w.\"closedById\" is not null and w.status<>'CANCELLED'))),0)||'|'||
  coalesce(sum(p.quantity) filter (where p.kind='WAITING' and w.status not in ('DONE','CLAIM_REVIEW','CANCELLED') and w.\"closedById\" is null and not s.\"offCatalog\"
    and ((p.\"inStock\" and coalesce(p.\"requisitionNo\",'')<>'') or coalesce(p.\"transferReqNo\",'')<>'')),0)
  from \"WorkOrderPart\" p join \"WorkOrder\" w on w.id=p.\"workOrderId\" join \"SparePart\" s on s.id=p.\"sparePartId\" where not w.\"isTest\"")
sumall() {  # ไล่ทุกหน้าของมุมมอง $1 รวมชิ้นทั้งหมด
  local cur="" n=0 page
  while :; do
    page=$(REP $A "?view=$1&limit=100${cur:+&cursor=$cur}")
    n=$((n + $(echo "$page" | J 'd.groups.reduce((n,g)=>n+g.pieces,0)')))
    cur=$(echo "$page" | J 'd.nextCursor||""'); [ -z "$cur" ] && break
  done; echo $n
}
ALL=$(REP $A "")
[ "$(echo "$ALL" | J 'd.chips.used+"|"+d.chips.issued')" = "$TOT_DB" ] && [ "$(sumall branch)" = "$(sumall part)" ] && [ "$(sumall branch)" = "$(echo "$ALL" | J 'd.summary.pieces')" ] \
  && pass "ทั้งระบบ: ใช้แล้ว|เบิกแล้ว = psql ($TOT_DB) · ทุกหน้าตามสาขา = ทุกหน้าตามอะไหล่ = ตัวเลขบนสุด" || fail "ทั้งระบบ API $(echo "$ALL" | J 'd.chips.used+"|"+d.chips.issued') psql $TOT_DB"
[ "$(echo "$ALL" | J "d.options.regions.includes('$R3')&&d.options.teams.includes('$T3')")" = "true" ] \
  && pass "ตัวเลือกภาค/ทีมมาจากทะเบียนสาขา" || fail "options"

echo "═══ แถวของกลุ่ม (กดเปิด)"
DET() { curl -s "localhost:4000/api/work-orders/reports/branch-parts/detail$2" -H "$(H $1)"; }
DA=$(DET $A "?view=branch&key=$BA")
[ "$(echo "$DA" | J "d.rowCount+'|'+d.rows.map(r=>r.kind[0]+r.quantity).join(',')+'|'+d.breakdown.map(b=>b.sparePartId+':'+b.pieces).slice(0,2).join(' ')")" = "5|I2,I2,U1,U3,U1|$P2:4 $P1:3" ] \
  && pass "เปิดสาขา A: 5 แถว ใหม่ไปเก่า (เบิก 2 · เบิก 2 · ใช้ 1 นอกสโตร์ · ใช้ 3 · ใช้ 1 ปี 2566) + ยอดแยกตามอะไหล่" || fail "detail A: $(echo "$DA" | J "d.rowCount+'|'+d.rows.map(r=>r.kind[0]+r.quantity).join(',')")"
ROW() { echo "$1" | J "JSON.stringify(d.rows.find(r=>$2))"; }
[ "$(ROW "$DA" "r.workOrderId==$O2" | J '[d.kindLabel,d.warehouse,d.requisitionNo,d.machineCode,d.machineBrand,d.detail].join("|")')" = "เบิกแล้ว · งานยังไม่จบ|$L94|RQ-ZBP2|W1|Speed Queen|$L94 · ใบเบิก RQ-ZBP2 · แอดมิน · คอนเฟิร์มลูกค้า" ] \
  && pass "แถวเบิกแล้ว: คลัง · เลขใบเบิก · เครื่อง · ขั้นตอน (P3 ที่ยังไม่มีเลขใบเบิกไม่ขึ้น)" || fail "แถว O2: $(ROW "$DA" "r.workOrderId==$O2")"
[ "$(ROW "$DA" "r.sparePartId==$OFF" | J '[d.kind,d.offCatalog,d.quantity,d.closedBy,d.detail.includes("นอกสโตร์"),/^ปิดงาน \d+ \S+ \d{2} · /.test(d.detail),d.requisitionNo].join("|")')" = "USED|true|1|$TNAME|false|true|" ] \
  && pass "ของนอกสโตร์: ใช้แล้ว · offCatalog (หน้าจอติดป้ายเอง บรรทัดรายละเอียดไม่พูดซ้ำ) · ช่างที่ปิด · วันปิดปีสองหลัก" || fail "แถวนอกสโตร์: $(ROW "$DA" "r.sparePartId==$OFF")"
[ "$(ROW "$DA" "r.workOrderId==$O9" | J '[d.kind,d.requisitionNo,d.quantity].join("|")')" = "ISSUED|RQ-ZBP9|2" ] \
  && pass "ใบที่เดินผ่าน API จริงขึ้นเป็นเบิกแล้ว 2 ชิ้น ใบเบิก RQ-ZBP9" || fail "แถว O9: $(ROW "$DA" "r.workOrderId==$O9")"
PG1=$(DET $A "?view=branch&key=$BA&limit=2"); PG3=$(DET $A "?view=branch&key=$BA&limit=2&cursor=4")
[ "$(echo "$PG1" | J 'd.rows.length+"|"+d.nextCursor')|$(echo "$PG3" | J 'd.rows.length+"|"+d.nextCursor+"|"+d.rows[0].day')" = "2|2|1|null|2023-03-15" ] \
  && pass "แถวทีละหน้า: หน้าแรก 2 แถว · หน้าสุดท้ายแถวปี 2566 (วันไทย)" || fail "detail paging"
DP=$(DET $A "?view=part&key=$P1")
[ "$(echo "$DP" | J "d.rowCount+'|'+d.breakdown.map(b=>b.branchCode+':'+b.used+'/'+b.issued).join(' ')")" = "3|$BA:3/0 $BE:2/0 $BB:0/1" ] \
  && pass "เปิดอะไหล่ P1: 3 แถว · ไปที่ A (ใช้ 3) · E (ใช้ 2 — เคลมถูกตีกลับ) · B (เบิก 1)" || fail "detail P1: $(echo "$DP" | J "JSON.stringify(d.breakdown)")"
[ "$(ROW "$DP" "r.workOrderId==$O3" | J '[d.transferFrom,d.transferReqNo,d.transferNo,d.transferArrived,d.detail].join("|")')" = "คลังภูเก็ต|PK-ZBP3|TR-ZBP3|false|กำลังโอน คลังภูเก็ต → $L94 · ใบโอน TR-ZBP3 · ช่าง · เข้างาน/ปิดงาน" ] \
  && pass "แถวเบิกเพื่อโอน: ต้นทาง ใบเบิกต้นทาง ใบโอน กำลังโอน" || fail "แถว O3: $(ROW "$DP" "r.workOrderId==$O3")"
C1CODE=$(DB "select code from \"WorkOrder\" where id=$O1")
[ "$(DET $A "?view=part&key=$P3" | J "JSON.stringify(d.rows.find(r=>r.workOrderId==$O7))" | J '[d.parentCode,d.subTeam,d.detail.includes("ทีม SUB")].join("|")')" = "$C1CODE|ทีม SUB ทดสอบ $SUF|true" ] \
  && pass "ใบรออะไหล่ (ใบแยก) นับปกติ บอกใบแม่และทีม SUB" || fail "แถว O7"
[ "$(DET $A "?view=part&key=$P2&kind=used" | J "JSON.stringify(d.rows.find(r=>r.workOrderId==$O4))" | J '[d.kind,d.status,d.claimStatus,d.detail.includes("รอตรวจเคลม")].join("|")')" = "USED|CLAIM_REVIEW|PENDING|true" ] \
  && pass "ใบรอตรวจเคลม = ใช้แล้ว (ช่างปิดแล้ว) บอกว่าส่งเคลม รอตรวจ" || fail "แถว O4"
[ "$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/work-orders/reports/branch-parts/detail?view=branch" -H "$(H $A)")" = "400" ] \
  && pass "เปิดกลุ่มโดยไม่บอกกลุ่ม = 400" || fail "detail ไม่มี key"

echo "═══ เคลมถูกตีกลับ (รอช่างปิดใหม่)"
DE=$(DET $A "?view=branch&key=$BE")
CLOSED8=$(node -e "console.log(new Date(Date.now()+7*3600e3-8*86400e3).toISOString().slice(0,10))")
[ "$(REP $A "?branchCode=$BE" | J 'd.summary.used+"|"+d.summary.issued')|$(echo "$DE" | J "d.rows.map(r=>[r.kind,r.quantity,r.day,r.closedBy,r.detail.includes('เคลมถูกตีกลับ · รอช่างปิดงานใหม่')].join(',')).join(' ')")" = "2|0|USED,2,$CLOSED8,$TNAME,true" ] \
  && pass "เคลมถูกตีกลับ: ยังนับใช้แล้ว 2 (ของใส่ที่สาขาแล้ว) ลงวันที่ปิดรอบนั้น บอกว่ารอช่างปิดใหม่ · ตัวที่เบิกไม่นับซ้ำ" || fail "เคลมตีกลับ: $(echo "$DE" | J 'JSON.stringify(d.rows)')"
D9=$(node -e "console.log(new Date(Date.now()+7*3600e3-9*86400e3).toISOString().slice(0,10))")
D7=$(node -e "console.log(new Date(Date.now()+7*3600e3-7*86400e3).toISOString().slice(0,10))")
[ "$(REP $A "?branchCode=$BE&from=$D9&to=$D7" | J 'd.summary.used')|$(REP $A "?branchCode=$BE&from=$D7&to=$TODAY" | J 'd.summary.pieces')|$(curl -s "localhost:4000/api/work-orders/reports/branch-parts/counts?branchCode=$BE" -H "$(H $A)" | J 'd.branch.used+","+d.branch.issued')" = "2|0|2,0" ] \
  && pass "เคลมถูกตีกลับ: ช่วงวันที่ตามวันปิด (ไม่ใช่วันตีกลับ) · ตัวเลขบนลิงก์ในใบงานเท่ากัน" || fail "เคลมตีกลับ ช่วงวันที่/counts"

echo "═══ ลิงก์ในใบงาน: สาขานี้ · เฉพาะเครื่องนี้"
[ "$(REP $A "?branchCode=$BA" | J 'd.summary.pieces')|$(REP $A "?machineId=$MA1" | J 'd.summary.used+","+d.summary.issued')|$(REP $A "?machineId=$MA2" | J 'd.summary.pieces')" = "9|4,2|1" ] \
  && pass "branchCode A = 9 ชิ้น · เครื่อง W1 = ใช้ 4 เบิก 2 · เครื่อง W2 = 1" || fail "branchCode/machineId"
CN=$(curl -s "localhost:4000/api/work-orders/reports/branch-parts/counts?branchCode=$BA&machineId=$MA1" -H "$(H $A)")
[ "$(echo "$CN" | J '[d.range.key,d.branch.used,d.branch.issued,d.branch.pieces,d.machine.used,d.machine.issued,d.machine.pieces].join(",")')" = "all,5,4,9,4,2,6" ] \
  && pass "ตัวเลขบนลิงก์ (counts): สาขา 9 ชิ้น · เครื่องนี้ 6 ชิ้น ตั้งแต่เริ่มใช้ระบบ" || fail "counts: $CN"
MDB=$(DB "select sum(p.quantity) from \"WorkOrderPart\" p join \"WorkOrder\" w on w.id=p.\"workOrderId\" where w.\"machineId\"=$MA1 and ((p.kind='USED' and w.status='DONE') or (p.kind='WAITING' and w.status='AWAITING_CONFIRM' and p.\"requisitionNo\" is not null))")
[ "$MDB" = "6" ] && pass "เครื่อง W1 ตรงกับฐานข้อมูล (psql) 6 ชิ้น" || fail "psql เครื่อง = $MDB"

echo "═══ Excel"
XR=$(REP $A "?q=$M&format=xlsx&view=part&limit=1")
X=$(mktemp --suffix=.xlsx)
curl -s "localhost:4000$(echo "$XR" | J d.path)" -o "$X"
XS=$(NODE_PATH="$SP/../backend/node_modules" node -e '
const E=require("exceljs");(async()=>{const wb=new E.Workbook();await wb.xlsx.readFile(process.argv[1]);
const s=n=>wb.getWorksheet(n), v=(ws,r)=>ws.getRow(r).values.slice(1);
const flat=s("รายการทั้งหมด"), br=s("รวมตามสาขา"), pt=s("รวมตามอะไหล่");
const rows=[];flat.eachRow((r,i)=>{if(i>4)rows.push(r.values.slice(1))});
const data=rows.filter(r=>r[0]!=="รวม"), total=rows.find(r=>r[0]==="รวม");
const all=JSON.stringify(rows), heads=JSON.stringify([v(flat,4),v(br,4),v(pt,4)]), P=process.argv[2];
const one=data.every(r=>(r[8]==null)!==(r[9]==null)), bA=v(br,5), p1=pt.getRows(5,10).map(r=>r.values.slice(1)).find(r=>r[0]===P+"-P1");
console.log([wb.worksheets.map(w=>w.name).join(","), data.length, data.reduce((n,r)=>n+(r[8]??0),0), data.reduce((n,r)=>n+(r[9]??0),0), total[8], total[9], one,
  bA.slice(0,7).join(":"), bA[7].startsWith(P+"-P2 เบิกแล้ว ×4, "+P+"-P1 ใช้แล้ว ×3, "), v(pt,5).slice(2,5).join(":"), p1&&p1[6],
  /รวม \(ชิ้น\)|"จำนวน \(ชิ้น\)"/.test(heads), all.includes("RQ-ZBP9"), all.includes("RQ-ZBP5"), all.includes("นอกสโตร์")].join("|"))})()' "$X" "ZBP-$SUF")
rm -f "$X"
[ "$(echo "$XR" | J 'd.filename.replace(/\d{4}-\d{2}-\d{2}/,"D")+"|"+d.rowCount')" = "อะไหล่ที่ไปแต่ละสาขา-D.xlsx|8" ] \
  && pass "ไฟล์ชื่อ อะไหล่ที่ไปแต่ละสาขา-วันที่.xlsx · ได้ทุกแถว (8) ไม่ตัดหน้า ไม่ขึ้นกับมุมมอง" || fail "ชื่อไฟล์/จำนวน: $XR"
[ "$XS" = "รายการทั้งหมด,รวมตามสาขา,รวมตามอะไหล่|8|8|5|8|5|true|$BA:ร้านทดสอบ$SUF เอ:$R1:$T1:5:4:4|true|1:4:2|$BA ใช้แล้ว ×3, $BB เบิกแล้ว ×1|false|true|false|true" ] \
  && pass "Excel อ่านได้: 3 ชีต · 8 แถว ใช้แล้ว 8 / เบิกแล้ว 5 คนละคอลัมน์ (แถวละแบบเดียว ไม่มีช่องรวม) · รวมตามสาขา A ใช้ 5 เบิก 4 บอกแบบทุกอะไหล่ · P1 ไป A ใช้แล้ว ×3 · B เบิกแล้ว ×1 · ไม่มีใบยกเลิก" || fail "Excel: $XS"

echo "═══ สิทธิ์ (แอดมินและ Super Admin เท่านั้น)"
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,team,\"passwordHash\",\"mustChangePassword\") values
  ('ZBPSA$SUF','ทดสอบ ซุปเปอร์แอดมิน','SUPER_ADMIN',null,'$HASH',false),('ZBPPA$SUF','ทดสอบ แอดมินอะไหล่','PARTS_ADMIN',null,'$HASH',false),
  ('ZBPSN$SUF','ทดสอบ Senior ช่าง','SENIOR_TECH','$T1','$HASH',false),('ZBPAR$SUF','ทดสอบ Area','AREA',null,'$HASH',false),
  ('ZBPCS$SUF','ทดสอบ Supervisor COCO','COCO_SUPERVISOR',null,'$HASH',false),('ZBPMD$SUF','ทดสอบ Maid COCO','COCO_MAID',null,'$HASH',false)"
SA=$(login ZBPSA$SUF); PA=$(login ZBPPA$SUF); SN=$(login ZBPSN$SUF); AR=$(login ZBPAR$SUF); CS=$(login ZBPCS$SUF); MD=$(login ZBPMD$SUF)
[ "$(CODE $A "")$(CODE $SA "")" = "200200" ] && pass "แอดมิน 200 · Super Admin 200" || fail "แอดมิน/Super Admin: $(CODE $A "") $(CODE $SA "")"
[ "$(REP $PA "" | J d.error)" = "รายงานนี้สำหรับแอดมินและ Super Admin เท่านั้น" ] && pass "Admin Spare Part 403 ข้อความไทย" || fail "Admin Spare Part: $(REP $PA "")"
[ "$(CODE $S "")$(CODE $T "")$(CODE $SN "")" = "403403403" ] && pass "หัวหน้าภาค 403 · ช่าง 403 · Senior ช่าง 403" || fail "หัวหน้าภาค/ช่าง/Senior: $(CODE $S "") $(CODE $T "") $(CODE $SN "")"
[ "$(CODE $AR "")$(CODE $CS "")$(CODE $MD "")" = "403403403" ] && pass "Area · Supervisor (COCO) · Maid (COCO) 403" || fail "Area: $(CODE $AR "") $(CODE $CS "") $(CODE $MD "")"
[ "$(CODE $PA "/detail?view=branch&key=$BA")$(CODE $S "/counts?branchCode=$BA")$(CODE $PA "?format=xlsx")" = "403403403" ] \
  && pass "แถวของกลุ่ม · ตัวเลขลิงก์ · Excel ก็ 403" || fail "endpoint ย่อยไม่กัน"
[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/work-orders/reports/branch-parts)" = "401" ] && pass "ไม่ล็อกอิน 401" || fail "ไม่ล็อกอินเข้าได้"
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'"); AID=$(DB "select id from \"User\" where \"employeeCode\"='A001'"); PAID=$(DB "select id from \"User\" where \"employeeCode\"='ZBPPA$SUF'")
AVS=$(POST $A auth/view-as "{\"userId\":$SID}" | J 'd.token||""')
[ -n "$AVS" ] && [ "$(CODE $AVS "")" = "403" ] && pass "แอดมินดูในฐานะหัวหน้าภาค → 403 (เห็นเท่าที่หัวหน้าภาคเห็น)" || fail "ดูในฐานะหัวหน้าภาค: $(CODE $AVS "")"
POST $AVS auth/view-as/stop '{}' >/dev/null
SVA=$(POST $SA auth/view-as "{\"userId\":$AID}" | J 'd.token||""'); SVP=$(POST $SA auth/view-as "{\"userId\":$PAID}" | J 'd.token||""')
[ "$(CODE $SVA "")$(CODE $SVP "")" = "200403" ] && pass "Super Admin ดูในฐานะแอดมิน 200 · ดูในฐานะ Admin Spare Part 403" || fail "Super Admin ดูแทน: $(CODE $SVA "") $(CODE $SVP "")"
POST $SVA auth/view-as/stop '{}' >/dev/null; POST $SVP auth/view-as/stop '{}' >/dev/null

cleanup; trap - EXIT
[ "$(DB "select count(*) from \"WorkOrder\" where code like 'ZBW$SUF-%'")|$(DB "select count(*) from \"Branch\" where code like '%$SUF%'")|$(DB "select role||'/'||team from \"User\" where \"employeeCode\"='T001'")|$(DB "select role||'/'||region from \"User\" where \"employeeCode\"='S001'")" = "0|0|EMPLOYEE/กรุงเทพ|SUPERVISOR/ใต้" ] \
  && pass "ล้างข้อมูลทดสอบหมด · T001 EMPLOYEE/กรุงเทพ · S001 SUPERVISOR/ใต้" || fail "ล้างข้อมูลไม่หมด"

[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
