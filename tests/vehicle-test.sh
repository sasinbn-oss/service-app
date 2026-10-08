#!/bin/bash
# ทดสอบ: ลงทะเบียนใช้รถแบบ OTTERI FLEET — รูปรอบคัน 5 รูป · ไมล์ ±1,000 · คนละคันพร้อมกันไม่ได้ ·
#        คืนรถ + แจ้งซ่อมเข้าประวัติซ่อม · แอดมินคืนแทน/ภาพรวม/Excel · ทะเบียน & ซ่อมบำรุง
#
# ยืนยันผลที่ฐานข้อมูลด้วยทุกข้อ (CLAUDE.md) · ต้องมี mock-s3 รันอยู่ (tests/README.md)
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
photo() { curl -s -X POST localhost:4000/api/vehicle-logs/photos -H "$(H $1)" -F "file=@$SP/site-photo.png;type=image/png" -F "phase=$2" | J 'd.id'; }
photos() { local ids=""; for i in 1 2 3 4 5; do ids="$ids,$(photo $1 $2)"; done; echo "[${ids:1}]"; }

V1=$(POST $A vehicles '{"plateNumber":"ทดสอบ-111","brand":"Toyota","model":"Hilux","type":"กระบะ","currentMileage":45000}' | J 'd.id')
V2=$(POST $A vehicles '{"plateNumber":"ทดสอบ-222","brand":"Isuzu","model":"D-Max","type":"กระบะ","currentMileage":80000}' | J 'd.id')

echo "═══ เบิกรถ"
R=$(POST $T vehicle-logs/start "{\"vehicleId\":$V1,\"mileage\":45010,\"purpose\":\"เข้าซ่อมสาขา\",\"photoIds\":[]}")
echo "$R" | grep -q "อย่างน้อย 5 รูป" && pass "ไม่มีรูปเบิกไม่ได้" || fail "เบิกได้ทั้งที่ไม่มีรูป: $(echo $R|head -c 120)"
[ "$(DB "select status from \"Vehicle\" where id=$V1")" = "AVAILABLE" ] && pass "เบิกไม่ผ่าน รถยังว่างอยู่ (ไม่ค้างกลางทาง)" || fail "รถค้างสถานะ"
P=$(photos $T START)
R=$(POST $T vehicle-logs/start "{\"vehicleId\":$V1,\"mileage\":47000,\"purpose\":\"เข้าซ่อมสาขา\",\"photoIds\":$P}")
echo "$R" | grep -q "เกิน ±1,000" && pass "ไมล์ต่างจากล่าสุดเกิน 1,000 กม. ถูกปฏิเสธ" || fail "ไมล์เกินผ่าน: $(echo $R|head -c 120)"
R=$(POST $T vehicle-logs/start "{\"vehicleId\":$V1,\"mileage\":45010,\"purpose\":\"เข้าซ่อมสาขา\",\"destination\":\"C0001\",\"photoIds\":$P}")
LOG=$(echo "$R" | J 'd.id')
[ "$(DB "select v.status||'|'||v.\"currentMileage\"||'|'||l.\"mileageGap\"||'|'||(select count(*) from \"VehicleLogPhoto\" p where p.\"logId\"=l.id and p.phase='START') from \"VehicleLog\" l join \"Vehicle\" v on v.id=l.\"vehicleId\" where l.id=$LOG")" = "IN_USE|45010|10|5" ] \
  && pass "เบิกได้ — รถกำลังใช้งาน ไมล์ไม่ต่อเนื่อง +10 ถูกเก็บ และรูป 5 รูปผูกกับรายการ" || fail "เบิกไม่ถูก: $(echo $R|head -c 160)"
P2=$(photos $T START)
R=$(POST $T vehicle-logs/start "{\"vehicleId\":$V2,\"mileage\":80000,\"purpose\":\"ติดต่องาน\",\"photoIds\":$P2}")
echo "$R" | grep -q "ยังไม่ได้คืนรถ" && pass "ค้างรถอยู่ เบิกคันที่สองไม่ได้" || fail "เบิกซ้อนได้"
R=$(POST $S vehicle-logs/start "{\"vehicleId\":$V1,\"mileage\":45010,\"purpose\":\"ติดต่องาน\",\"photoIds\":$P2}")
echo "$R" | grep -q "ไม่ว่าง\|อย่างน้อย 5 รูป" && pass "รถที่มีคนใช้อยู่ คนอื่นเบิกไม่ได้ (และใช้รูปของคนอื่นไม่ได้)" || fail "เบิกรถที่ไม่ว่างได้: $(echo $R|head -c 120)"
curl -s "localhost:4000/api/vehicle-logs/status" -H "$(H $S)" | J "d.vehicles.find(v=>v.id===$V1).activeBy" | grep -q . \
  && pass "หน้าเลือกรถบอกว่าใครใช้อยู่" || fail "ไม่บอกคนใช้"

