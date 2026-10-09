#!/bin/bash
# ทดสอบ: ปิดงานย้อนหลัง (แอดมิน) — กรอกขั้นที่เหลือครั้งเดียวแล้วปิดงาน · ประวัติลงวันเวลาจริง + ติดป้ายบันทึกย้อนหลัง
#        ไม่มีรูปต้องใส่เหตุผล (ไม่บังคับรูป) · วันเวลาต้องเรียงและไม่เกินวันนี้ · หัวหน้าภาค/ช่างทำไม่ได้
# ยืนยันผลที่ฐานข้อมูลด้วยทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
SUF=$RANDOM
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"User\" where \"employeeCode\"='ZBS$SUF'" >/dev/null
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
A=$(login A001); S=$(login S001); T=$(login T001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
trap cleanup EXIT
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'")
D2=$(DB "select to_char((now() at time zone 'Asia/Bangkok')::date - 2,'YYYY-MM-DD')")
newwo() { POST $A work-orders '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W9","model":"Haier","symptom":"ทดสอบปิดย้อนหลัง"}]}' | J 'd.orders?d.orders[0].id:d.id'; }
body() { # $1 = ส่วนที่เปลี่ยน (JSON ไม่มีวงเล็บ)
  echo "{\"reason\":\"ช่างซ่อมเสร็จแล้วแต่ไม่ได้กดในแอป\",\"team\":\"กระบี่\",\"visitDate\":\"$D2\",\"visitTime\":\"13:30\",\"result\":\"FIXED\",\"closedAt\":\"${D2}T15:10:00+07:00\",\"workerIds\":[$TID],\"note\":\"เปลี่ยนบอร์ด ทดสอบปกติ\",\"noPhotoReason\":\"ช่างไม่ได้ถ่ายไว้\"${1:+,$1}}"
}

ID=$(newwo); IDS="$IDS $ID"
echo "═══ สิทธิ์และเงื่อนไข"
R=$(POST $S "work-orders/$ID/backfill-close" "$(body)")
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "NEW" ] && pass "หัวหน้าภาคปิดย้อนหลังไม่ได้ (DB ไม่เปลี่ยน)" || fail "หัวหน้าภาคปิดได้"
R=$(POST $T "work-orders/$ID/backfill-close" "$(body)")
[ "$(DB "select status from \"WorkOrder\" where id=$ID")" = "NEW" ] && pass "ช่างปิดย้อนหลังไม่ได้" || fail "ช่างปิดได้"
R=$(POST $A "work-orders/$ID/backfill-close" "$(body '"noPhotoReason":""')")
echo "$R" | grep -q "เหตุผลที่ไม่มีรูป" && pass "ไม่มีรูปและไม่ใส่เหตุผล → ไม่ให้ปิด" || fail "ปิดได้โดยไม่มีรูปและเหตุผล: $(echo $R|head -c 120)"
R=$(POST $A "work-orders/$ID/backfill-close" "$(body '"workerIds":[]')")
echo "$R" | grep -q "ผู้เข้าปฏิบัติงาน" && pass "ไม่ระบุผู้เข้าปฏิบัติงาน → ไม่ให้ปิด" || fail "ปิดได้โดยไม่มีคน"
R=$(POST $A "work-orders/$ID/backfill-close" "$(body "\"closedAt\":\"${D2}T09:00:00+07:00\"")")
echo "$R" | grep -q "ต้องไม่ก่อนวันเข้างาน" && pass "ซ่อมเสร็จก่อนเวลาเข้างาน → ไม่ให้ปิด" || fail "รับเวลาย้อนลำดับ: $(echo $R|head -c 120)"
R=$(POST $A "work-orders/$ID/backfill-close" "$(body '"closedAt":"2099-01-01T10:00:00+07:00"')")
echo "$R" | grep -q "ต้องไม่เกินวันนี้" && pass "เวลาในอนาคต → ไม่ให้ปิด" || fail "รับเวลาอนาคต: $(echo $R|head -c 120)"
[ "$(DB "select status||'|'||(select count(*) from \"WorkOrderLog\" where \"workOrderId\"=$ID) from \"WorkOrder\" where id=$ID")" = "NEW|1" ] && pass "DB: ที่ถูกปฏิเสธทั้งหมดไม่เขียนอะไรเลย" || fail "มีบางอย่างถูกเขียน"

echo
echo "═══ ปิดย้อนหลังจากขั้นแรก (ไม่ใช้อะไหล่ · ไม่มีรูป)"
R=$(POST $A "work-orders/$ID/backfill-close" "$(body)")
[ "$(DB "select status||'|'||\"closeResult\"||'|'||\"assignedTeam\"||'|'||to_char((\"closedAt\" at time zone 'UTC') at time zone 'Asia/Bangkok','YYYY-MM-DD HH24:MI')||'|'||to_char(\"scheduledAt\",'YYYY-MM-DD')||'|'||\"needsParts\" from \"WorkOrder\" where id=$ID")" = "DONE|FIXED|กระบี่|$D2 15:10|$D2|false" ] \
  && pass "DB: ปิดงาน ผล ทีม เวลาซ่อมเสร็จ วันเข้างาน ตามที่กรอก" || fail "DB: $(DB "select status,\"closedAt\",\"scheduledAt\" from \"WorkOrder\" where id=$ID") · $(echo $R|head -c 160)"
[ "$(DB "select string_agg(action,',' order by \"createdAt\", id) from \"WorkOrderLog\" where \"workOrderId\"=$ID and \"backfilledAt\" is not null")" = "NO_PARTS,ASSIGNED,SCHEDULED,CLOSED" ] \
  && pass "DB: ทุกขั้นที่เหลือถูกบันทึกและติดป้ายย้อนหลัง (ไม่ใช้อะไหล่ → จ่ายงาน → เข้างาน → ปิด)" || fail "ขั้น: $(DB "select string_agg(action,',' order by \"createdAt\") from \"WorkOrderLog\" where \"workOrderId\"=$ID")"
[ "$(DB "select to_char((\"createdAt\" at time zone 'UTC') at time zone 'Asia/Bangkok','YYYY-MM-DD HH24:MI') from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='CLOSED'")" = "$D2 15:10" ] \
  && pass "DB: ประวัติปิดงานลงเวลาจริงของงาน ไม่ใช่เวลาที่กด" || fail "เวลาประวัติ"
[ "$(DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='BACKFILLED' and \"backfilledAt\" is null")" = "ช่างซ่อมเสร็จแล้วแต่ไม่ได้กดในแอป" ] \
  && pass "DB: มีรายการ \"ปิดงานย้อนหลัง\" ลงเวลาที่กดจริง พร้อมเหตุผล" || fail "ไม่มีรายการเหตุผล"
DB "select \"closeNote\" from \"WorkOrder\" where id=$ID" | grep -q "ไม่มีรูปหน้างาน: ช่างไม่ได้ถ่ายไว้" && pass "DB: เหตุผลที่ไม่มีรูปอยู่ในสรุปปิดงาน" || fail "ไม่มีเหตุผลรูป"
[ "$(DB "select count(*) from \"WorkOrderWorker\" where \"workOrderId\"=$ID and \"userId\"=$TID")" = "1" ] && pass "DB: ผู้เข้าปฏิบัติงานถูกบันทึก" || fail "ไม่มีผู้เข้าปฏิบัติงาน"
R=$(POST $A "work-orders/$ID/backfill-close" "$(body)")
echo "$R" | grep -q "ปิดไปแล้ว" && pass "ใบที่ปิดแล้วปิดย้อนหลังซ้ำไม่ได้" || fail "ปิดซ้ำได้"

HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZBS$SUF','ซุปเปอร์ปิดย้อนหลัง','SUPER_ADMIN','$HASH',false)" >/dev/null
SA=$(login ZBS$SUF)
curl -s "localhost:4000/api/work-orders/$ID/timeline" -H "$(H $SA)" | J 'const e=d.events.filter(e=>e.tags&&e.tags.some(t=>t.text.startsWith("แอดมินบันทึกย้อนหลัง"))); e.length===4&&!d.summary.open?"ok":"bad"' | grep -q ok \
  && pass "ไทม์ไลน์ติดป้าย \"แอดมินบันทึกย้อนหลัง\" ทั้ง 4 ขั้น และนับว่าปิดแล้ว" || fail "ไทม์ไลน์ไม่ติดป้าย"

ID3=$(newwo); IDS="$IDS $ID3"
R=$(POST $A "work-orders/$ID3/backfill-close" "$(body "\"visitTime\":null,\"closedAt\":\"${D2}T08:00:00+07:00\"")")
[ "$(DB "select status from \"WorkOrder\" where id=$ID3")" = "DONE" ] && pass "ไม่รู้เวลาเข้างาน + ซ่อมเสร็จ 08:00 วันเดียวกัน → ปิดได้ (ไม่เดาเวลาเข้าเป็น 09:00)" || fail "ปิดไม่ได้: $(echo $R|head -c 140)"

echo
echo "═══ ปิดย้อนหลังจากขั้นเบิกอะไหล่ (ใช้อะไหล่)"
ID2=$(newwo); IDS="$IDS $ID2"
P1=$(DB "select id from \"SparePart\" order by id limit 1")
POST $S "work-orders/$ID2/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$P1,\"quantity\":1}]}" >/dev/null
ST=$(DB "select status from \"WorkOrder\" where id=$ID2")
R=$(POST $A "work-orders/$ID2/backfill-close" "$(body "\"parts\":[{\"sparePartId\":$P1,\"quantity\":1}],\"requisitionAt\":\"$D2\",\"requisitionRef\":\"RQ-TEST-$SUF\",\"noPhotoReason\":\"ไม่มีรูป\"")")
[ "$(DB "select status from \"WorkOrder\" where id=$ID2")" = "DONE" ] && pass "ปิดจากขั้น $ST ได้" || fail "ปิดไม่ได้: $(echo $R|head -c 160)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID2 and action='PARTS_CHECKED' and \"backfilledAt\" is not null" | grep -q "RQ-TEST-$SUF" \
  && pass "DB: ขั้นเบิกอะไหล่บันทึกเลขใบเบิก" || fail "ไม่มีเลขใบเบิก: $(DB "select string_agg(action,',') from \"WorkOrderLog\" where \"workOrderId\"=$ID2")"
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$ID2 and kind='USED' and \"sparePartId\"=$P1")" = "1" ] && pass "DB: อะไหล่ที่ใช้จริงถูกบันทึก" || fail "ไม่มีอะไหล่ที่ใช้"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
