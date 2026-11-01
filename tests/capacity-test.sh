#!/bin/bash
# ทดสอบ: ขนาดเครื่องเก็บที่ตัวเครื่อง + ผู้ติดต่อตอนเปิดจากกระดาน
set -e
SP="$(dirname "$0")"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
A=$(login A001); S=$(login S001)
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAtc "$1"; }
# เก็บกวาด — ลบใบที่เทสต์สร้าง + เคสเครื่องดับ/เครื่องที่สร้างเอง ไม่ให้ค้างสะสมในสาขาทดสอบ (CLAUDE.md)
# trap ไม่ใช่บรรทัดท้ายไฟล์ — set -e หยุดกลางทางแล้วเคสที่สร้างเองจะค้างบนกระดานของชุดอื่น
cleanup() {
  for i in ${ID:-} ${ID1B:-} ${ID2:-} ${IDOUT:-}; do curl -s -o /dev/null -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)"; done
  if [ -n "${OID:-}" ]; then
    DB "delete from \"WorkOrder\" where \"outageId\"=$OID" >/dev/null 2>&1 || :
    DB "delete from \"Outage\" where id=$OID" >/dev/null 2>&1 || :
  fi
  if [ -n "${OMID:-}" ]; then DB "delete from \"Machine\" where id=$OMID" >/dev/null 2>&1 || :; fi
}
trap cleanup EXIT

echo "═══ ตัวเลือกขนาดมาจากเซิร์ฟเวอร์"
OPT=$(curl -s localhost:4000/api/work-orders/options -H "$(H $A)")
echo "$OPT" | J '"  ขนาด: "+d.machineCapacities.join(", ")+" · รับได้ "+d.machineCapacityRange.min+"-"+d.machineCapacityRange.max+" kg"'
echo "$OPT" | J 'd.machineCapacities.includes(10)&&d.machineCapacities.includes(13)?"ok":"bad"' | grep -q ok \
  && pass "มี 10 กับ 13 ตามที่สั่ง" || fail "ไม่มีขนาดที่สั่งไว้"
echo "$OPT" | J 'd.machineCapacities.includes(9)&&d.machineCapacities.includes(14)?"ok":"bad"' | grep -q ok \
  && pass "มี 9 กับ 14 kg (เพิ่ม ต.ค. 69)" || fail "ไม่มี 9/14 kg"
echo "$OPT" | J 'JSON.stringify(d.machineModels||d.models||[]).includes("Huebsch (TC)")?"ok":"bad"' | grep -q ok \
  && pass "มีรุ่น Huebsch (TC)" || fail "ไม่มี Huebsch (TC): $(echo "$OPT" | head -c 0)"

echo
echo "═══ ประเภทงานอุปกรณ์ร้าน (ตามฟอร์มแจ้งซ่อม COCO · ต.ค. 69)"
echo "$OPT" | J '["COIN_CHANGER","WATER_PUMP","DETERGENT","HOT_AIR_DUCT","WATER_HEATER","OTHER"].every(v=>d.jobTypes.some(t=>t.value===v))&&d.jobTypes.find(t=>t.value==="COIN_CHANGER").label==="ตู้แลกเหรียญ"?"ok":"bad"' | grep -q ok \
  && pass "ตัวเลือกมีตู้แลกเหรียญ ปั๊มน้ำ ตู้ขายน้ำยา ท่อลมร้อน เครื่องทำน้ำร้อน และยังมีอื่นๆ" || fail "ตัวเลือกประเภทงานไม่ครบ"