echo
echo "═══ คืนรถ"
R=$(POST $T "vehicle-logs/$LOG/end" "{\"mileage\":45000,\"photoIds\":[]}")
echo "$R" | grep -q "ต้องไม่น้อยกว่าตอนเบิก" && pass "ไมล์คืนน้อยกว่าตอนเบิกไม่ได้" || fail "ไมล์คืนผิดผ่าน: $(echo $R|head -c 120)"
PE=$(photos $T END)
R=$(POST $T "vehicle-logs/$LOG/end" "{\"mileage\":45140,\"cost\":600,\"repairNote\":\"ไฟเบรกหลังขวาไม่ติด\",\"photoIds\":$PE}")
[ "$(DB "select l.status||'|'||l.\"endMileage\"||'|'||l.cost||'|'||v.status||'|'||v.\"currentMileage\" from \"VehicleLog\" l join \"Vehicle\" v on v.id=l.\"vehicleId\" where l.id=$LOG")" = "COMPLETED|45140|600|AVAILABLE|45140" ] \
  && pass "คืนรถได้ — ระยะ ค่าใช้จ่าย และไมล์รถถูกบันทึก รถกลับเป็นว่าง" || fail "คืนไม่ถูก: $(echo $R|head -c 160)"
[ "$(DB "select count(*) from \"VehicleMaintenance\" where \"vehicleId\"=$V1 and type='REPORT' and \"vehicleLogId\"=$LOG")" = "1" ] \
  && DB "select \"maintNote\" from \"Vehicle\" where id=$V1" | grep -q "ไฟเบรก" \
  && pass "แจ้งซ่อมเข้าประวัติซ่อมบำรุงและบันทึกของรถทันที" || fail "แจ้งซ่อมไม่ไปถึงหน้าซ่อมบำรุง"
R=$(POST $T "vehicle-logs/$LOG/end" "{\"mileage\":45140,\"photoIds\":$PE}")
echo "$R" | grep -q "คืนรถไปแล้ว\|ไม่พบ" && pass "กดคืนซ้ำไม่ได้" || fail "คืนซ้ำได้"

