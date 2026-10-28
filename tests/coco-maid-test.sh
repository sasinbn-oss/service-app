#!/bin/bash
# ทดสอบ: ตำแหน่ง Maid (COCO) — เจ้าของงานเพิ่ม ต.ค. 69 · สิทธิ์เท่า Supervisor (COCO) แต่เห็นเฉพาะสาขาที่ประจำ
#   · นำเข้าไฟล์รายชื่อ Maid ผ่านปุ่ม "นำเข้า Area Team": ตัวอย่างไม่บันทึก · สร้างบัญชี + ผูกสาขา + รหัสสุ่มในไฟล์ Excel
#     แถวตำแหน่งอื่น/ไม่มี User ถูกข้าม · ชื่อผู้ใช้ที่เป็น Supervisor อยู่แล้วไม่ถูกลดเป็น Maid · ไม่ไปทับ Supervisor ของสาขา
#   · Maid เห็นและเปิดใบงานได้เฉพาะสาขาที่ประจำ · ทำขั้นตอน/หน้าอื่นไม่ได้
#   · เพิ่มทีละคนในหน้าสิทธิ์ผู้ใช้: ต้องเลือกสาขา COCO · แก้สาขาได้ · เปลี่ยนตำแหน่งแล้วสาขาถูกล้าง
#   · นำเข้าซ้ำ = แทนที่สาขาเดิม ไม่แตะรหัสผ่าน
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}" | J 'd.token'; }
A=$(login A001); T=$(login T001)
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
SEND() { curl -s -X "$2" "localhost:4000/api/$3" -H "$(H $1)" -H 'Content-Type: application/json' -d "$4"; }
CODE() { curl -s -o /dev/null -w "%{http_code}" -X "${3:-GET}" "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' ${4:+-d "$4"}; }

LOGINS="'zz.maid1','zz.maid2','zz.maid3','zz.msup'"
cleanup() {
  DB "delete from \"WorkOrder\" where \"createdById\" in (select id from \"User\" where \"employeeCode\" in ($LOGINS))" >/dev/null
  DB "delete from \"WorkOrder\" where \"symptom\" = 'ทดสอบ maid'" >/dev/null
  DB "update \"Branch\" set \"cocoSupervisorId\"=null where \"cocoSupervisorId\" in (select id from \"User\" where \"employeeCode\" in ($LOGINS))" >/dev/null
  DB "delete from \"User\" where \"employeeCode\" in ($LOGINS)" >/dev/null
}
cleanup
trap 'cleanup; rm -f "$X" "$X2"' EXIT

# ไฟล์แบบเดียวกับรายชื่อ Maid ที่เจ้าของงานส่งมา (ชื่อคอลัมน์เดียวกัน) — คนสมมติ ไม่ใช่ข้อมูลจริง
mk() { NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("Maid");
  ws.addRow(["ลำดับ","Area (หัวหน้า)","Name-Surname (Thai)","Nickname","Tel","ERP","Project Name","Position","Remark","User"]);
  JSON.parse(process.argv[2]).forEach((r,i)=>ws.addRow([i+1,"นายหัวหน้า ทดสอบ (บี)",r[1],r[2],"080-000-000"+i,r[0],"สาขาทดสอบ",r[3],"ดูแลแทน",r[4]]));
  wb.xlsx.writeFile(process.argv[1]);' "$1" "$2"; }
X=$(mktemp --suffix=.xlsx); X2=$(mktemp --suffix=.xlsx)
IMP() { curl -s -X POST localhost:4000/api/user-import/area-team -H "$(H $1)" -F "file=@$2" ${3:+-F apply=1}; }

# Supervisor (COCO) ที่ชื่อผู้ใช้ไปซ้ำกับแถวในไฟล์ Maid — ต้องไม่ถูกลดตำแหน่ง
SEND $A POST auth/users '{"employeeCode":"zz.msup","name":"Supervisor ทดสอบ","role":"COCO_SUPERVISOR","password":"test12345"}' >/dev/null
SUPC0001=$(DB "select coalesce(\"cocoSupervisorId\"::text,'-') from \"Branch\" where code='C0001'")
mk "$X" '[["C0001","นางสาวหนึ่ง ทดสอบ","หนึ่ง","Maid (COCO)","Zz.Maid1"],["C9999","นางสาวหนึ่ง ทดสอบ","หนึ่ง","Maid (COCO)","zz.maid1"],["C0006","นางสาวสอง ทดสอบ","สอง","Maid (COCO)","zz.maid2@example.com"],["C0006","นายสาม ทดสอบ","สาม","Supervisor (COCO)","zz.maid3"],["C0006","นางสาวสี่ ทดสอบ","สี่","Maid (COCO)",""],["C0001","นายซ้ำ ทดสอบ","ซ้ำ","Maid (COCO)","zz.msup"]]'

echo "═══ นำเข้าไฟล์รายชื่อ Maid (ปุ่มเดียวกับ Area Team)"
P=$(IMP $A "$X")
[ "$(echo "$P" | J '[d.summary.maids,d.summary.create,d.summary.missingBranches.join(),d.summary.taken.map(t=>t.login).join(),d.summary.problems.length].join("|")')" = "3|2|C9999|zz.msup|2" ] \
  && pass "ตัวอย่าง: Maid 3 คน · สร้าง 2 · C9999 ไม่มีในระบบ · zz.msup เป็น Supervisor อยู่แล้ว (ข้าม) · ข้ามแถวตำแหน่งอื่น/ไม่มี User 2 แถว" \
  || fail "ตัวอย่าง: $(echo "$P" | head -c 400)"
[ "$(echo "$P" | J 'd.people.find(p=>p.login==="zz.maid1").branches.join()')" = "C0001" ] && pass "ชื่อผู้ใช้ตัวใหญ่ในไฟล์ → ตัวเล็ก · สองแถวคนเดียวกันรวมเป็นคนเดียว" || fail "zz.maid1: $(echo "$P" | J 'JSON.stringify(d.people)')"
[ "$(DB "select count(*) from \"User\" where \"employeeCode\" in ('zz.maid1','zz.maid2','zz.maid3')")" = "0" ] && pass "ดูตัวอย่างไม่สร้างบัญชี" || fail "ดูตัวอย่างแล้วมีบัญชี"

R=$(IMP $A "$X" 1)
ROWS=$(DB "select \"employeeCode\"||':'||role||':'||\"mustChangePassword\" from \"User\" where \"employeeCode\" in ($LOGINS) order by 1" | tr '\n' ' ')
[ "$ROWS" = "zz.maid1:COCO_MAID:true zz.maid2:COCO_MAID:true zz.msup:COCO_SUPERVISOR:true " ] \
  && pass "ฐานข้อมูล: Maid 2 บัญชี ต้องเปลี่ยนรหัส · Supervisor เดิมยังเป็น Supervisor · แถวตำแหน่งอื่นไม่ถูกสร้าง" || fail "บัญชี: $ROWS"
LINKS() { DB "select string_agg(u.\"employeeCode\"||'='||b.code, ' ' order by u.\"employeeCode\", b.code) from \"CocoMaidBranch\" m join \"User\" u on u.id=m.\"userId\" join \"Branch\" b on b.id=m.\"branchId\" where u.\"employeeCode\" in ($LOGINS)"; }
[ "$(LINKS)" = "zz.maid1=C0001 zz.maid2=C0006" ] && pass "ฐานข้อมูล: สาขาที่ Maid ประจำผูกถูกคน" || fail "สาขาที่ประจำ: $(LINKS)"
[ "$(DB "select coalesce(\"cocoSupervisorId\"::text,'-') from \"Branch\" where code='C0001'")" = "$SUPC0001" ] && pass "ไม่ไปทับ Supervisor ของสาขา (Branch.cocoSupervisorId เดิม)" || fail "Supervisor ของสาขาเปลี่ยน"
CRED=$(mktemp --suffix=.xlsx); curl -s "localhost:4000$(echo "$R" | J 'd.credentials.path')" -o "$CRED"
cell() { NODE_PATH=backend/node_modules node -e 'const E=require("exceljs");const w=new E.Workbook();w.xlsx.readFile(process.argv[1]).then(()=>{w.worksheets[0].eachRow(r=>{if(r.getCell(1).text===process.argv[2])console.log(r.getCell(+process.argv[3]).text)})})' "$CRED" "$1" "$2"; }
P_M1=$(cell zz.maid1 2); P_M2=$(cell zz.maid2 2)
[ ${#P_M1} -eq 8 ] && [ "$(cell zz.maid1 4)" = "Maid (COCO)" ] && [ "$(cell zz.maid1 5)" = "นายหัวหน้า ทดสอบ (บี)" ] && [ "$(cell zz.maid1 6)" = "C0001" ] \
  && pass "ไฟล์รหัสผ่าน: รหัส · ตำแหน่ง Maid (COCO) · หัวหน้าจากคอลัมน์ Area · สาขา" || fail "ไฟล์รหัสผ่าน: $P_M1 $(cell zz.maid1 4) $(cell zz.maid1 5)"
rm -f "$CRED"

echo
echo "═══ Maid เห็นและเปิดได้เฉพาะสาขาที่ประจำ"
chpw() { curl -s -X POST localhost:4000/api/auth/change-password -H "$(H $1)" -H 'Content-Type: application/json' -d "{\"currentPassword\":\"$2\",\"newPassword\":\"newpass99\"}" | J 'd.token'; }
M1=$(chpw $(login ZZ.Maid1 "$P_M1") "$P_M1")
[ "$(CODE $M1 work-orders)" = "200" ] && pass "เข้าระบบ (ตัวใหญ่ปนได้) และเปลี่ยนรหัสแล้วใช้งานได้" || fail "Maid ใช้งานไม่ได้"
NEW() { SEND $1 POST work-orders "$2"; }
BODY() { echo "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-111-2222\",\"machines\":[{\"code\":\"W1\",\"symptom\":\"ทดสอบ maid\"}]}"; }
W1=$(NEW $M1 "$(BODY C0001)" | J 'd.id')
[ "$(DB "select b.code||'|'||w.status from \"WorkOrder\" w join \"Branch\" b on b.id=w.\"branchId\" where w.id=$W1")" = "C0001|NEW" ] && pass "เปิดใบงานสาขาที่ประจำได้ (ฐานข้อมูล)" || fail "เปิดใบงาน: $W1"
R=$(NEW $M1 "$(BODY C0006)")
echo "$R" | grep -q "ไม่อยู่ในความดูแล" && pass "เปิดใบสาขาอื่นไม่ได้" || fail "เปิดสาขาอื่นได้: $(echo $R | head -c 120)"
W6=$(NEW $A "$(BODY C0006)" | J 'd.id')
ids() { GET $1 "work-orders?status=ALL" | J 'd.rows.map(r=>r.id).join(" ")'; }
has() { echo " $1 " | grep -q " $2 "; }
I1=$(ids $M1)
has "$I1" $W1 && ! has "$I1" $W6 && pass "รายการใบงาน: เห็นเฉพาะสาขาที่ประจำ" || fail "Maid เห็น: $I1"
[ "$(CODE $M1 work-orders/$W6)" = "403" ] && [ "$(CODE $M1 work-orders/$W1)" = "200" ] && pass "เปิดด้วยเลขใบงานสาขาอื่นไม่ได้ (403)" || fail "เปิดตรงด้วยเลขใบงาน"
[ "$(GET $M1 'branches?search=C' | J 'd.map(b=>b.code).join()')" = "C0001" ] && pass "ค้นหาสาขาเจอเฉพาะสาขาที่ประจำ" || fail "ค้นสาขา: $(GET $M1 'branches?search=C' | J 'd.map(b=>b.code).join()')"
[ "$(CODE $M1 branches/C0006/machines)" = "403" ] && [ "$(CODE $M1 branches/C0001/machines)" = "200" ] && pass "เครื่องของสาขาอื่นดูไม่ได้" || fail "เครื่องสาขาอื่น"
[ "$(CODE $M1 work-orders/$W1/assign POST '{"team":"กรุงเทพ"}')" = "403" ] && [ "$(CODE $M1 work-orders/$W1 PATCH '{"priority":"URGENT"}')" = "403" ] \
  && pass "จ่ายงาน/แก้ใบงานไม่ได้" || fail "Maid ทำขั้นตอนได้"
OK=1; for p in vehicles auth/users spare-parts branches/manage teams; do c=$(CODE $M1 $p); [ "$c" = "403" ] || { OK=; echo "    $p → $c"; }; done
[ -n "$OK" ] && pass "หน้าอื่นนอกเมนู Area Team ตอบ 403" || fail "API นอกเมนูเปิดได้"
[ "$(GET $M1 "work-orders/reports/area-team?from=2026-01-01&to=2026-12-31" | J 'd.path ? "ok" : JSON.stringify(d)')" = "ok" ] && pass "ออกรายงาน Area Team ได้" || fail "รายงาน Maid"

echo
echo "═══ เพิ่มทีละคนในหน้าสิทธิ์ผู้ใช้"
[ "$(GET $A auth/users/coco-branches | J 'd.map(b=>b.code).join()')" = "$(DB "select string_agg(code, ',' order by code) from \"Branch\" where code ilike 'C%' and \"cancelledAt\" is null")" ] \
  && pass "ตัวเลือกสาขา = สาขา COCO ที่ยังเปิดอยู่" || fail "ตัวเลือกสาขา: $(GET $A auth/users/coco-branches | head -c 200)"
[ "$(CODE $T auth/users/coco-branches)" = "403" ] && pass "ช่างดูตัวเลือกสาขาไม่ได้" || fail "ช่างดูตัวเลือกสาขาได้"
U='{"employeeCode":"ZZ.Maid3","name":"Maid ทดสอบ","role":"COCO_MAID","password":"test12345"'
R=$(SEND $A POST auth/users "$U}"); echo "$R" | grep -q "อย่างน้อยหนึ่งสาขา" && pass "ไม่เลือกสาขา → สร้างไม่ได้" || fail "สร้าง Maid ไม่มีสาขาได้: $R"
R=$(SEND $A POST auth/users "$U,\"maidBranches\":[\"C0006\",\"D0011\"]}"); echo "$R" | grep -q "ไม่ใช่สาขา COCO" && pass "สาขาแฟรนไชส์ → สร้างไม่ได้" || fail "ผูกสาขาแฟรนไชส์ได้: $R"
R=$(SEND $A POST auth/users "$U,\"maidBranches\":[\"c0006\"]}")
[ "$(echo "$R" | J 'd.role+"|"+d.maidBranches.map(b=>b.code).join()')" = "COCO_MAID|C0006" ] && [ "$(LINKS)" = "zz.maid1=C0001 zz.maid2=C0006 zz.maid3=C0006" ] \
  && pass "สร้างพร้อมสาขา (พิมพ์รหัสสาขาตัวเล็กได้) · ชื่อผู้ใช้ตัวใหญ่เก็บเป็นตัวเล็ก · ฐานข้อมูลผูกสาขาแล้ว" || fail "สร้าง Maid: $R · $(LINKS)"
M3=$(DB "select id from \"User\" where \"employeeCode\"='zz.maid3'")
[ "$(GET $A auth/users | J "d.find(u=>u.id===$M3).maidBranches.map(b=>b.code+':'+b.name).join()")" = "C0006:$(DB "select name from \"Branch\" where code='C0006'")" ] \
  && pass "รายชื่อผู้ใช้ส่งสาขาที่ประจำ (รหัส + ชื่อ) มาด้วย" || fail "รายชื่อผู้ใช้ไม่มีสาขา"
R=$(SEND $A PATCH auth/users/$M3 '{"maidBranches":["C0001","C0006"]}')
[ "$(LINKS)" = "zz.maid1=C0001 zz.maid2=C0006 zz.maid3=C0001 zz.maid3=C0006" ] && pass "แก้สาขาที่ประจำ (แทนที่ทั้งชุด) · ฐานข้อมูล" || fail "แก้สาขา: $R · $(LINKS)"
M3T=$(chpw $(login zz.maid3 test12345) test12345)
I3=$(ids $M3T); has "$I3" $W1 && has "$I3" $W6 && pass "Maid สองสาขาเห็นใบงานทั้งสองสาขา" || fail "Maid สองสาขาเห็น: $I3"
R=$(SEND $A PATCH auth/users/$M3 '{"role":"COCO_SUPERVISOR"}')
[ "$(DB "select count(*) from \"CocoMaidBranch\" where \"userId\"=$M3")" = "0" ] && pass "เปลี่ยนเป็นตำแหน่งอื่น → สาขาที่ประจำถูกล้าง" || fail "เปลี่ยนตำแหน่งแล้วสาขายังอยู่"
R=$(SEND $A PATCH auth/users/$M3 '{"maidBranches":["C0001"]}'); echo "$R" | grep -q "Maid (COCO) เท่านั้น" && pass "ตำแหน่งอื่นตั้งสาขาที่ประจำไม่ได้" || fail "ตั้งสาขาให้ตำแหน่งอื่นได้: $R"

echo
echo "═══ นำเข้าซ้ำ — แทนที่สาขาเดิม ไม่แตะรหัสผ่าน"
mk "$X2" '[["C0006","นางสาวหนึ่ง ทดสอบ","หนึ่ง","Maid (COCO)","zz.maid1"]]'
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='zz.maid1'")
R=$(IMP $A "$X2" 1)
[ "$(LINKS)" = "zz.maid1=C0006 zz.maid2=C0006" ] && pass "สาขาของ Maid ย้ายตามไฟล์ใหม่ · คนที่ไม่อยู่ในไฟล์ไม่ถูกแตะ (ฐานข้อมูล)" || fail "นำเข้าซ้ำ: $(LINKS)"
[ "$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='zz.maid1'")" = "$HASH" ] && [ "$(echo "$R" | J 'd.passwordsIssued')" = "0" ] \
  && pass "คนที่มีบัญชีแล้วไม่ถูกเปลี่ยนรหัส" || fail "รหัสถูกเปลี่ยน"
I1=$(ids $M1); has "$I1" $W6 && has "$I1" $W1 && pass "เห็นสาขาใหม่ · ใบที่ตัวเองเปิดไว้ยังเห็น" || fail "หลังย้ายสาขาเห็น: $I1"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
