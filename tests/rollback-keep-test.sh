#!/bin/bash
# ทดสอบ: ย้อนขั้นแล้วข้อมูลไม่หาย + รู้ว่าใบนี้ถูกย้อนมา (เจ้าของงานขอ ต.ค. 69)
#   · ย้อนยังล้างทีม/วันนัด/ผลเช็คคลังออกจากใบ (ฐานข้อมูล) — แต่ค่าเดิมอยู่ใน rollbackPrefill ครบ
#   · rolledBack (หน้าใบงาน) + rolledBackFrom (รายการ) บอกขั้นเดิม เหตุผล คนย้อน
#   · แนบไฟล์/แก้รายละเอียดหลังย้อน ป้ายยังอยู่ · กดผ่านขั้นที่ย้อนไป ป้ายหาย แต่ค่าเดิมยังเติมให้ขั้นถัดไป
#   · ผ่านขั้นเดิมไปแล้ว ค่าเดิมเลิกเติม · ประวัติเก่าที่ไม่มี meta ยังอ่านชื่อขั้นเดิมได้
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$1" -H "$(H $A)"; }
A=$(login A001)
BR=C0006
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region=(select region from \"Branch\" where code='$BR') where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
BOARD=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
BELT=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BELT'")
TEAM=$(DB "select zone from \"Branch\" where code='$BR'")
SNAME=$(DB "select name from \"User\" where \"employeeCode\"='S001'")
VISIT=$(TZ=Asia/Bangkok date -d '+10 days' +%F)

ID=$(POST $A work-orders "{\"branchCode\":\"$BR\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"W71\",\"symptom\":\"ทดสอบย้อนขั้นไม่หาย\"}]}" | J 'd.orders?d.orders[0].id:d.id'); IDS="$ID"
CODE=$(DB "select code from \"WorkOrder\" where id=$ID")
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":2}]}" >/dev/null
# ใบที่เดินไปถึงรอช่างเข้างาน: เช็คคลังแล้ว (มี · คลัง · เลขใบเบิก) จ่ายทีม นัดลูกค้าคอนเฟิร์มแล้ว
DB "update \"WorkOrderPart\" set \"inStock\"=true, warehouse='คลังกระบี่', \"requisitionNo\"='RQ-KEEP1', \"checkedAt\"=now() where \"workOrderId\"=$ID and kind='WAITING'" >/dev/null
DB "update \"WorkOrder\" set status='IN_PROGRESS', \"assignedTeam\"='$TEAM', \"scheduledAt\"='$VISIT', \"scheduledTime\"='14:00', \"appointmentStatus\"='CONFIRMED' where id=$ID" >/dev/null

POST $S "work-orders/$ID/rollback" '{"toStage":"NEW","reason":"ต้องเพิ่มสายพานอีกเส้น"}' >/dev/null
[ "$(DB "select status||'|'||coalesce(\"assignedTeam\",'-')||'|'||coalesce(\"scheduledAt\"::text,'-')||'|'||coalesce(\"needsParts\"::text,'-') from \"WorkOrder\" where id=$ID")" = "NEW|-|-|-" ] \
  && [ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$ID and \"inStock\" is not null")" = "0" ] \
  && pass "ย้อนแล้วใบงานว่างจริง (ทีม วันนัด ใช้อะไหล่ไหม ผลเช็คคลัง — ไม่ค้างบนบอร์ดทีมเดิม)" || fail "ใบงานยังมีค่าเดิมค้าง"
D=$(GET "work-orders/$ID")
[ "$(echo "$D" | J 'const p=d.rollbackPrefill; [p.from,p.needsParts,p.assignedTeam,p.scheduledAt,p.scheduledTime,p.parts.length,p.parts.every(x=>x.inStock&&x.warehouse==="คลังกระบี่"&&x.requisitionNo==="RQ-KEEP1")].join("|")')" = "IN_PROGRESS|true|$TEAM|$VISIT|14:00|2|true" ] \
  && pass "ค่าเดิมเก็บไว้ครบ: ใช้อะไหล่ ทีม วันนัด เวลา ผลเช็คคลัง คลัง เลขใบเบิก" || fail "rollbackPrefill: $(echo "$D" | J 'JSON.stringify(d.rollbackPrefill)')"
[ "$(echo "$D" | J 'const r=d.rolledBack; [r.from,r.fromLabel,r.reason,r.byName].join("|")')" = "IN_PROGRESS|ช่าง · เข้างาน/ปิดงาน|ต้องเพิ่มสายพานอีกเส้น|$SNAME" ] \
  && pass "หน้าใบงานบอก ย้อนมาจาก “ช่าง · เข้างาน/ปิดงาน” · เหตุผล · คนย้อน" || fail "rolledBack: $(echo "$D" | J 'JSON.stringify(d.rolledBack)')"
LIST() { GET "work-orders?status=ALL&search=$CODE" | J "((d.rows||d).find(r=>r.id===$ID)||{}).rolledBackFrom ?? 'null'"; }
[ "$(LIST)" = "ช่าง · เข้างาน/ปิดงาน" ] && pass "รายการติดป้าย ย้อนขั้น (rolledBackFrom)" || fail "รายการ: $(LIST)"

# แนบไฟล์/แก้รายละเอียดไม่ใช่การเดินขั้น — ป้ายต้องยังอยู่
DB "insert into \"WorkOrderLog\"(\"workOrderId\",action,status,note) values ($ID,'ATTACHED','NEW','แนบรูปทดสอบ')" >/dev/null
[ "$(GET "work-orders/$ID" | J 'd.rolledBack?"yes":"no"')" = "yes" ] && [ "$(LIST)" = "ช่าง · เข้างาน/ปิดงาน" ] \
  && pass "แนบไฟล์หลังย้อน ป้ายยังอยู่" || fail "แนบไฟล์แล้วป้ายหาย"

# หัวหน้าภาคกดผ่านขั้นที่ย้อนไป — ป้ายหาย แต่ค่าเดิม (ทีม วันนัด) ยังเติมให้ขั้นถัดไป
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$BOARD,\"quantity\":1},{\"sparePartId\":$BELT,\"quantity\":3}]}" >/dev/null
D=$(GET "work-orders/$ID")
[ "$(echo "$D" | J 'd.status!=="NEW"')" = "true" ] && [ "$(echo "$D" | J 'd.rolledBack===null')" = "true" ] && [ "$(LIST)" = "null" ] \
  && pass "กดผ่านขั้นที่ย้อนไป ป้ายย้อนขั้นหาย (หน้าใบงานและรายการ)" || fail "ป้ายยังอยู่: $(echo "$D" | J 'd.status+" "+JSON.stringify(d.rolledBack)')"
[ "$(echo "$D" | J 'd.rollbackPrefill&&d.rollbackPrefill.assignedTeam')" = "$TEAM" ] \
  && pass "ขั้นถัดไปยังได้ค่าเดิม (ทีม) ไว้เติม" || fail "ค่าเดิมหายหลังเดินขั้น"

# ผ่านขั้นเดิมไปแล้ว — ค่าเดิมไม่เกี่ยวแล้ว
DB "update \"WorkOrder\" set status='CLAIM_REVIEW' where id=$ID" >/dev/null
[ "$(GET "work-orders/$ID" | J 'd.rollbackPrefill===null')" = "true" ] && pass "ผ่านขั้นเดิมไปแล้ว เลิกเติมค่าเดิม" || fail "ยังเติมค่าเดิมหลังผ่านขั้นเดิม"

# ประวัติเก่าก่อนมี meta — ยังอ่านชื่อขั้นเดิมจากบันทึกได้
DB "update \"WorkOrder\" set status='PARTS_CHECKED' where id=$ID" >/dev/null
DB "insert into \"WorkOrderLog\"(\"workOrderId\",action,status,note) values ($ID,'ROLLED_BACK','PARTS_CHECKED','จาก “แอดมิน · คอนเฟิร์มลูกค้า” กลับไป “หัวหน้าภาค · จ่ายงานให้ทีม” — ลูกค้าขอเลื่อน')" >/dev/null
[ "$(GET "work-orders/$ID" | J 'd.rolledBack.fromLabel+"|"+d.rolledBack.reason')" = "แอดมิน · คอนเฟิร์มลูกค้า|ลูกค้าขอเลื่อน" ] \
  && pass "ประวัติเก่า (ไม่มี meta) ยังบอกขั้นเดิมและเหตุผล" || fail "ประวัติเก่า: $(GET "work-orders/$ID" | J 'JSON.stringify(d.rolledBack)')"

[ -z "$FAILED" ]