EQ=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"COIN_CHANGER","priority":"NORMAL","machines":[{"model":null,"capacityKg":null,"symptom":"แลก 100 ออก 3 เหรียญ"}]}')
EQID=$(echo "$EQ" | J 'd.orders?d.orders[0].id:d.id')
ROW=$(psql "${DATABASE_URL%%\?*}" -Atc "select \"jobType\"||'|'||title||'|'||coalesce(\"machineId\"::text,'-')||'|'||coalesce(symptom,'') from \"WorkOrder\" where id=$EQID" 2>/dev/null)
[ "$ROW" = "COIN_CHANGER|ตู้แลกเหรียญ|-|แลก 100 ออก 3 เหรียญ" ] \
  && pass "เปิดใบตู้แลกเหรียญโดยไม่มีเครื่อง: หัวข้อตั้งให้เอง ไม่ผูกเครื่อง (ฐานข้อมูล)" || fail "ใบอุปกรณ์ร้าน: $ROW"
curl -s -X DELETE "localhost:4000/api/work-orders/$EQID" -H "$(H $A)" >/dev/null

echo
echo "═══ เปิดใบงานพร้อมขนาด"
WO=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","contactName":"คุณสมหญิง","contactPhone":"0812345678","machines":[{"code":"W41","model":"Huebsch","capacityKg":13,"symptom":"น้ำไม่เข้า"},{"code":"D41","model":"Haier","capacityKg":25,"symptom":"ไม่ร้อน"}]}')
ID=$(echo "$WO" | J 'd.orders[0].id')
# สองเครื่อง = สองใบ — เก็บใบที่สองไว้ลบตอนจบด้วย
ID1B=$(echo "$WO" | J 'd.orders[1]?d.orders[1].id:""')
echo "$WO" | J 'd.orders.map(o=>o.code).join(" ")' | sed 's/^/  เปิดได้: /'
R=$(curl -s "localhost:4000/api/work-orders/$ID" -H "$(H $A)")
echo "$R" | J '"  "+d.machineCode+" · "+d.machineModel+" · "+d.machineCapacityLabel'
echo "$R" | J 'd.machineCapacityKg===13&&d.machineCapacityLabel==="13 kg"?"ok":"bad"' | grep -q ok \
  && pass "ขนาดถูกบันทึกและส่งกลับพร้อมหน่วย" || fail "ขนาดไม่ตรง"

echo
echo "═══ ขนาดเก็บที่ตัวเครื่อง ใบถัดไปไม่ต้องกรอกซ้ำ"
M=$(curl -s "localhost:4000/api/branches/C0006/machines" -H "$(H $A)")
echo "$M" | J 'const m=d.find(x=>x.code==="W41"); "  W41 → รุ่น "+m.model+" ขนาด "+m.capacityKg+" kg"'
echo "$M" | J 'd.find(x=>x.code==="W41").capacityKg===13?"ok":"bad"' | grep -q ok \
  && pass "สาขาตอบขนาดของเครื่องกลับมาให้เติมในฟอร์ม" || fail "สาขาไม่ตอบขนาด"
WO2=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W41","symptom":"อีกรอบ"}]}')
ID2=$(echo "$WO2" | J 'd.orders[0].id')
curl -s "localhost:4000/api/work-orders/$ID2" -H "$(H $A)" | J 'd.machineCapacityLabel==="13 kg"?"ok":"bad"' | grep -q ok \
  && pass "ไม่ส่งขนาดมาก็ไม่ล้างของเดิม" || fail "ของเดิมถูกล้างทิ้ง"

echo
echo "═══ ขนาดนอกขอบเขตต้องถูกปฏิเสธ"
R=$(curl -s -X POST localhost:4000/api/work-orders -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"branchCode":"C0006","jobType":"CM","priority":"NORMAL","machines":[{"code":"W42","capacityKg":500,"symptom":"พิมพ์พลาด"}]}')
echo "$R" | grep -q "error" && pass "500 kg ถูกปฏิเสธ" || fail "รับ 500 kg: $R"