echo
echo "═══ แอดมิน"
R=$(POST $T vehicle-logs/start "{\"vehicleId\":$V1,\"mileage\":45140,\"purpose\":\"ส่ง/รับอะไหล่\",\"photoIds\":$PE}")
echo "$R" | grep -q "อย่างน้อย 5 รูป" && pass "รูปที่ผูกกับรายการอื่นแล้ว เอามาใช้ซ้ำไม่ได้" || fail "ใช้รูปซ้ำได้: $(echo $R|head -c 120)"
P3=$(photos $T START)
LOG2=$(POST $T vehicle-logs/start "{\"vehicleId\":$V1,\"mileage\":45140,\"purpose\":\"ส่ง/รับอะไหล่\",\"photoIds\":$P3}" | J 'd.id')
R=$(POST $T "vehicle-logs/$LOG2/force-return" '{"mileage":45200}')
echo "$R" | grep -q "Admin\|สิทธิ์" && pass "ช่างคืนแทนคนอื่นไม่ได้ (เฉพาะแอดมิน)" || fail "ช่างใช้คืนแทนได้"
POST $A "vehicle-logs/$LOG2/force-return" '{"mileage":45200,"note":"ช่างลืมคืน"}' >/dev/null
[ "$(DB "select status||'|'||(\"returnedById\" is not null) from \"VehicleLog\" where id=$LOG2")" = "COMPLETED|true" ] \
  && [ "$(DB "select status from \"Vehicle\" where id=$V1")" = "AVAILABLE" ] && pass "แอดมินคืนแทนได้ และบันทึกว่าใครคืนแทน" || fail "คืนแทนไม่สำเร็จ"
TODAY=$(TZ=Asia/Bangkok date +%F)
curl -s "localhost:4000/api/vehicle-logs/dashboard?date=$TODAY" -H "$(H $A)" | J "const v=d.perVehicle.find(x=>x.id===$V1); v.km===190&&v.trips===2&&d.warnings.length>=1?'ok':JSON.stringify(v)" | grep -q ok \
  && pass "ภาพรวมรถนับ กม. วันนี้ (130+60) เที่ยว และไมล์ไม่ต่อเนื่อง" || fail "ภาพรวมรถไม่ตรง"
curl -s "localhost:4000/api/vehicle-logs/dashboard" -H "$(H $T)" | grep -q "Admin" && pass "ช่างเปิดภาพรวมรถไม่ได้" || fail "ช่างเปิดภาพรวมได้"
curl -s "localhost:4000/api/vehicle-logs" -H "$(H $S)" | J "d.some(l=>l.id===$LOG)?'bad':'ok'" | grep -q ok \
  && pass "คนอื่นเห็นแค่ประวัติของตัวเอง" || fail "เห็นประวัติของคนอื่น"
curl -s "localhost:4000/api/vehicle-logs/export?from=$TODAY&to=$TODAY" -H "$(H $A)" | J 'd.path&&d.count>=2?"ok":"bad"' | grep -q ok \
  && pass "ส่งออก Excel ได้" || fail "ส่งออกไม่ได้"

echo
echo "═══ ทะเบียน & ซ่อมบำรุง"
curl -s -X PUT "localhost:4000/api/vehicles/$V1" -H "$(H $A)" -H 'Content-Type: application/json' \
  -d "{\"taxExpire\":\"$(date -d '+10 days' +%F)\",\"lastOilKm\":35000,\"lastOilDate\":\"$TODAY\"}" >/dev/null
curl -s "localhost:4000/api/vehicles/fleet" -H "$(H $A)" | J "const v=d.vehicles.find(x=>x.id===$V1); v.tax.level==='soon'&&v.oil.level==='over'?'ok':JSON.stringify([v.tax,v.oil])" | grep -q ok \
  && pass "ภาษีใกล้หมด (≤30 วัน) และเกินรอบน้ำมันเครื่อง (ใช้ไป 10,200 กม.) ถูกคำนวณ" || fail "สถานะรอบซ่อมไม่ตรง"
curl -s -X POST "localhost:4000/api/vehicles/$V1/maintenance" -H "$(H $A)" -F type=OIL -F "date=$TODAY" -F mileage=45200 -F cost=1800 -F shop=ศูนย์ทดสอบ -F clearNote=true \
  -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
[ "$(DB "select \"lastOilKm\"||'|'||(\"maintNote\" is null) from \"Vehicle\" where id=$V1")" = "45200|true" ] \
  && pass "บันทึกเปลี่ยนน้ำมัน → เริ่มนับรอบใหม่ และล้างบันทึก/นัดหมาย" || fail "รอบน้ำมันไม่รีเซ็ต"
curl -s -X POST "localhost:4000/api/vehicles/$V1/docs" -H "$(H $A)" -F kind=BOOK -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
curl -s -X POST "localhost:4000/api/vehicles/$V1/docs" -H "$(H $A)" -F kind=BOOK -F "file=@$SP/site-photo.png;type=image/png" >/dev/null
[ "$(DB "select count(*) from \"VehicleDoc\" where \"vehicleId\"=$V1 and kind='BOOK'")" = "1" ] \
  && pass "อัปเอกสารซ้ำชนิดเดิม แทนที่ของเดิม (ไม่ซ้อน)" || fail "เอกสารซ้อน"
R=$(curl -s -X DELETE "localhost:4000/api/vehicles/$V1" -H "$(H $A)")
echo "$R" | grep -q "เลิกใช้งาน" && pass "รถที่มีประวัติแล้วลบไม่ได้ — ให้ตั้งเลิกใช้งานแทน" || fail "ลบรถที่มีประวัติได้"

echo
# เก็บกวาด — ลบรายการ รูป และรถทดสอบ
for L in $(DB "select id from \"VehicleLog\" where \"vehicleId\" in ($V1,$V2)"); do curl -s -X DELETE "localhost:4000/api/vehicle-logs/$L" -H "$(H $A)" >/dev/null; done
DB "delete from \"VehicleLogPhoto\" where \"logId\" is null and \"uploadedById\" in (select id from \"User\" where \"employeeCode\" in ('A001','S001','T001'))" >/dev/null
DB "delete from \"Vehicle\" where id in ($V1,$V2)" >/dev/null
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
