#!/bin/bash
# ทดสอบ: สรุปเคสที่คอนเฟิร์มลูกค้าแล้ว (GET /work-orders/reports/confirmed) — ส่งกลุ่มไลน์ช่าง
#   · by=confirm: เคสที่คอนเฟิร์มวันนี้ (วันตามเวลาไทย) ขึ้น · คอนเฟิร์มเมื่อวานไม่ขึ้นวันนี้ แต่ขึ้นเมื่อเลือกเมื่อวาน
#   · ย้อนขั้นหลังคอนเฟิร์ม (นัดกลับเป็นรอ) ไม่ขึ้น · ใบทดสอบไม่ขึ้น · งานตรวจหน้างาน kind=INSPECT
#   · คนคอนเฟิร์ม · เบอร์ผู้ติดต่อ · อาการบรรทัดแรก · by=visit = คิวนัดวันนั้น
#   · ช่าง 403 · หัวหน้าภาคนอกพื้นที่ไม่เห็น · วันที่ผิด 400
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
REP() { curl -s "localhost:4000/api/work-orders/reports/confirmed?date=$2${3:+&by=$3}" -H "$(H $1)"; }
A=$(login A001); T=$(login T001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
BR=C0006
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
TEAM=$(DB "select zone from \"Branch\" where code='$BR'")
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
TODAY=$(TZ=Asia/Bangkok date +%F)
YDAY=$(TZ=Asia/Bangkok date -d yesterday +%F)
VISIT=2026-12-03
newwo() { POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-234-5678\",\"machines\":[{\"code\":\"W3\",\"symptom\":\"$1\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
confirmed() { # $1 id — จ่ายงาน+วัน → แอดมินคอนเฟิร์ม
  POST $S "work-orders/$1/parts" '{"needsParts":false}' >/dev/null
  POST $S "work-orders/$1/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$VISIT\",\"scheduledTime\":\"09:00\"}" >/dev/null
  POST $A "work-orders/$1/confirm-appointment" '{}' >/dev/null
}
W1=$(newwo "ไม่ปั่นหมาดทดสอบ"); W2=$(newwo "ย้อนขั้นทดสอบ"); W3=$(newwo "เมื่อวานทดสอบ"); W4=$(newwo "ตรวจหน้างานทดสอบ"); W5=$(newwo "ใบทดสอบ"); IDS="$W1 $W2 $W3 $W4 $W5"
DB "update \"WorkOrder\" set symptom=symptom||chr(10)||'สาเหตุ: ภายในทดสอบ' where id=$W1" >/dev/null
confirmed $W1; confirmed $W2; confirmed $W3; confirmed $W5
POST $A "work-orders/$W2/rollback" '{"toStage":"PARTS_CHECKED","reason":"ทดสอบ — ลูกค้ายกเลิกนัด"}' >/dev/null
# W3 คอนเฟิร์มเมื่อวาน (ย้ายเวลาประวัติ) · W5 เป็นใบทดสอบ
DB "update \"WorkOrderLog\" set \"createdAt\"=('$YDAY'::date + interval '3 hours') where \"workOrderId\"=$W3 and action in ('CONFIRMED','RESCHEDULED'); update \"WorkOrder\" set \"isTest\"=true where id=$W5" >/dev/null
POST $S "work-orders/$W4/inspect-request" "{\"team\":\"$TEAM\",\"scheduledAt\":\"$VISIT\"}" >/dev/null
POST $A "work-orders/$W4/confirm-appointment" '{}' >/dev/null
ROW() { echo "$1" | J 'const r=d.rows.find(x=>x.id==='$2');r?[r.kind,r.team,r.scheduledAt,r.scheduledTime??"-",r.machineCode,r.symptom,r.contactName,r.contactPhone,r.confirmedBy].join("|"):"none"'; }

echo "═══ คอนเฟิร์มวันนี้"
R=$(REP $A $TODAY)
[ "$(ROW "$R" $W1)" = "REPAIR|$TEAM|$VISIT|09:00|W3|ไม่ปั่นหมาดทดสอบ|คุณทดสอบ|081-234-5678|$ANAME" ] \
  && pass "เคสที่คอนเฟิร์มวันนี้ขึ้น ครบ: ทีม วันเวลานัด เครื่อง อาการบรรทัดแรก ผู้ติดต่อ คนคอนเฟิร์ม" || fail "W1: $(ROW "$R" $W1)"
[ "$(ROW "$R" $W4 | cut -d'|' -f1,4)" = "INSPECT|-" ] && pass "งานตรวจหน้างานขึ้นเป็น INSPECT · ไม่มีเวลา = ว่าง" || fail "W4: $(ROW "$R" $W4)"
[ "$(ROW "$R" $W2)|$(ROW "$R" $W3)|$(ROW "$R" $W5)" = "none|none|none" ] \
  && pass "ไม่ขึ้น: ย้อนขั้นหลังคอนเฟิร์ม · คอนเฟิร์มเมื่อวาน · ใบทดสอบ" || fail "หลุด: W2=$(ROW "$R" $W2) W3=$(ROW "$R" $W3) W5=$(ROW "$R" $W5)"
WANT=$(DB "select count(*) from \"WorkOrder\" w where not w.\"isTest\" and w.status<>'CANCELLED' and w.\"appointmentStatus\" in ('CONFIRMED','ADMIN_PICKED') and w.\"scheduledAt\" is not null
  and (select max(l.\"createdAt\") from \"WorkOrderLog\" l where l.\"workOrderId\"=w.id and l.action in ('CONFIRMED','RESCHEDULED') and l.\"backfilledAt\" is null)
      between ('$TODAY'::date - interval '7 hours') and ('$TODAY'::date + interval '17 hours')")
[ "$(echo "$R" | J 'd.rows.length')" = "$WANT" ] && pass "จำนวนเคสตรงกับฐานข้อมูล ($WANT)" || fail "จำนวน $(echo "$R" | J 'd.rows.length') ฐานข้อมูล $WANT"
[ "$(ROW "$(REP $A $YDAY)" $W3 | cut -d'|' -f1)" = "REPAIR" ] && pass "เลือกวันที่เมื่อวาน เห็นเคสที่คอนเฟิร์มเมื่อวาน" || fail "เมื่อวานไม่เห็น W3"

echo
echo "═══ นัดเข้างานวันที่"
R=$(REP $A $VISIT visit)
[ "$(ROW "$R" $W1 | cut -d'|' -f1)|$(ROW "$R" $W3 | cut -d'|' -f1)|$(ROW "$R" $W2)" = "REPAIR|REPAIR|none" ] \
  && pass "by=visit: คิวนัดวันนั้นที่ยังคอนเฟิร์มอยู่ (ไม่สนว่าคอนเฟิร์มวันไหน)" || fail "visit: $(echo "$R" | J 'd.rows.map(r=>r.code).join()')"

echo
echo "═══ สิทธิ์"
[ "$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/work-orders/reports/confirmed?date=$TODAY" -H "$(H $T)")" = 403 ] && pass "ช่างดูไม่ได้ (403)" || fail "ช่างดูได้"
[ "$(ROW "$(REP $S $TODAY)" $W1 | cut -d'|' -f1)" = "REPAIR" ] && pass "หัวหน้าภาคในพื้นที่เห็น" || fail "หัวหน้าภาคในพื้นที่ไม่เห็น"
DB "update \"User\" set region=(select region from \"Branch\" where region<>(select region from \"Branch\" where code='$BR') and region is not null limit 1) where \"employeeCode\"='S001'" >/dev/null
S2=$(login S001)
[ "$(ROW "$(REP $S2 $TODAY)" $W1)" = "none" ] && pass "หัวหน้าภาคนอกพื้นที่ไม่เห็น" || fail "หัวหน้าภาคนอกพื้นที่เห็น"
[ "$(curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/work-orders/reports/confirmed?date=19-10-2026" -H "$(H $A)")" = 400 ] && pass "วันที่ผิดรูปแบบ 400" || fail "วันที่ผิดผ่าน"

[ -z "$FAILED" ]
