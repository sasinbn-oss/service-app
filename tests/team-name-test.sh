#!/bin/bash
# ทดสอบ: ชื่อทีมที่หน้าจอเห็นเหมือนกันแต่ข้างในต่างกัน (ต.ค. 69 — "มีทีมแต่ทำไมใบงานไม่เข้าทีม")
#   · ช่องว่าง/อักษรมองไม่เห็นในชื่อทีม ถูกล้างตอนบันทึก (สาขา · สิทธิ์ผู้ใช้) และตอนเทียบขอบเขต
#   · สะกดสลับ ณ/น (พิษนุโลก ↔ พิษณุโลก) → ใบ "ไม่มีคนรับ" บอกชื่อหัวหน้าภาคกับชื่อที่สะกดไม่ตรง
#   · รวมทีมที่หน้าทีมช่าง (เปลี่ยนชื่อ) แล้วใบเข้าหัวหน้าภาค · หัวหน้าภาคเห็นใบในรายการของตัวเอง
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001)
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
ZW=$(printf '​')
SID=$(DB "select id from \"User\" where \"employeeCode\"='S001'")
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where id=$SID")
OLD_TEAMS=$(DB "select \"supervisedTeams\"::text from \"User\" where id=$SID")
CODE="ZT$((RANDOM % 900 + 100))"

# สาขาไม่มีภาค ทีม "พิษณุโลก" — พิมพ์มาพร้อมช่องว่างท้ายกับ zero-width space
BID=$(curl -s -X POST localhost:4000/api/branches -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"name\":\"สาขาทดสอบชื่อทีม\",\"code\":\"$CODE\",\"zone\":\"พิษณุโลก $ZW\"}" | J 'd.id')
[ "$(DB "select zone from \"Branch\" where id=$BID")" = "พิษณุโลก" ] && pass "บันทึกสาขา: ชื่อทีมถูกล้างช่องว่าง/อักษรซ่อน" || fail "zone: [$(DB "select zone from \"Branch\" where id=$BID")]"

# หัวหน้าภาคดูแลตามทีมอย่างเดียว — ติ๊กชื่อที่สะกดผิด
curl -s -X PATCH localhost:4000/api/auth/users/$SID -H "$(H $A)" -H 'Content-Type: application/json' -d '{"region":null,"supervisedTeams":["พิษนุโลก"]}' >/dev/null
X=$(mktemp --suffix=.xlsx)
NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("S");
  ws.addRow(["วันที่แจ้ง","รหัสสาขา","ประเภทงาน","เครื่อง","อาการที่พบ"]);
  ws.addRow([new Date(),process.argv[1],"CM","W1","ทดสอบชื่อทีม เครื่องไม่ปั่น"]);
  wb.xlsx.writeFile(process.argv[2]);' "$CODE" "$X"
WO=$(curl -s -X POST localhost:4000/api/work-orders/import-form -H "$(H $A)" -F "file=@$X" -F apply=true | J 'd.created[0]')
rm -f "$X"
ROW() { curl -s "localhost:4000/api/work-orders?status=ALL&search=$WO" -H "$(H $A)" | J "const r=d.rows.find(r=>r.code==='$WO'); $1"; }
ROW 'r.orphan && /S001|สะกดไม่ตรง/.test(r.orphanReason) && r.orphanReason.includes("พิษนุโลก") ? "ok" : JSON.stringify([r.orphan,r.orphanReason])' | grep -q '^ok$' \
  && pass "สะกดสลับ ณ/น: ไม่มีคนรับ + บอกว่าหัวหน้าภาคดูแล \"พิษนุโลก\" ซึ่งสะกดไม่ตรง" || fail "orphanReason: $(ROW 'r.orphanReason')"

# รวมทีมที่หน้าทีมช่าง — เปลี่ยนชื่อ พิษนุโลก → พิษณุโลก (ยืนยันรวม)
R=$(curl -s -X POST localhost:4000/api/teams/rename -H "$(H $A)" -H 'Content-Type: application/json' -d '{"from":"พิษนุโลก","to":"พิษณุโลก","merge":true}')
ROW 'r.orphan===false && r.waitingOnSupervisors.some(s=>s.id==='$SID') ? "ok" : JSON.stringify([r.orphan,r.orphanReason])' | grep -q '^ok$' \
  && pass "รวมทีมแล้ว ใบเข้าหัวหน้าภาค (ไม่อยู่ในไม่มีคนรับ)" || fail "หลังรวม: $(ROW 'JSON.stringify([r.orphan,r.orphanReason])') · rename: $R"
S=$(login S001)
curl -s "localhost:4000/api/work-orders?status=ALL&search=$WO" -H "$(H $S)" | J "d.rows.some(r=>r.code==='$WO')" | grep -q true \
  && pass "หัวหน้าภาคเห็นใบในรายการของตัวเอง" || fail "S001 ไม่เห็น $WO"

# ติ๊กทีมที่มีอักษรซ่อน — ถูกล้างตอนบันทึก
curl -s -X PATCH localhost:4000/api/auth/users/$SID -H "$(H $A)" -H 'Content-Type: application/json' -d "{\"supervisedTeams\":[\" พิษณุโลก$ZW\"]}" >/dev/null
[ "$(DB "select \"supervisedTeams\"::text from \"User\" where id=$SID")" = "{พิษณุโลก}" ] && pass "บันทึกสิทธิ์ผู้ใช้: ทีมที่ดูแลถูกล้างอักษรซ่อน" || fail "supervisedTeams: $(DB "select \"supervisedTeams\"::text from \"User\" where id=$SID")"

# ข้อมูลเก่าที่ยังสกปรกในฐานข้อมูล — การเทียบขอบเขตยังจับคู่ได้
DB "update \"Branch\" set zone='พิษณุโลก '||chr(8203) where id=$BID" >/dev/null
ROW 'r.orphan===false ? "ok" : r.orphanReason' | grep -q '^ok$' && pass "ชื่อทีมในฐานข้อมูลมีอักษรซ่อน → ยังนับว่าหัวหน้าภาคดูแล" || fail "dirty: $(ROW 'r.orphanReason')"

# เก็บกวาด
curl -s -X DELETE "localhost:4000/api/work-orders/$(DB "select id from \"WorkOrder\" where code='$WO'")" -H "$(H $A)" >/dev/null
DB "delete from \"Machine\" where \"branchId\"=$BID; delete from \"Branch\" where id=$BID; delete from \"TeamRename\" where \"fromName\"='พิษนุโลก'" >/dev/null
DB "update \"User\" set region=NULLIF('$OLD_REGION',''), \"supervisedTeams\"='$OLD_TEAMS' where id=$SID" >/dev/null
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
