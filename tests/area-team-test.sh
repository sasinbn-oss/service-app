#!/bin/bash
# ทดสอบ: ตำแหน่ง Area Team (Area · Supervisor (COCO)) — เจ้าของงานเพิ่ม ต.ค. 69
#   · นำเข้าไฟล์ Area Team: ตัวอย่างไม่บันทึก · สร้างบัญชี + ผูกสาขา + รหัสสุ่มในไฟล์ Excel · บังคับเปลี่ยนรหัส
#   · Area เห็นสาขา COCO ทั้งหมด · Supervisor (COCO) เห็นเฉพาะสาขาตัวเอง · สาขาแฟรนไชส์ไม่เห็นเลย
#   · เปิดใบงานต้องกรอกครบ · เปิดสาขานอกขอบเขตไม่ได้ · จ่ายงาน/ทำขั้นตอนไม่ได้ · API อื่นนอกเมนู 403
#   · รายงาน Excel ปุ่มเดียว · นำเข้าซ้ำย้ายสาขาได้โดยไม่แตะรหัสผ่าน · ล็อกอินตัวใหญ่ปนได้
#   · ติดตามเครื่องเสีย · รายงาน · ผังผู้รับผิดชอบ เหลือเฉพาะ Area (เจ้าของงานขอ ต.ค. 69): Supervisor (COCO) 403 ข้อความไทยทุก endpoint
#     · Area ยัง 200 · Supervisor (COCO) ยัง 200 ทุก endpoint ที่หน้าใบงาน/ฟอร์มเปิดใบงาน/แผนงานใช้
cd "$(dirname "$0")/.."
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"${2:-test1234}\"}" | J 'd.token'; }
A=$(login A001); T=$(login T001)
H() { echo "Authorization: Bearer $1"; }
DB() { psql "${DATABASE_URL%%\?*}" -Atc "$1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
CODE() { curl -s -o /dev/null -w "%{http_code}" -X "${3:-GET}" "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' ${4:+-d "$4"}; }
# วันนัดย้อนหลังไม่ได้แล้ว — ใช้วันข้างหน้าเสมอ ไม่ใช่วันตายตัวที่วันหนึ่งจะกลายเป็นอดีต
# (ที่นี่เซิร์ฟเวอร์ทิ้งวันนัดที่ Area Team ส่งมา — ให้เป็นวันข้างหน้าเพื่อให้ทดสอบเรื่อง "ไม่บันทึก" ไม่ใช่ "วันย้อนหลัง")
day() { node -e "console.log(new Date(Date.now()+7*3600e3+$1*86400e3).toISOString().slice(0,10))"; }
VISIT=$(day 33)

LOGINS="'zz.area','zz.sup1','zz.sup2'"
cleanup() {
  # ใบที่แอดมินเปิดไว้เทียบขอบเขต (สาขาคนอื่น · แฟรนไชส์) — ไม่ได้สร้างโดยบัญชีทดสอบ ต้องลบเอง ไม่งั้นค้างสะสม
  for w in ${W6:-} ${WD:-}; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$w" -H "$(H $A)"; done
  DB "delete from \"WorkOrder\" where \"createdById\" in (select id from \"User\" where \"employeeCode\" in ($LOGINS))" >/dev/null
  DB "update \"Branch\" set \"cocoSupervisorId\"=null where \"cocoSupervisorId\" in (select id from \"User\" where \"employeeCode\" in ($LOGINS))" >/dev/null
  DB "update \"User\" set \"areaId\"=null where \"employeeCode\" in ($LOGINS)" >/dev/null
  DB "delete from \"User\" where \"employeeCode\" in ($LOGINS)" >/dev/null
}
cleanup
trap 'cleanup; rm -f "$X" "$X2"' EXIT

# ไฟล์แบบเดียวกับ Area_Team.xlsx (ชื่อคอลัมน์เดียวกัน · Mail สองคอลัมน์) — คนสมมติ ไม่ใช่ข้อมูลจริง
mk() { NODE_PATH=backend/node_modules node -e '
  const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("Area Team");
  ws.addRow(["ERP ","Project Name","Region","Provinc","Name-Surname (Thai)","Name-Surname (Eng)","Nickname","Tel","Mail","Area","Mail"]);
  const A=["นางสาวทดสอบ พื้นที่ (เอ)","zz.area@example.com"];
  for (const r of JSON.parse(process.argv[2])) ws.addRow([r[0],"สาขา","กรุงเทพ","กรุงเทพ",r[1],"Test",r[2],"081-111-2222",r[3],...A]);
  wb.xlsx.writeFile(process.argv[1]);' "$1" "$2"; }
X=$(mktemp --suffix=.xlsx); X2=$(mktemp --suffix=.xlsx)
mk "$X" '[["C0001","นายหนึ่ง ทดสอบ","หนึ่ง","zz.sup1@example.com"],["C0006","นายสอง ทดสอบ","สอง","zz.sup2@example.com"],["C9999","นายสอง ทดสอบ","สอง","zz.sup2@example.com"],["CNX","นางสาวทดสอบ พื้นที่","เอ","zz.area@example.com"]]'
IMP() { curl -s -X POST localhost:4000/api/user-import/area-team -H "$(H $1)" -F "file=@$2" ${3:+-F apply=1} ${4:+-F resetPending=1}; }

echo "═══ นำเข้าไฟล์ Area Team"
P=$(IMP $A "$X")
[ "$(echo "$P" | J '[d.summary.areas,d.summary.supervisors,d.summary.create,d.summary.missingBranches.join()].join("|")')" = "1|2|3|C9999" ] \
  && pass "ตัวอย่าง: Area 1 · Supervisor 2 · สร้าง 3 บัญชี · สาขา C9999 ไม่มีในระบบ" || fail "ตัวอย่าง: $(echo "$P" | head -c 300)"
[ "$(DB "select count(*) from \"User\" where \"employeeCode\" in ($LOGINS)")" = "0" ] && pass "ดูตัวอย่างไม่สร้างบัญชี" || fail "ดูตัวอย่างแล้วมีบัญชี"
[ "$(CODE $T user-import/area-team POST)" = "403" ] && pass "ช่างนำเข้าไม่ได้" || fail "ช่างนำเข้าได้"

R=$(IMP $A "$X" 1)
echo "$R" | J '"  สร้าง "+d.created+" · รหัส "+d.passwordsIssued+" · ผูกสาขา "+d.branchesLinked'
ROWS=$(DB "select u.\"employeeCode\"||':'||u.role||':'||u.\"mustChangePassword\"||':'||coalesce(a.\"employeeCode\",'-') from \"User\" u left join \"User\" a on a.id=u.\"areaId\" where u.\"employeeCode\" in ($LOGINS) order by 1" | tr '\n' ' ')
[ "$ROWS" = "zz.area:AREA:true:- zz.sup1:COCO_SUPERVISOR:true:zz.area zz.sup2:COCO_SUPERVISOR:true:zz.area " ] \
  && pass "ฐานข้อมูล: บัญชี 3 ตำแหน่งถูก · ต้องเปลี่ยนรหัส · Supervisor อยู่ใต้ Area" || fail "บัญชี: $ROWS"
[ "$(DB "select string_agg(b.code||'='||u.\"employeeCode\", ' ' order by b.code) from \"Branch\" b join \"User\" u on u.id=b.\"cocoSupervisorId\" where u.\"employeeCode\" in ($LOGINS)")" = "C0001=zz.sup1 C0006=zz.sup2 CNX=zz.area" ] \
  && pass "ฐานข้อมูล: สาขาผูกกับ Supervisor ที่ดูแล · สาขาที่ Area ดูแลเองผูกกับ Area (ไม่สร้างบัญชีซ้ำ)" || fail "สาขา: $(DB "select code, \"cocoSupervisorId\" from \"Branch\" where \"cocoSupervisorId\" is not null")"
[ "$(DB "select count(distinct \"passwordHash\") from \"User\" where \"employeeCode\" in ($LOGINS)")" = "3" ] && pass "รหัสผ่านสุ่มแยกคน (ไม่ใช่รหัสเดียวทั้งไฟล์)" || fail "รหัสซ้ำกัน"

# รหัสจากไฟล์ Excel ที่ระบบให้ดาวน์โหลดครั้งเดียว
CRED=$(mktemp --suffix=.xlsx); curl -s "localhost:4000$(echo "$R" | J 'd.credentials.path')" -o "$CRED"
pw() { NODE_PATH=backend/node_modules node -e 'const E=require("exceljs");const w=new E.Workbook();w.xlsx.readFile(process.argv[1]).then(()=>{w.worksheets[0].eachRow(r=>{if(r.getCell(1).text===process.argv[2])console.log(r.getCell(2).text)})})' "$CRED" "$1"; }
P_AREA=$(pw zz.area); P_S1=$(pw zz.sup1); P_S2=$(pw zz.sup2); rm -f "$CRED"
[ ${#P_S1} -eq 8 ] && pass "ไฟล์รหัสผ่านมีรหัสของทุกคน" || fail "ไม่มีรหัสในไฟล์ ($P_S1)"

echo
echo "═══ เข้าระบบครั้งแรก"
L=$(login Zz.Sup1 "$P_S1")
[ -n "$L" ] && [ "$L" != "undefined" ] && pass "ล็อกอินตัวใหญ่ปน (Zz.Sup1) ได้" || fail "ล็อกอินตัวใหญ่ปนไม่ได้"
[ "$(CODE $L work-orders)" = "423" ] && pass "ยังไม่เปลี่ยนรหัส = ใช้งานไม่ได้ (423)" || fail "ใช้งานได้ทั้งที่ยังไม่เปลี่ยนรหัส"
chpw() { curl -s -X POST localhost:4000/api/auth/change-password -H "$(H $1)" -H 'Content-Type: application/json' -d "{\"currentPassword\":\"$2\",\"newPassword\":\"newpass99\"}" | J 'd.token'; }
S1=$(chpw $L "$P_S1"); S2=$(chpw $(login zz.sup2 "$P_S2") "$P_S2"); AR=$(chpw $(login zz.area "$P_AREA") "$P_AREA")
[ "$(CODE $S1 work-orders)" = "200" ] && pass "เปลี่ยนรหัสแล้วใช้งานได้" || fail "เปลี่ยนรหัสแล้วยังใช้ไม่ได้"

echo
echo "═══ เปิดใบงาน — ต้องกรอกครบ"
NEW() { curl -s -X POST localhost:4000/api/work-orders -H "$(H $1)" -H 'Content-Type: application/json' -d "$2"; }
R=$(NEW $S1 '{"branchCode":"C0001","jobType":"CM","machines":[{"code":"","symptom":"สั้น"}]}')
echo "$R" | J 'const m=d.missing||[]; m.includes("เครื่อง")&&m.some(x=>x.startsWith("อาการ"))&&m.includes("ผู้ติดต่อที่สาขา")&&m.some(x=>x.startsWith("เบอร์"))?"ok":"bad"' | grep -q ok \
  && pass "ขาดเครื่อง/อาการ/ผู้ติดต่อ/เบอร์ → บอกครบทุกช่องที่ขาด" || fail "ช่องที่ขาด: $R"
R=$(NEW $S1 '{"branchCode":"C0006","jobType":"CM","contactName":"คุณทดสอบ","contactPhone":"081-111-2222","machines":[{"code":"W1","symptom":"เครื่องไม่ปั่นเลยครับ"}]}')
echo "$R" | grep -q "ไม่อยู่ในความดูแล" && pass "Supervisor เปิดใบสาขาคนอื่นไม่ได้" || fail "เปิดสาขาคนอื่นได้: $(echo $R | head -c 120)"
R=$(NEW $S1 "{\"branchCode\":\"C0001\",\"jobType\":\"CM\",\"contactName\":\"คุณทดสอบ\",\"contactPhone\":\"081-111-2222\",\"assignedToId\":1,\"scheduledAt\":\"$VISIT\",\"machines\":[{\"code\":\"W1\",\"symptom\":\"เครื่องไม่ปั่นเลยครับ\"}]}")
W1=$(echo "$R" | J 'd.id')
[ "$(DB "select status||'|'||coalesce(\"assignedToId\"::text,'-')||'|'||coalesce(\"scheduledAt\"::text,'-') from \"WorkOrder\" where id=$W1")" = "NEW|-|-" ] \
  && pass "กรอกครบเปิดได้ · จ่ายช่าง/นัดวันที่ส่งมาไม่ถูกบันทึก (ฐานข้อมูล)" || fail "ใบงาน: $(DB "select status, \"assignedToId\", \"scheduledAt\" from \"WorkOrder\" where id=$W1")"
R=$(NEW $S1 '{"branchCode":"C0001","jobType":"COIN_CHANGER","contactName":"คุณทดสอบ","contactPhone":"0811112222","machines":[{"symptom":"แลกแล้วเหรียญไม่ออกเลย"}]}')
WE=$(echo "$R" | J 'd.id'); [ "$WE" -gt 0 ] 2>/dev/null && pass "ตู้แลกเหรียญไม่บังคับช่องเครื่อง" || fail "ตู้แลกเหรียญ: $R"
W6=$(NEW $A '{"branchCode":"C0006","jobType":"CM","machines":[{"code":"W2","symptom":"ทดสอบ area team"}]}' | J 'd.id')
WD=$(NEW $A '{"branchCode":"D0011","jobType":"CM","machines":[{"code":"W2","symptom":"ทดสอบ area team"}]}' | J 'd.id')

echo
echo "═══ เห็นแค่ไหน"
ids() { GET $1 "work-orders?status=ALL" | J 'd.rows.map(r=>r.id).join(" ")'; }
has() { echo " $1 " | grep -q " $2 "; }
I1=$(ids $S1); IA=$(ids $AR)
has "$I1" $W1 && ! has "$I1" $W6 && ! has "$I1" $WD && pass "Supervisor เห็นเฉพาะใบของสาขาตัวเอง" || fail "Supervisor เห็น: $I1"
has "$IA" $W1 && has "$IA" $W6 && ! has "$IA" $WD && pass "Area เห็นสาขา COCO ทุกสาขา · ไม่เห็นสาขาแฟรนไชส์" || fail "Area เห็น: $IA"
[ "$(CODE $S1 work-orders/$W6)" = "403" ] && [ "$(CODE $AR work-orders/$WD)" = "403" ] && [ "$(CODE $S1 work-orders/$W1)" = "200" ] \
  && pass "เปิดด้วยเลขใบงานนอกขอบเขตไม่ได้ (403)" || fail "เปิดตรงด้วยเลขใบงาน"
[ "$(GET $S1 'branches?search=C' | J 'd.map(b=>b.code).join()')" = "C0001" ] && pass "ค้นหาสาขาเจอเฉพาะสาขาตัวเอง" || fail "ค้นสาขา: $(GET $S1 'branches?search=C' | J 'd.map(b=>b.code).join()')"
[ "$(CODE $S1 branches/C0006/machines)" = "403" ] && [ "$(CODE $S1 branches/C0001/machines)" = "200" ] && pass "เครื่องของสาขาคนอื่นดูไม่ได้" || fail "เครื่องสาขาคนอื่น"
N=$(GET $S1 work-orders/inbox-count | J 'd.inbox'); E=$(DB "select count(*) from \"WorkOrder\" w join \"Branch\" b on b.id=w.\"branchId\" where (b.\"cocoSupervisorId\"=(select id from \"User\" where \"employeeCode\"='zz.sup1') or w.\"createdById\"=(select id from \"User\" where \"employeeCode\"='zz.sup1')) and b.code like 'C%' and w.status not in ('DONE','CANCELLED')")
[ "$N" = "$E" ] && [ "$N" -ge 2 ] && pass "กล่องงานของฉัน = ใบที่ยังไม่ปิดของสาขาตัวเอง ($N ใบ)" || fail "กล่องงาน $N · ฐานข้อมูล $E"
# ปุ่ม "มีอัปเดต" ถามว่าใบไปอยู่แท็บไหน — ตอบเฉพาะใบในขอบเขต (W6 สาขาคนอื่น · WD แฟรนไชส์ ไม่อยู่ในคำตอบ)
[ "$(GET $S1 "work-orders/locate?ids=$W1,$W6,$WD" | J 'd.rows.map(r=>r.id+":"+r.tab).join()')" = "$W1:INBOX" ] \
  && pass "หาแท็บของใบงาน: ตอบเฉพาะใบของสาขาตัวเอง (ใบใหม่อยู่กล่องงาน)" || fail "locate: $(GET $S1 "work-orders/locate?ids=$W1,$W6,$WD")"
[ "$(GET $AR 'machines/overview' | J 'typeof d.machineOff')" = "number" ] && pass "Area: ติดตามเครื่องเสียเปิดได้" || fail "Area: ติดตามเครื่องเสีย"
[ "$(GET $AR 'teams/coverage-map' | J 'd.canEdit===false&&Array.isArray(d.regions)?"ok":"bad"')" = "ok" ] && pass "Area: ผังผู้รับผิดชอบเปิดได้ แก้ผังฝ่ายบริการไม่ได้" || fail "Area: ผังผู้รับผิดชอบ"
[ "$(CODE $S1 'plans/day?date=2026-10-27')" = "200" ] && pass "แผนงานดูได้" || fail "แผนงาน"

echo
echo "═══ ทำได้แค่แจ้งและเปิด"
[ "$(CODE $S1 work-orders/$W1/assign POST '{"team":"กรุงเทพ"}')" = "403" ] && pass "จ่ายงานไม่ได้" || fail "จ่ายงานได้"
[ "$(CODE $AR work-orders/$W1 PATCH '{"priority":"URGENT"}')" = "403" ] && pass "แก้ใบงานไม่ได้" || fail "แก้ใบงานได้"
[ "$(CODE $AR work-orders/$W1/cancel POST '{"reason":"x"}')" = "403" ] && pass "ยกเลิกใบงานไม่ได้" || fail "ยกเลิกได้"
OK=1; for p in vehicles auth/users spare-parts work-orders/reports/by-opener branches/manage teams; do c=$(CODE $AR $p); [ "$c" = "403" ] || { OK=; echo "    $p → $c"; }; done
[ -n "$OK" ] && pass "หน้าอื่นนอก 6 เมนู (รถ ผู้ใช้ อะไหล่ รายงานอื่น) ตอบ 403" || fail "API นอกเมนูเปิดได้"
PNG=$(mktemp --suffix=.png); printf '\x89PNG\r\n\x1a\n' > "$PNG"
[ "$(curl -s -o /dev/null -w "%{http_code}" -X POST localhost:4000/api/work-orders/$W6/attachments -H "$(H $AR)" -F "file=@$PNG;type=image/png")" = "403" ] \
  && pass "แนบรูปในใบที่คนอื่นเปิดไม่ได้" || fail "แนบรูปใบคนอื่นได้"
rm -f "$PNG"

echo
echo "═══ ติดตามเครื่องเสีย · รายงาน · ผังผู้รับผิดชอบ — เฉพาะ Area (เจ้าของงานขอ ต.ค. 69)"
# ทีม Area ลองใช้แล้วเห็นว่าสามเมนูนี้ไม่จำเป็นกับซุปและแม่บ้าน — ปิดที่เซิร์ฟเวอร์ด้วย ไม่ใช่แค่ซ่อนเมนู (ยิงตรงต้องได้ 403)
ERR() { curl -s -X "${3:-GET}" "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' ${4:+-d "$4"} | J 'd.error'; }
AREA_ONLY="machines/outages machines/signal-lost machines/overview machines/work-statuses work-orders/reports/area-team?from=2026-01-01&to=2026-12-31 teams/coverage-map teams/area-map"
OK=1; for p in $AREA_ONLY; do r="$(CODE $S1 "$p")|$(ERR $S1 "$p")"; [ "$r" = "403|เมนูนี้สำหรับตำแหน่ง Area เท่านั้น" ] || { OK=; echo "    $p → $r"; }; done
[ -n "$OK" ] && pass "Supervisor (COCO): ติดตามเครื่องเสีย 4 · รายงาน · ผังผู้รับผิดชอบ 2 → 403 \"เมนูนี้สำหรับตำแหน่ง Area เท่านั้น\" ทุกตัว" || fail "Supervisor (COCO) ยังเรียกเมนูของ Area ได้"
R="$(CODE $S1 teams/area-map POST '{}')|$(ERR $S1 teams/area-map POST '{}')"
[ "$R" = "403|เมนูนี้สำหรับตำแหน่ง Area เท่านั้น" ] && pass "Supervisor (COCO): บันทึกผังฝั่ง Area → 403 ข้อความเดียวกัน" || fail "Supervisor (COCO) บันทึกผัง: $R"
OK=1; for p in $AREA_ONLY; do c=$(CODE $AR "$p"); [ "$c" = "200" ] || { OK=; echo "    $p → $c"; }; done
[ -n "$OK" ] && pass "Area: สามเมนูยังเปิดได้ทุก endpoint (200)" || fail "Area เปิดเมนูของตัวเองไม่ได้"
[ "$(CODE $AR teams/area-map POST '{}')" = "400" ] && pass "Area: บันทึกผังฝั่ง Area ผ่านด่านไปถึง route (400 ไม่มีการเปลี่ยนแปลง ไม่ใช่ 403)" || fail "Area บันทึกผัง: $(CODE $AR teams/area-map POST '{}')"
TODAY=$(day 0)
KEEP="auth/me work-orders work-orders/version work-orders/inbox-count work-orders/options work-orders/locate?ids=$W1 work-orders/$W1 work-orders/$W1/version work-orders/$W1/attachments work-orders/$W1/attachments/links branches?search=C branches/C0001/machines branches/C0001/open-work-orders branches/C0001/last-contact plans/day?date=$TODAY plans/month?month=${TODAY:0:7} plans/pending"
OK=1; for p in $KEEP; do c=$(CODE $S1 "$p"); [ "$c" = "200" ] || { OK=; echo "    $p → $c"; }; done
[ -n "$OK" ] && pass "Supervisor (COCO): endpoint ที่ใบงาน/กล่องงาน/ฟอร์มเปิดใบงาน/แผนงานใช้ ยัง 200 ทุกตัว (17 ตัว)" || fail "Supervisor (COCO) เสีย endpoint ที่ยังต้องใช้"

echo
echo "═══ รายงาน Excel ปุ่มเดียว (Area)"
R=$(GET $AR "work-orders/reports/area-team?from=2026-01-01&to=2026-12-31")
XR=$(mktemp --suffix=.xlsx); curl -s "localhost:4000$(echo "$R" | J 'd.path')" -o "$XR"
CODES=$(NODE_PATH=backend/node_modules node -e 'const E=require("exceljs");const w=new E.Workbook();w.xlsx.readFile(process.argv[1]).then(()=>{const s=w.worksheets[0];const o=[];s.eachRow((r,i)=>{if(i>4)o.push(r.getCell(1).text)});console.log(o.join(" "))})' "$XR"); rm -f "$XR"
C1=$(DB "select code from \"WorkOrder\" where id=$W1"); C6=$(DB "select code from \"WorkOrder\" where id=$W6"); CD=$(DB "select code from \"WorkOrder\" where id=$WD")
has "$CODES" $C1 && has "$CODES" $C6 && ! has "$CODES" $CD && pass "รายงานของ Area มีใบ COCO ไม่มีใบแฟรนไชส์" || fail "รายงาน: $CODES"
[ "$(CODE $A 'work-orders/reports/area-team?from=2026-01-01&to=2026-12-31')" = "403" ] && pass "รายงานนี้เฉพาะ Area Team" || fail "ตำแหน่งอื่นออกรายงานนี้ได้"

echo
echo "═══ นำเข้าซ้ำ — ย้ายสาขา ไม่แตะรหัสผ่าน"
mk "$X2" '[["C0001","นายสอง ทดสอบ","สอง","zz.sup2@example.com"],["C0006","นายสอง ทดสอบ","สอง","zz.sup2@example.com"]]'
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='zz.sup2'")
R=$(IMP $A "$X2" 1)
[ "$(DB "select string_agg(b.code||'='||u.\"employeeCode\", ' ' order by b.code) from \"Branch\" b join \"User\" u on u.id=b.\"cocoSupervisorId\" where u.\"employeeCode\" in ($LOGINS)")" = "C0001=zz.sup2 C0006=zz.sup2" ] \
  && pass "สาขา C0001 ย้ายไปอยู่กับ Supervisor คนใหม่ (ฐานข้อมูล)" || fail "ย้ายสาขา: $(DB "select code, \"cocoSupervisorId\" from \"Branch\" where \"cocoSupervisorId\" is not null")"
[ "$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='zz.sup2'")" = "$HASH" ] && [ "$(echo "$R" | J 'd.passwordsIssued')" = "0" ] \
  && pass "คนที่มีบัญชีแล้วไม่ถูกเปลี่ยนรหัส" || fail "รหัสถูกเปลี่ยน"
has "$(ids $S1)" $W1 && pass "Supervisor คนเดิมยังเห็นใบที่ตัวเองเปิด แม้สาขาย้ายไปแล้ว" || fail "ใบที่ตัวเองเปิดหาย"
has "$(ids $S1)" $W6 && fail "ยังเห็นใบสาขาที่ย้ายออก" || pass "สาขาที่ย้ายออกไม่เห็นแล้ว"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