echo
echo "═══ เปิดจากกระดาน — ผู้ติดต่อต้องไม่หาย (ของเดิมหายเงียบ)"
# เคสของเทสต์เอง บนเครื่องรหัสใหม่ที่ยังไม่รู้ยี่ห้อและไม่มีอะไหล่ที่รอ — ไม่หยิบเคสที่ค้างอยู่ในฐาน
# เคสจริงจากรายงานเครื่องมักรู้ยี่ห้อแล้ว (ยี่ห้อที่รู้แล้วไม่ถูกทับ — รุ่นที่ส่งมาไม่ถูกเขียน) หรือมีอะไหล่ที่รอที่ต้องผ่านล็อกยี่ห้อ
# ผลจึงขึ้นกับว่าวันนั้นฐานมีเคสอะไร (เดิมข้ามเงียบ ๆ เมื่อไม่มีเคส และพังเมื่อเคสแรกเป็นเครื่องที่รู้ยี่ห้อ)
BID=$(DB "select id from \"Branch\" where code='C0006'")
while :; do OMC="W$((9000 + RANDOM % 999))"; [ "$(DB "select count(*) from \"Machine\" where \"branchId\"=$BID and code='$OMC'")" = "0" ] && break; done
# สร้างไม่ได้ = FAIL ไม่ใช่จบเงียบ ๆ (set -e ตัดสคริปต์แล้ว run-all นับเฉพาะบรรทัดที่ผ่านไปแล้ว)
OMID=$(DB "insert into \"Machine\"(\"branchId\",code,type,\"updatedAt\") values ($BID,'$OMC','WASHER',now()) returning id") || OMID=""
[ -n "$OMID" ] && OID=$(DB "insert into \"Outage\"(kind,\"branchId\",\"machineId\",\"startedAt\",\"lastSeenAt\") values ('MACHINE_OFF',$BID,$OMID,now()-interval '2 hours',now()) returning id") || OID=""
[ -n "$OID" ] || { fail "สร้างเคสเครื่องดับทดสอบไม่ได้ (ต่อฐานข้อมูลในเครื่องไม่ได้?)"; exit 1; }
echo "  เคส $OID เครื่อง $OMC (ยังไม่รู้ยี่ห้อ ไม่มีอะไหล่ที่รอ)"
R=$(curl -s -X POST "localhost:4000/api/work-orders/from-outage/$OID" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d '{"jobType":"CM","priority":"NORMAL","contactName":"คุณมานพ","contactPhone":"0899999999","model":"Oasis","capacityKg":18,"symptom":"ดับทั้งเครื่อง"}')
IDOUT=$(echo "$R" | J 'd.id??""')
echo "$R" | J '"  "+d.code+" · ผู้ติดต่อ "+(d.contactName||"(ว่าง)")+" "+(d.contactPhone||"")+" · ขนาด "+(d.machineCapacityLabel||"(ว่าง)")'
echo "$R" | J 'd.contactName==="คุณมานพ"&&d.contactPhone==="0899999999"?"ok":"bad"' | grep -q ok \
  && [ "$(DB "select \"contactName\" from \"WorkOrder\" where id=${IDOUT:-0}")" = "คุณมานพ" ] \
  && pass "ผู้ติดต่อถูกบันทึกตอนเปิดจากกระดาน (ฐานข้อมูล)" || fail "ผู้ติดต่อยังหาย: $(echo "$R" | head -c 200)"
echo "$R" | J 'd.machineCapacityLabel==="18 kg"&&d.machineModel==="Oasis"?"ok":"bad"' | grep -q ok \
  && [ "$(DB "select coalesce(model,'-')||'|'||coalesce(\"capacityKg\"::text,'-') from \"Machine\" where id=$OMID")" = "Oasis|18" ] \
  && pass "รุ่นกับขนาดถูกบันทึกที่เครื่องตอนเปิดจากกระดาน (เครื่องที่ยังไม่รู้ยี่ห้อ · ฐานข้อมูล)" || fail "รุ่น/ขนาดไม่ถูกบันทึก: $(DB "select model, \"capacityKg\" from \"Machine\" where id=$OMID")"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
