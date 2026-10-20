#!/bin/bash
# ทดสอบ: ข้อมูลที่ตัวกรองหน้ารายการใบงานใช้ — รอใคร (บทบาท · หัวหน้าภาครายคน · ทีม) · DODO/COCO · ค้างขั้นนี้ตั้งแต่เมื่อไร
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
A=$(login A001); S=$(login S001)
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
IDS=""
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
}
trap cleanup EXIT
DB "update \"User\" set region='ใต้' where \"employeeCode\"='S001'" >/dev/null
DODO=$(DB "select code from \"Branch\" where code like 'D%' and \"cancelledAt\" is null order by code limit 1")
newwo() { POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"W3\",\"symptom\":\"ทดสอบตัวกรองรายการ\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
row() { curl -s "localhost:4000/api/work-orders?status=ALL" -H "$(H $A)" | J "const r=d.rows.find(x=>x.id===$1); $2"; }

C=$(newwo C0006); D=$(newwo $DODO); IDS="$C $D"

echo "═══ รอใคร"
[ "$(row $C "r.stageActor+'|'+r.waitingOnSupervisors.some(s=>s.id===$SID)")" = "SUPERVISOR|true" ] \
  && pass "ใบใหม่รอหัวหน้าภาค และบอกชื่อหัวหน้าภาคที่ดูแลภาคนั้น" || fail "รอใคร: $(row $C 'JSON.stringify([r.stageActor,r.waitingOnSupervisors])')"
POST $S "work-orders/$C/parts" '{"needsParts":false}' >/dev/null
POST $S "work-orders/$C/assign" '{"team":"กระบี่","scheduledAt":"2026-11-20"}' >/dev/null
[ "$(row $C 'r.stageActor+"|"+r.waitingOnSupervisors.length')" = "ADMIN|0" ] \
  && pass "จ่ายงานแล้วไปแอดมิน · คอนเฟิร์มลูกค้า (แอดมินไม่แยกรายคน)" || fail "หลังจ่ายงาน: $(row $C 'r.stageActor')"
POST $A "work-orders/$C/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$C/dispatch" '{}' >/dev/null
[ "$(row $C 'r.stageActor+"|"+r.waitingOnTeam')" = "EMPLOYEE|กระบี่" ] \
  && pass "จ่ายงานแล้วรอช่าง และบอกทีมที่รับงาน" || fail "ขั้นช่าง: $(row $C 'r.stageActor+"|"+r.waitingOnTeam')"

echo
echo "═══ DODO / COCO"
[ "$(row $C 'r.branchType')|$(row $D 'r.branchType')" = "COCO|DODO" ] \
  && pass "รหัส C = COCO · D = DODO ($DODO)" || fail "ประเภทสาขาผิด: $(row $C 'r.branchType')|$(row $D 'r.branchType')"

echo
echo "═══ ค้างขั้นนี้ตั้งแต่เมื่อไร"
LAST=$(DB "select to_char(max(\"createdAt\"),'YYYY-MM-DD\"T\"HH24:MI:SS') from \"WorkOrderLog\" where \"workOrderId\"=$C and action not in ('ATTACHED','ATTACHMENT_REMOVED','EDITED')")
[ "$(row $C 'r.stageSince.slice(0,19)')" = "$LAST" ] && pass "นับจากประวัติล่าสุดที่ขยับขั้น (จ่ายงาน)" || fail "stageSince $(row $C 'r.stageSince') ≠ $LAST"
DB "update \"WorkOrderLog\" set \"createdAt\"=now()+interval '1 hour' where id=(select max(id) from \"WorkOrderLog\" where \"workOrderId\"=$C)" >/dev/null
DB "insert into \"WorkOrderLog\"(\"workOrderId\",action,status,note,\"createdAt\") values ($C,'ATTACHED','IN_PROGRESS','รูป: x.jpg',now()+interval '2 hour')" >/dev/null
LAST2=$(DB "select to_char(max(\"createdAt\"),'YYYY-MM-DD\"T\"HH24:MI:SS') from \"WorkOrderLog\" where \"workOrderId\"=$C and action not in ('ATTACHED','ATTACHMENT_REMOVED','EDITED')")
[ "$(row $C 'r.stageSince.slice(0,19)')" = "$LAST2" ] && pass "แนบไฟล์ทีหลังไม่ทำให้นับใหม่" || fail "แนบไฟล์แล้วนับใหม่: $(row $C 'r.stageSince')"

echo
echo "═══ ใบด่วนขึ้นก่อน"
U=$(POST $A work-orders "{\"branchCode\":\"C0006\",\"jobType\":\"CM\",\"priority\":\"URGENT\",\"machines\":[{\"code\":\"W3\",\"symptom\":\"ทดสอบใบด่วน\"}]}" | J 'd.orders?d.orders[0].id:d.id'); IDS="$IDS $U"
curl -s "localhost:4000/api/work-orders?status=ACTIVE" -H "$(H $A)" | J "const i=d.rows.findIndex(r=>r.id===$U), j=d.rows.findIndex(r=>r.priority!=='URGENT'); (i>=0&&(j<0||i<j))?'ok':'bad:'+i+'/'+j" | grep -q ok \
  && pass "ใบด่วนอยู่ก่อนใบปกติในรายการ (เดิมเรียงตัวอักษรแล้วไปอยู่ท้าย)" || fail "ใบด่วนไม่ขึ้นก่อน"

echo
echo "═══ ผู้เปิดใบงาน"
ANAME=$(DB "select name from \"User\" where \"employeeCode\"='A001'")
[ "$(row $D 'r.createdByName+"|"+r.createdByRole')" = "$ANAME|ADMIN" ] \
  && pass "รายการบอกชื่อและบทบาทผู้เปิด ($ANAME)" || fail "ผู้เปิด: $(row $D 'r.createdByName+"|"+r.createdByRole')"
curl -s -G "localhost:4000/api/work-orders" --data-urlencode "status=ALL" --data-urlencode "search=$ANAME" -H "$(H $A)" \
  | J "d.rows.some(r=>r.id===$D)?'ok':'none'" | grep -q ok \
  && pass "ค้นด้วยชื่อผู้เปิดแล้วเจอใบงาน" || fail "ค้นชื่อผู้เปิดไม่เจอ"
DB "update \"WorkOrder\" set \"createdById\"=null where id=$D" >/dev/null
[ "$(row $D 'String(r.createdByName)+"|"+String(r.createdByRole)')" = "null|null" ] \
  && pass "ใบที่ไม่มีผู้เปิดส่งค่าว่าง (แอปขึ้นว่า ระบบ)" || fail "ไม่มีผู้เปิด: $(row $D 'r.createdByName')"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || { echo "── มีข้อที่ไม่ผ่าน ──"; exit 1; }
