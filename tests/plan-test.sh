#!/bin/bash
# ทดสอบ: ย้อนขั้นตอน (แอดมิน/หัวหน้าภาคเท่านั้น) · ตรวจหน้างาน (ส่งตรวจ+วัน → แอดมินคอนเฟิร์ม → หัวหน้าภาคส่งช่าง) · จ่ายงาน+วัน → คอนเฟิร์มลูกค้า → ยืนยันออกงาน ·
#        แยกใบงานรออะไหล่ (ตอนเช็คคลัง และหลังเข้าหน้างาน) · บอร์ดแผนงาน
#
# ทุกข้อยืนยันผลที่ฐานข้อมูลด้วย ไม่ใช่เชื่อแค่คำตอบของ API (CLAUDE.md)
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001); T=$(login T001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
st() { DB "select status from \"WorkOrder\" where id=$1"; }

BR=$(curl -s "localhost:4000/api/branches?search=C0001" -H "$(H $A)" | J 'd[0].region+"|"+d[0].zone')
REGION=${BR%%|*}; TEAM=${BR##*|}
SID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="S001").id')
TID=$(curl -s localhost:4000/api/auth/users -H "$(H $A)" | J 'd.find(u=>u.employeeCode==="T001").id')
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
OLD_TEAM=$(DB "select coalesce(team,'') from \"User\" where id=$TID")
curl -s -X PATCH "localhost:4000/api/auth/users/$SID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"region\":\"$REGION\"}" >/dev/null
curl -s -X PATCH "localhost:4000/api/auth/users/$TID" -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"team\":\"$TEAM\"}" >/dev/null
P1=$(curl -s "localhost:4000/api/spare-parts?search=SP-BOARD" -H "$(H $A)" | J 'const a=Array.isArray(d)?d:d.rows;a[0].id')
P2=$(DB "select id from \"SparePart\" where id<>$P1 order by id limit 1")

newwo() {
  POST $A work-orders "{\"branchCode\":\"C0001\",\"jobType\":\"$1\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"W32\",\"symptom\":\"ทดสอบแผนงาน\"}]}" \
    | J 'd.orders?d.orders[0].id:d.id'
}
CREATED=""

echo "═══ ตรวจหน้างาน"
ID=$(newwo INSPECT); CREATED="$CREATED $ID"
[ "$(DB "select \"jobType\" from \"WorkOrder\" where id=$ID")" = "INSPECT" ] && pass "เปิดใบงานประเภทตรวจสอบหน้างานได้" || fail "ประเภทงานไม่ถูกบันทึก"
POST $S "work-orders/$ID/inspect-request" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-03\",\"scheduledTime\":\"09:30\"}" >/dev/null
[ "$(DB "select status||'|'||\"assignedTeam\"||'|'||\"scheduledTime\"||'|'||\"appointmentStatus\" from \"WorkOrder\" where id=$ID")" = "INSPECT_CONFIRM|$TEAM|09:30|PENDING" ] \
  && pass "หัวหน้าภาคส่งทีมไปตรวจ พร้อมวันเสนอ — ไปรอแอดมินนัดลูกค้าก่อน ยังไม่ถึงช่าง" || fail "ส่งตรวจไม่สำเร็จ: $(st $ID)"
# ก่อนแอดมินนัด ช่างยังบันทึกผลตรวจไม่ได้ · ช่าง/หัวหน้าภาคนัดแทนไม่ได้
R=$(POST $T "work-orders/$ID/inspection" '{"note":"แอบไปก่อนนัด"}')
echo "$R" | grep -q "รอแอดมินนัดลูกค้า" && [ "$(st $ID)" = "INSPECT_CONFIRM" ] \
  && pass "ยังไม่ได้นัด ช่างบันทึกผลตรวจไม่ได้" || fail "บันทึกผลตรวจได้ก่อนนัด: $(echo $R|head -c 120)"
for who in T S; do
  R=$(POST ${!who} "work-orders/$ID/confirm-appointment" '{}')
  echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "$([ $who = T ] && echo ช่าง || echo หัวหน้าภาค)นัดลูกค้าแทนแอดมินไม่ได้" || fail "$who นัดได้: $(echo $R|head -c 120)"
done
[ "$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $A)" | J 'String(d.rows.some(r=>r.id==='$ID'))')" = "true" ] \
  && pass "ใบรอนัดตรวจขึ้นในกล่องงานของแอดมิน" || fail "ไม่อยู่ในกล่องงานแอดมิน"
[ "$(curl -s "localhost:4000/api/work-orders?status=AWAITING_CONFIRM" -H "$(H $A)" | J 'String(d.rows.some(r=>r.id==='$ID'))')" = "true" ] \
  && pass "ชิป \"รอคอนเฟิร์มลูกค้า\" รวมใบรอนัดตรวจด้วย" || fail "ชิปรอคอนเฟิร์มไม่รวมนัดตรวจ"
POST $A "work-orders/$ID/confirm-appointment" '{"scheduledAt":"2026-11-04","scheduledTime":"10:00"}' >/dev/null
[ "$(DB "select status||'|'||\"appointmentStatus\"||'|'||to_char(\"scheduledAt\",'YYYY-MM-DD')||'|'||\"scheduledTime\"||'|'||\"assignedTeam\" from \"WorkOrder\" where id=$ID")" = "INSPECT_DISPATCH|CONFIRMED|2026-11-04|10:00|$TEAM" ] \
  && pass "แอดมินนัด (ลูกค้าขอเลื่อนวัน) แล้วกลับไปให้หัวหน้าภาคส่งช่าง — ยังไม่ถึงช่าง" || fail "นัดไม่สำเร็จ: $(st $ID)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='RESCHEDULED' and status='INSPECT_DISPATCH'" | grep -q "09:30.*10:00" \
  && pass "ประวัติบันทึกว่าเลื่อนนัดตรวจจากวันเสนอเป็นวันใหม่" || fail "ไม่มีประวัติเลื่อนนัดตรวจ"
# ร้านตกลงแล้วแต่หัวหน้าภาคยังไม่ส่ง — ช่างยังไปตรวจไม่ได้ และส่งตัวเองไม่ได้
R=$(POST $T "work-orders/$ID/inspection" '{"note":"แอบไปก่อนส่ง"}')
echo "$R" | grep -q "รอหัวหน้าภาคส่งช่างตรวจ" && [ "$(st $ID)" = "INSPECT_DISPATCH" ] \
  && pass "หัวหน้าภาคยังไม่ส่ง ช่างบันทึกผลตรวจไม่ได้" || fail "บันทึกผลตรวจได้ก่อนส่ง: $(echo $R|head -c 120)"
R=$(POST $T "work-orders/$ID/dispatch" '{}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "ช่างส่งตัวเองเข้าตรวจไม่ได้" || fail "ช่างส่งได้: $(echo $R|head -c 120)"
[ "$(curl -s "localhost:4000/api/work-orders?status=INBOX" -H "$(H $S)" | J 'String(d.rows.some(r=>r.id==='$ID'))')" = "true" ] \
  && pass "ใบรอส่งช่างตรวจขึ้นในกล่องงานของหัวหน้าภาค" || fail "ไม่อยู่ในกล่องงานหัวหน้าภาค"
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
[ "$(DB "select status||'|'||to_char(\"scheduledAt\",'YYYY-MM-DD')||'|'||\"assignedTeam\" from \"WorkOrder\" where id=$ID")" = "INSPECTING|2026-11-04|$TEAM" ] \
  && DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='DISPATCHED' and status='INSPECTING'" | grep -q "ส่งตรวจหน้างาน $TEAM" \
  && pass "หัวหน้าภาคส่งช่างเข้าตรวจ → รอทีมตรวจหน้างาน วันนัดคงเดิม มีประวัติ" || fail "ส่งช่างตรวจไม่สำเร็จ: $(st $ID)"
R=$(POST $T "work-orders/$ID/inspection" '{"note":""}')
echo "$R" | grep -q "ต้องบอกว่าตรวจแล้วเจออะไร" && pass "ผลตรวจว่างไม่ได้" || fail "ผลตรวจว่างผ่าน: $(echo $R|head -c 120)"
# ไฟล์ตรวจหน้างานต้องครบสามอย่าง: รูปหน้างาน · รูปอะไหล่ที่เสีย · วิดีโอการทำงาน
UPI() { curl -s -X POST "localhost:4000/api/work-orders/$1/attachments" -H "$(H $T)" -F "file=@$SP/$2" -F "role=$3"; }
R=$(POST $T "work-orders/$ID/inspection" '{"note":"วาล์วน้ำทิ้งค้าง"}')
echo "$R" | grep -q "ยังขาด: รูปหน้างาน · รูปอะไหล่ที่เสีย · วิดีโอการทำงาน" && [ "$(st $ID)" = "INSPECTING" ] \
  && pass "ไม่มีไฟล์ตรวจ ส่งผลตรวจไม่ได้ และบอกว่าขาดอะไรบ้าง" || fail "ส่งผลตรวจได้ทั้งที่ไม่มีไฟล์: $(echo $R|head -c 160)"
R=$(UPI $ID "site-photo.png;type=image/png" INSPECT_VIDEO)
echo "$R" | grep -q "วิดีโอการทำงานต้องเป็นไฟล์วิดีโอ" && [ "$(DB "select count(*) from \"WorkOrderAttachment\" where \"workOrderId\"=$ID")" = "0" ] \
  && pass "กรอบวิดีโอการทำงานไม่รับรูป" || fail "กรอบวิดีโอรับรูป: $(echo $R|head -c 120)"
R=$(UPI $ID "site-clip.mp4;type=video/mp4" INSPECT_PART)
echo "$R" | grep -q "รูปอะไหล่ที่เสียต้องเป็นรูปภาพ" && pass "กรอบรูปอะไหล่ไม่รับวิดีโอ" || fail "กรอบรูปรับวิดีโอ: $(echo $R|head -c 120)"
UPI $ID "site-photo.png;type=image/png" INSPECT_SITE >/dev/null
UPI $ID "site-photo.png;type=image/png" INSPECT_SITE >/dev/null
UPI $ID "site-photo.png;type=image/png" INSPECT_PART >/dev/null
R=$(POST $T "work-orders/$ID/inspection" '{"note":"วาล์วน้ำทิ้งค้าง"}')
echo "$R" | grep -q "ยังขาด: วิดีโอการทำงาน —" && [ "$(st $ID)" = "INSPECTING" ] \
  && pass "แนบรูปหลายรูปแล้วแต่ขาดวิดีโอ ยังส่งไม่ได้ และบอกเฉพาะที่ขาด" || fail "ขาดวิดีโอแต่ส่งได้: $(echo $R|head -c 160)"
UPI $ID "site-clip.mp4;type=video/mp4" INSPECT_VIDEO >/dev/null
[ "$(curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $T)" | J 'const f=d.inspectionFiles;[f.INSPECT_SITE,f.INSPECT_PART,f.INSPECT_VIDEO].join()')" = "2,1,1" ] \
  && pass "หน้ารายละเอียดนับไฟล์ตรวจแต่ละกรอบได้ (รูปหน้างาน 2 รูป)" || fail "นับไฟล์ตรวจผิด"
POST $T "work-orders/$ID/inspection" '{"note":"วาล์วน้ำทิ้งค้าง บอร์ดมีรอยไหม้"}' >/dev/null
[ "$(DB "select status||'|'||(\"inspectedAt\" is not null)||'|'||(\"scheduledAt\" is null) from \"WorkOrder\" where id=$ID")" = "NEW|true|true" ] \
  && pass "ทีมบันทึกผลตรวจแล้วใบงานกลับไปให้ระบุอะไหล่" || fail "บันทึกผลตรวจไม่สำเร็จ: $(st $ID)"

# ส่งไปตรวจซ้ำ — ไฟล์ของรอบตรวจก่อนไม่นับ ต้องถ่ายใหม่ (หัวหน้าภาคบันทึกแทนก็ต้องครบ)
ID2=$(newwo INSPECT); CREATED="$CREATED $ID2"
R=$(POST $S "work-orders/$ID2/inspect-request" "{\"team\":\"$TEAM\"}")
echo "$R" | grep -q "scheduledAt" && [ "$(st $ID2)" = "NEW" ] \
  && pass "ส่งตรวจโดยไม่ใส่วันเข้าตรวจไม่ได้ (บังคับวัน)" || fail "ส่งตรวจได้ทั้งที่ไม่มีวัน: $(echo $R|head -c 120)"
POST $S "work-orders/$ID2/inspect-request" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-05\"}" >/dev/null
POST $A "work-orders/$ID2/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID2/dispatch" '{}' >/dev/null
for r in INSPECT_SITE INSPECT_PART; do UPI $ID2 "site-photo.png;type=image/png" $r >/dev/null; done
UPI $ID2 "site-clip.mp4;type=video/mp4" INSPECT_VIDEO >/dev/null
POST $T "work-orders/$ID2/inspection" '{"note":"รอบแรก"}' >/dev/null
sleep 1
POST $S "work-orders/$ID2/inspect-request" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-06\"}" >/dev/null
POST $A "work-orders/$ID2/confirm-appointment" '{}' >/dev/null
[ "$(st $ID2)" = "INSPECT_DISPATCH" ] && pass "ลูกค้าตกลงวันที่หัวหน้าภาคเสนอ แอดมินกดคอนเฟิร์มได้เลย" || fail "คอนเฟิร์มวันเสนอไม่ได้: $(st $ID2)"
POST $S "work-orders/$ID2/dispatch" '{}' >/dev/null
R=$(POST $S "work-orders/$ID2/inspection" '{"note":"รอบสอง"}')
echo "$R" | grep -q "ยังขาด: รูปหน้างาน · รูปอะไหล่ที่เสีย · วิดีโอการทำงาน" && [ "$(st $ID2)" = "INSPECTING" ] \
  && pass "ตรวจซ้ำ: ไฟล์รอบก่อนไม่นับ หัวหน้าภาคบันทึกแทนก็ต้องแนบครบ" || fail "ไฟล์รอบก่อนถูกนับ: $(echo $R|head -c 160)"

echo
echo "═══ หัวหน้าภาคจ่ายงาน+วัน → แอดมินคอนเฟิร์มลูกค้า (เลื่อนวันได้) → หัวหน้าภาคยืนยันออกงาน"
POST $S "work-orders/$ID/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$P1,\"quantity\":1}]}" >/dev/null
POST $A "work-orders/$ID/parts-check" "{\"results\":[{\"sparePartId\":$P1,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-PL1\"}]}" >/dev/null
[ "$(st $ID)" = "PARTS_CHECKED" ] && pass "ของครบแล้วไปรอหัวหน้าภาคจ่ายงาน" || fail "ไม่ได้ไปรอจ่ายงาน: $(st $ID)"
R=$(POST $T "work-orders/$ID/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-04\"}")
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "ช่างจ่ายงานเองไม่ได้" || fail "ช่างจ่ายงานได้: $(echo $R|head -c 120)"
POST $S "work-orders/$ID/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-04\",\"scheduledTime\":\"10:00\"}" >/dev/null
[ "$(DB "select status||'|'||\"appointmentStatus\"||'|'||\"assignedTeam\"||'|'||\"scheduledTime\" from \"WorkOrder\" where id=$ID")" = "AWAITING_CONFIRM|PENDING|$TEAM|10:00" ] \
  && pass "จ่ายงานพร้อมวันเวลา แล้วไปรอแอดมินคอนเฟิร์มลูกค้า" || fail "จ่ายงานไม่สำเร็จ: $(st $ID)"
R=$(POST $T "work-orders/$ID/confirm-appointment" '{}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "ช่างกดคอนเฟิร์มแทนไม่ได้" || fail "ช่างคอนเฟิร์มได้: $(echo $R|head -c 120)"
R=$(POST $S "work-orders/$ID/confirm-appointment" '{}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "หัวหน้าภาคกดคอนเฟิร์มแทนแอดมินไม่ได้" || fail "หัวหน้าภาคคอนเฟิร์มได้: $(echo $R|head -c 120)"
POST $A "work-orders/$ID/confirm-appointment" '{"scheduledAt":"2026-11-04","scheduledTime":"13:30"}' >/dev/null
[ "$(DB "select status||'|'||\"appointmentStatus\"||'|'||\"scheduledTime\" from \"WorkOrder\" where id=$ID")" = "ASSIGNED|CONFIRMED|13:30" ] \
  && pass "ลูกค้าขอเลื่อนเวลา แอดมินเปลี่ยนได้เลย แล้วส่งให้หัวหน้าภาคยืนยันออกงาน" || fail "คอนเฟิร์มไม่สำเร็จ: $(st $ID)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='RESCHEDULED'" | grep -q "10:00.*13:30" \
  && pass "ประวัติบันทึกว่าเลื่อนจากเวลาเดิมเป็นเวลาใหม่" || fail "ไม่มีประวัติการเลื่อน"
R=$(POST $T "work-orders/$ID/dispatch" '{}')
echo "$R" | grep -q "ขั้นนี้เป็นของ" && pass "ช่างยืนยันออกงานเองไม่ได้" || fail "ช่างยืนยันออกงานได้: $(echo $R|head -c 120)"
POST $S "work-orders/$ID/dispatch" '{}' >/dev/null
[ "$(DB "select status||'|'||\"assignedTeam\" from \"WorkOrder\" where id=$ID")" = "IN_PROGRESS|$TEAM" ] \
  && pass "หัวหน้าภาคยืนยันออกงาน แล้วถึงคิวช่างเข้างาน" || fail "ยืนยันออกงานไม่สำเร็จ: $(st $ID)"

echo
echo "═══ บอร์ดแผนงาน"
R=$(curl -s "localhost:4000/api/plans/day?date=2026-11-04" -H "$(H $T)")
echo "$R" | grep -q "เฉพาะแอดมินกับหัวหน้าภาค" && pass "ช่างเปิดบอร์ดไม่ได้" || fail "ช่างเปิดบอร์ดได้"
VID=$(DB "select id from \"Vehicle\" order by id limit 1")
R=$(curl -s -X PUT localhost:4000/api/plans -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"date\":\"2026-11-04\",\"team\":\"$TEAM\",\"vehicleId\":${VID:-null},\"memberIds\":[$TID]}")
[ "$(DB "select count(*) from \"TeamDayPlanMember\" m join \"TeamDayPlan\" p on p.id=m.\"planId\" where p.team='$TEAM' and p.date='2026-11-04' and p.\"plannedById\"=$SID")" = "1" ] \
  && pass "หัวหน้าภาคจัดคนลงแผนได้ และบันทึกว่าใครจัด" || fail "จัดแผนไม่สำเร็จ: $R"
R=$(curl -s "localhost:4000/api/plans/day?date=2026-11-04" -H "$(H $S)")
echo "$R" | J "const l=d.lanes.find(x=>x.team==='$TEAM'); l&&l.stops.some(s=>s.id===$ID&&s.time==='13:30')&&l.plan.members.length===1?'ok':'bad'" | grep -q ok \
  && pass "บอร์ดโชว์ใบงานในทีม พร้อมเวลา และคนที่ไป" || fail "บอร์ดไม่ตรง: $(echo $R|head -c 200)"
# ฟอร์มจัดแผนของหัวหน้าภาคต้องมีแต่ทีมของตัวเอง — ทีมอื่นบันทึกไม่ได้อยู่แล้ว ให้เลือกได้คือหลอกให้เสียเวลา
MINE=$(DB "select string_agg(distinct z,',' order by z) from (select zone z from \"Branch\" where region='$REGION' and \"cancelledAt\" is null and zone is not null union select \"pmTeam\" from \"Branch\" where region='$REGION' and \"cancelledAt\" is null and \"pmTeam\" is not null) t")
GOT=$(echo "$R" | J '[...d.plannableTeams].sort().join(",")')
[ "$(echo "$MINE" | tr ',' '\n' | sort | paste -sd,)" = "$GOT" ] && ! echo "$GOT" | tr ',' '\n' | grep -qx "$(DB "select zone from \"Branch\" where coalesce(region,'')<>'$REGION' and zone is not null and zone not in (select zone from \"Branch\" where region='$REGION' and zone is not null) limit 1")" \
  && pass "ทีมให้เลือกในฟอร์มจัดแผน = ทีมในภาคของหัวหน้าภาคเท่านั้น ($GOT)" || fail "ทีมในฟอร์ม '$GOT' ≠ ทีมในภาค '$MINE'"
curl -s "localhost:4000/api/plans/day?date=2026-11-04" -H "$(H $A)" | J 'd.plannableTeams===null?"ok":"bad"' | grep -q ok \
  && pass "แอดมินเลือกได้ทุกทีม (plannableTeams = null)" || fail "แอดมินถูกจำกัดทีม"
curl -s "localhost:4000/api/plans/month?month=2026-11" -H "$(H $A)" | J 'd.days["2026-11-04"]>=1?"ok":"bad"' | grep -q ok \
  && pass "ปฏิทินเดือนนับวันที่มีแผน" || fail "ปฏิทินไม่มีจุด"
# เวลาเข้าหน้างานของทีม
R=$(curl -s -X PUT localhost:4000/api/plans -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"date\":\"2026-11-04\",\"team\":\"$TEAM\",\"memberIds\":[$TID],\"startTime\":\"25:00\"}")
echo "$R" | grep -q "ชั่วโมง:นาที" && pass "เวลาเข้าหน้างานผิดรูปแบบ ถูกปฏิเสธเป็นภาษาไทย" || fail "รับเวลาผิด: $(echo $R|head -c 120)"
curl -s -X PUT localhost:4000/api/plans -H "$(H $S)" -H 'Content-Type: application/json' \
  -d "{\"date\":\"2026-11-04\",\"team\":\"$TEAM\",\"vehicleId\":${VID:-null},\"memberIds\":[$TID],\"startTime\":\"08:30\"}" >/dev/null
[ "$(DB "select \"startTime\" from \"TeamDayPlan\" where team='$TEAM' and date='2026-11-04'")" = "08:30" ] \
  && curl -s "localhost:4000/api/plans/day?date=2026-11-04" -H "$(H $S)" | J "d.lanes.find(x=>x.team==='$TEAM').plan.startTime" | grep -q "08:30" \
  && pass "บันทึกเวลาเข้าหน้างาน 08:30 และบอร์ดส่งกลับมา" || fail "เวลาเข้าหน้างานไม่ถูกบันทึก"

echo
echo "═══ ย้อนขั้นตอน"
R=$(POST $T "work-orders/$ID/rollback" '{"toStage":"PARTS_CHECKED","reason":"ลองย้อน"}')
echo "$R" | grep -q "เฉพาะแอดมินกับหัวหน้าภาค" && pass "ช่างย้อนขั้นไม่ได้" || fail "ช่างย้อนได้: $(echo $R|head -c 120)"
R=$(POST $S "work-orders/$ID/rollback" '{"toStage":"PARTS_CHECKED","reason":""}')
echo "$R" | grep -q "ต้องบอกเหตุผล" && pass "ย้อนโดยไม่บอกเหตุผลไม่ได้" || fail "ย้อนได้โดยไม่มีเหตุผล"
POST $S "work-orders/$ID/rollback" '{"toStage":"PARTS_CHECKED","reason":"ลูกค้าขอเลื่อนนัด"}' >/dev/null
[ "$(DB "select status||'|'||(\"scheduledAt\" is null)||'|'||coalesce(\"assignedTeam\",'-') from \"WorkOrder\" where id=$ID")" = "PARTS_CHECKED|true|-" ] \
  && pass "ย้อนไปจ่ายงานใหม่ — ล้างวันนัดและทีม" || fail "ย้อนไม่ถูก: $(st $ID)"
DB "select note from \"WorkOrderLog\" where \"workOrderId\"=$ID and action='ROLLED_BACK'" | grep -q "ลูกค้าขอเลื่อนนัด" \
  && pass "ประวัติบันทึกเหตุผลที่ย้อน" || fail "ไม่มีประวัติการย้อน"
POST $A "work-orders/$ID/rollback" '{"toStage":"PARTS_REQUESTED","reason":"เช็คคลังผิดตัว"}' >/dev/null
[ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$ID and kind='WAITING' and \"inStock\" is null and \"requisitionNo\" is null")" = "1" ] \
  && [ "$(st $ID)" = "PARTS_REQUESTED" ] && pass "แอดมินย้อนไปเช็คคลัง — ผลเช็ครอบเดิมถูกล้าง" || fail "ผลเช็คคลังยังค้าง"
R=$(POST $A "work-orders/$ID/rollback" '{"toStage":"IN_PROGRESS","reason":"ไปข้างหน้า"}')
echo "$R" | grep -q "ขั้นที่ผ่านมาแล้ว" && pass "ใช้ย้อนเพื่อข้ามไปข้างหน้าไม่ได้" || fail "ข้ามไปข้างหน้าได้"

echo
echo "═══ แยกใบงานรออะไหล่ตอนเช็คคลัง"
ID2=$(newwo CM); CREATED="$CREATED $ID2"
POST $S "work-orders/$ID2/parts" "{\"needsParts\":true,\"parts\":[{\"sparePartId\":$P1,\"quantity\":1},{\"sparePartId\":$P2,\"quantity\":2}]}" >/dev/null
POST $A "work-orders/$ID2/parts-check" "{\"splitOut\":true,\"results\":[{\"sparePartId\":$P1,\"inStock\":true,\"warehouse\":\"คลังกระบี่\",\"requisitionNo\":\"RQ-PL2\"},{\"sparePartId\":$P2,\"inStock\":false}]}" >/dev/null
CH=$(DB "select id from \"WorkOrder\" where \"parentId\"=$ID2")
[ -n "$CH" ] && CREATED="$CREATED $CH"
[ "$(st $ID2)" = "PARTS_CHECKED" ] && [ "$(st $CH)" = "WAITING_PARTS" ] \
  && pass "ใบเดิมไปจ่ายงานด้วยของที่มี ตัวที่หมดแยกเป็นใบรออะไหล่" || fail "แยกไม่สำเร็จ: $(st $ID2) / ${CH:-ไม่มีใบลูก}"
[ "$(DB "select string_agg(\"sparePartId\"::text||'x'||quantity,',') from \"WorkOrderPart\" where \"workOrderId\"=$CH")" = "${P2}x2" ] \
  && [ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$ID2")" = "1" ] \
  && pass "อะไหล่ที่หมดย้ายไปใบใหม่พร้อมจำนวน ไม่ซ้ำในใบเดิม" || fail "อะไหล่ไม่ได้ย้าย"
curl -s "localhost:4000/api/plans/pending" -H "$(H $S)" | J "d.some(r=>r.id===$CH&&r.parentCode)?'ok':'bad'" | grep -q ok \
  && pass "ใบรออะไหล่ขึ้นในรายการรอจัดแผนของหัวหน้าภาค" || fail "ไม่ขึ้นในรอจัดแผน"
R=$(POST $A "work-orders/$CH/parts-arrived" '{}')
POST $S "work-orders/$CH/parts-arrived" '{"note":"ของเข้าคลังแล้ว"}' >/dev/null
[ "$(st $CH)" = "PARTS_REQUESTED" ] && [ "$(DB "select count(*) from \"WorkOrderPart\" where \"workOrderId\"=$CH and \"inStock\" is null")" = "1" ] \
  && pass "ของมาแล้ว ส่งต่อให้แอดมินเช็คใหม่ (ผล 'หมด' เดิมถูกล้าง)" || fail "ส่งต่อไม่สำเร็จ: $(st $CH)"

echo
echo "═══ เข้าหน้างานแล้วอะไหล่ไม่ครบ — เปิดใบรออะไหล่ต่อ"
R=$(POST $T "work-orders/$ID2/follow-up" "{\"parts\":[{\"sparePartId\":$P2,\"quantity\":1}]}")
echo "$R" | grep -q "ยังไม่ถึงขั้นเข้าหน้างาน" && pass "ก่อนจ่ายงานยังเปิดใบต่อไม่ได้" || fail "เปิดใบต่อได้ก่อนเข้าหน้างาน"
POST $S "work-orders/$ID2/assign" "{\"team\":\"$TEAM\",\"scheduledAt\":\"2026-11-05\"}" >/dev/null
POST $A "work-orders/$ID2/confirm-appointment" '{}' >/dev/null
POST $S "work-orders/$ID2/dispatch" '{}' >/dev/null
R=$(POST $T "work-orders/$ID2/follow-up" "{\"parts\":[{\"sparePartId\":$P2,\"quantity\":1}],\"note\":\"ต้องเปลี่ยนเพิ่ม\"}")
CH2=$(echo "$R" | J 'd.createdChild?d.createdChild.id:""')
[ -n "$CH2" ] && CREATED="$CREATED $CH2"
[ -n "$CH2" ] && [ "$(DB "select \"parentId\"||'|'||status from \"WorkOrder\" where id=$CH2")" = "$ID2|WAITING_PARTS" ] \
  && pass "ช่างในทีมเปิดใบรออะไหล่ต่อได้ ลิงก์กับใบเดิม" || fail "เปิดใบต่อไม่สำเร็จ: $(echo $R|head -c 140)"

echo
# เก็บกวาด — ลบใบงานที่สร้าง แผนที่จัด และคืนค่าทีม/ภาคของผู้ใช้ทดสอบ
for x in $CREATED; do curl -s -X DELETE "localhost:4000/api/work-orders/$x" -H "$(H $A)" >/dev/null; done
DB "delete from \"TeamDayPlan\" where date='2026-11-04' and team='$TEAM'" >/dev/null
DB "update \"User\" set region=nullif('$OLD_REGION','') where id=$SID; update \"User\" set team=nullif('$OLD_TEAM','') where id=$TID" >/dev/null
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
