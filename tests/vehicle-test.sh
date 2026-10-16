#!/bin/bash
# ทดสอบ: ลงทะเบียนใช้รถแบบ OTTERI FLEET — รูปรอบคัน 5 รูป · ไมล์ ±1,000 · คนละคันพร้อมกันไม่ได้ ·
#        คืนรถ + แจ้งซ่อมเข้าประวัติซ่อม · แอดมินคืนแทน/ภาพรวม/Excel · ทะเบียน & ซ่อมบำรุง · ภาคของรถ
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
echo "$R" | grep -q "สำหรับแอดมิน\|สิทธิ์" && pass "ช่างคืนแทนคนอื่นไม่ได้ (เฉพาะแอดมิน)" || fail "ช่างใช้คืนแทนได้"
POST $A "vehicle-logs/$LOG2/force-return" '{"mileage":45200,"note":"ช่างลืมคืน"}' >/dev/null
[ "$(DB "select status||'|'||(\"returnedById\" is not null) from \"VehicleLog\" where id=$LOG2")" = "COMPLETED|true" ] \
  && [ "$(DB "select status from \"Vehicle\" where id=$V1")" = "AVAILABLE" ] && pass "แอดมินคืนแทนได้ และบันทึกว่าใครคืนแทน" || fail "คืนแทนไม่สำเร็จ"
TODAY=$(TZ=Asia/Bangkok date +%F)
curl -s "localhost:4000/api/vehicle-logs/dashboard?date=$TODAY" -H "$(H $A)" | J "const v=d.perVehicle.find(x=>x.id===$V1); v.km===190&&v.trips===2&&d.warnings.length>=1?'ok':JSON.stringify(v)" | grep -q ok \
  && pass "ภาพรวมรถนับ กม. วันนี้ (130+60) เที่ยว และไมล์ไม่ต่อเนื่อง" || fail "ภาพรวมรถไม่ตรง"
curl -s "localhost:4000/api/vehicle-logs/dashboard" -H "$(H $T)" | grep -q "สำหรับแอดมิน" && pass "ช่างเปิดภาพรวมรถไม่ได้" || fail "ช่างเปิดภาพรวมได้"
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
echo "═══ นำเข้ารถจาก Excel (ไฟล์แบบ \"รถช่าง Service\" — fleet-fixture.xlsx ข้อมูลสมมุติ)"
# รถเดิมทะเบียนเดียวกันแต่เขียนต่างแบบ — ต้องถูกแก้ ไม่ใช่สร้างซ้ำ
POST $A vehicles '{"plateNumber":"9ทส-1003","brand":"Toyota","currentMileage":12000}' >/dev/null
IMP() { curl -s -X POST localhost:4000/api/vehicles/import -H "$(H $1)" -F "file=@$SP/fleet-fixture.xlsx" ${2:+-F apply=true}; }
R=$(IMP $T)
echo "$R" | grep -q "หน้านี้สำหรับแอดมินเท่านั้น" && pass "ช่างนำเข้ารถไม่ได้" || fail "ช่างนำเข้าได้: $(echo $R|head -c 120)"
R=$(IMP $A)
[ "$(echo "$R" | J '[d.created,d.updated,d.same,d.skipped.length].join()')" = "2,1,0,2" ] && [ "$(DB "select count(*) from \"Vehicle\" where \"plateNumber\" like '9%ทส%'")" = "1" ] \
  && pass "ดูตัวอย่าง: เพิ่ม 2 · แก้ 1 (ทะเบียนเดิมเขียนต่างแบบ) · ข้าม 2 — ยังไม่บันทึก (ฐานข้อมูล)" || fail "ตัวอย่าง: $(echo "$R" | J '[d.created,d.updated,d.same,JSON.stringify(d.skipped)].join(" ")')"
echo "$R" | J 'd.skipped.map(s=>s.plateNumber+":"+s.reason).join("|")' | grep -q "9ทส 1004:ยังไม่มีผู้รับผิดชอบในไฟล์ (ยังไม่ใช่รถ service)|9ทส 1005:รถส่วนตัวหัวหน้าภาค" \
  && pass "ข้ามพร้อมเหตุผล: รถที่ไม่มีผู้รับผิดชอบ (เก็บหมายเหตุท้ายแถวมาบอก) · รถส่วนตัวหัวหน้าภาค" || fail "เหตุผลที่ข้าม: $(echo "$R" | J 'JSON.stringify(d.skipped)')"
IMP $A 1 >/dev/null
[ "$(DB "select \"plateNumber\"||'|'||brand||'|'||type||'|'||owner from \"Vehicle\" where \"plateNumber\"='9ทส 1001'")" = "9ทส 1001|Mitsubishi|รถบริษัท|กทม. ทีมทดสอบ1 · นายทดสอบ หนึ่ง (เอ)" ] \
  && pass "บันทึกแล้ว: ทะเบียน ยี่ห้อ (MITSU → Mitsubishi) ประเภท ผู้รับผิดชอบ (ฐานข้อมูล)" || fail "รถที่นำเข้า: $(DB "select \"plateNumber\"||'|'||coalesce(brand,'')||'|'||coalesce(type,'')||'|'||coalesce(owner,'') from \"Vehicle\" where \"plateNumber\" like '9ทส%1001'")"
VID=$(DB "select id from \"Vehicle\" where \"plateNumber\"='9ทส 1001'")
[ "$(DB "select \"fleetCardNo\"||'|'||\"fleetCardLimit\"||'|'||\"easyPassNo\" from \"VehicleCard\" where \"vehicleId\"=$VID")" = "0004 0000 0000 1111|7000|3700004444" ] \
  && ! DB "select coalesce(note,'') from \"Vehicle\"" | grep -q "0004 0000\|3700004444" \
  && pass "Fleet Card เต็มเลข + วงเงิน + Easy Pass อยู่ในตาราง VehicleCard ไม่ปนในหมายเหตุ (ฐานข้อมูล)" || fail "บัตร: $(DB "select * from \"VehicleCard\" where \"vehicleId\"=$VID")"
# เห็นเฉพาะแอดมิน — รายการรถที่ช่างเรียก (หน้าเบิกรถ) ต้องไม่มีเลขบัตร
curl -s localhost:4000/api/vehicles -H "$(H $T)" | grep -q "0004 0000\|3700004444\|fleetCard" && fail "ช่างเห็นเลขบัตรในรายการรถ" || pass "รายการรถของช่างไม่มีเลขบัตร"
curl -s localhost:4000/api/vehicle-logs/status -H "$(H $T)" | grep -q "0004 0000\|3700004444" && fail "ช่างเห็นเลขบัตรในฟอร์มเบิกรถ" || pass "ฟอร์มเบิกรถของช่างไม่มีเลขบัตร"
curl -s localhost:4000/api/vehicles/fleet -H "$(H $A)" | J 'd.vehicles.find(v=>v.id==='$VID').card.fleetCardNo' | grep -q "^0004 0000 0000 1111$" \
  && pass "แอดมินเห็น Fleet Card ในหน้าทะเบียน" || fail "แอดมินไม่เห็นบัตร"
POST $A vehicles '{"plateNumber":"9ทส 1009","fleetCardNo":"0004 9999","fleetCardLimit":3000}' >/dev/null
curl -s -X PUT "localhost:4000/api/vehicles/$VID" -H "$(H $A)" -H 'Content-Type: application/json' -d '{"fleetCardLimit":9000}' >/dev/null
[ "$(DB "select \"fleetCardLimit\"||'|'||\"fleetCardNo\" from \"VehicleCard\" where \"vehicleId\"=$VID")|$(DB "select \"fleetCardNo\" from \"VehicleCard\" c join \"Vehicle\" v on v.id=c.\"vehicleId\" where v.\"plateNumber\"='9ทส 1009'")" = "9000|0004 0000 0000 1111|0004 9999" ] \
  && pass "แอดมินแก้วงเงินบัตรได้ (เลขบัตรเดิมไม่หาย) · เพิ่มรถพร้อมบัตรได้" || fail "แก้บัตร: $(DB "select * from \"VehicleCard\" where \"vehicleId\"=$VID")"
DB "update \"VehicleCard\" set \"fleetCardLimit\"=7000 where \"vehicleId\"=$VID" >/dev/null
echo "$(DB "select note from \"Vehicle\" where \"plateNumber\"='9ทส 1002'")" | grep -q "เช็ครถที่: สาขาเช็คทดสอบ" \
  && pass "ช่องสาขาเช็ครถที่ผสานหลายแถว ใช้กับทุกคันในช่องนั้น" || fail "สาขาเช็ครถผสาน"
[ "$(DB "select count(*)||'|'||max(\"currentMileage\")||'|'||max(type) from \"Vehicle\" where replace(replace(\"plateNumber\",' ',''),'-','')='9ทส1003'")" = "1|12000|รถเช่า (ORIX)" ] \
  && pass "รถเดิมถูกแก้ข้อมูล ไม่สร้างซ้ำ และไมล์เดิมไม่ถูกแตะ" || fail "รถเดิม: $(DB "select count(*) from \"Vehicle\" where replace(replace(\"plateNumber\",' ',''),'-','')='9ทส1003'")"
# รถเดิมคงทะเบียนแบบที่เขียนไว้ ("9ทส-1003") — หาด้วยทะเบียนที่ตัดช่องว่าง/ขีดแล้ว
DB "select note from \"Vehicle\" where replace(replace(\"plateNumber\",' ',''),'-','')='9ทส1003'" | grep -q "หมายเหตุ: รอสลับคัน" \
  && pass "ข้อความท้ายแถวที่ไม่มีหัวคอลัมน์ เก็บเป็นหมายเหตุ" || fail "หมายเหตุท้ายแถว"
[ "$(DB "select count(*) from \"Vehicle\" where \"plateNumber\" in ('9ทส 1004','9ทส 1005')")" = "0" ] && pass "รถที่ข้ามไม่ถูกสร้าง (ฐานข้อมูล)" || fail "รถที่ข้ามถูกสร้าง"
[ "$(IMP $A | J '[d.created,d.updated,d.same].join()')" = "0,0,3" ] && pass "นำเข้าไฟล์เดิมซ้ำ ทุกคันขึ้นว่าไม่เปลี่ยน" || fail "นำเข้าซ้ำไม่นิ่ง"
DB "delete from \"Vehicle\" where replace(replace(\"plateNumber\",' ',''),'-','') like '9ทส100%'" >/dev/null

echo "═══ ภาคของรถ (หาจากทีมของผู้รับผิดชอบ)"
RS=$RANDOM
# ทีมสมมุติ: สาขาสองแห่งอยู่ภาค X หนึ่งแห่งอยู่ภาค Y → ทีมนี้อยู่ภาค X (ภาคที่สาขามากที่สุด) · ชื่อเก่าของทีมเปลี่ยนชื่อมาแล้ว
DB "insert into \"Branch\"(code,name,zone,region) values ('ZR1$RS','ร1','ทีมภาค$RS','ภาคX$RS'),('ZR2$RS','ร2','ทีมภาค$RS','ภาคX$RS'),('ZR3$RS','ร3','ทีมภาค$RS','ภาคY$RS');
    insert into \"TeamRename\"(\"fromName\",\"toName\") values ('ทีมเก่า$RS','ทีมภาค$RS')" >/dev/null
PUTV() { curl -s -X PUT "localhost:4000/api/vehicles/$1" -H "$(H $A)" -H 'Content-Type: application/json' -d "$2" >/dev/null; }
FLEETV() { curl -s localhost:4000/api/vehicles/fleet -H "$(H $A)" | J "const v=d.vehicles.find(x=>x.id===$1); [v.region,v.regionSource,v.team].join('|')"; }
PUTV $V1 "{\"owner\":\"ทีมภาค$RS · สมชาย (ชาย)\"}"
[ "$(FLEETV $V1)" = "ภาคX$RS|team|ทีมภาค$RS" ] && pass "ภาคมาจากทีมในช่องผู้รับผิดชอบ (ภาคที่สาขาของทีมมากที่สุด)" || fail "ภาคจากทีม: $(FLEETV $V1)"
PUTV $V1 "{\"owner\":\"ทีมเก่า$RS · สมชาย\"}"
[ "$(FLEETV $V1)" = "ภาคX$RS|team|ทีมภาค$RS" ] && pass "ผู้รับผิดชอบยังเขียนชื่อทีมเก่า (เปลี่ยนชื่อแล้ว) ก็หาภาคได้" || fail "ชื่อทีมเก่า: $(FLEETV $V1)"
PUTV $V1 '{"region":"ภาคกำหนดเอง"}'
[ "$(FLEETV $V1)|$(DB "select region from \"Vehicle\" where id=$V1")" = "ภาคกำหนดเอง|manual|ทีมภาค$RS|ภาคกำหนดเอง" ] && pass "กำหนดภาคเองแทนภาคของทีมได้ (ฐานข้อมูล)" || fail "กำหนดเอง: $(FLEETV $V1)"
PUTV $V1 '{"region":null}'
[ "$(FLEETV $V1)" = "ภาคX$RS|team|ทีมภาค$RS" ] && pass "ล้างภาคที่กำหนดเอง กลับไปใช้ภาคของทีม" || fail "ล้างแล้ว: $(FLEETV $V1)"
PUTV $V2 '{"owner":"สำนักงานใหญ่"}'
[ "$(FLEETV $V2)" = "||" ] && pass "หาทีมไม่ได้ = ยังไม่ระบุภาค" || fail "ไม่มีทีม: $(FLEETV $V2)"
curl -s localhost:4000/api/vehicles/fleet -H "$(H $A)" | J "d.regions.includes('ภาคX$RS')&&d.regions.includes('ภาคY$RS')" | grep -q true \
  && pass "ตัวเลือกภาคในฟอร์มมาจากทะเบียนสาขา" || fail "ตัวเลือกภาค"
DB "delete from \"Branch\" where code like 'ZR_$RS'; delete from \"TeamRename\" where \"fromName\"='ทีมเก่า$RS'" >/dev/null

echo "═══ หมายเหตุรถเห็นเฉพาะแอดมิน (ต.ค. 69 — แอดมินจดเลขบัตรเติมน้ำมันไว้ในช่องนี้)"
DB "update \"Vehicle\" set note='บัตรลงท้าย 8853 ทดสอบ' where id=$V1" >/dev/null
NT=$(curl -s localhost:4000/api/vehicle-logs/status -H "$(H $T)" | J "(d.vehicles.find(v=>v.id===$V1)||{}).note")
NA=$(curl -s localhost:4000/api/vehicle-logs/status -H "$(H $A)" | J "(d.vehicles.find(v=>v.id===$V1)||{}).note")
[ "$NT" = "null" ] && [ "$NA" = "บัตรลงท้าย 8853 ทดสอบ" ] && pass "หน้าลงทะเบียนใช้รถ: ช่างไม่ได้หมายเหตุ แอดมินได้ (คำตอบ API)" || fail "status: ช่าง=$NT แอดมิน=$NA"
LT=$(curl -s localhost:4000/api/vehicles -H "$(H $T)" | J "(d.find(v=>v.id===$V1)||{}).note")
LA=$(curl -s localhost:4000/api/vehicles -H "$(H $A)" | J "(d.find(v=>v.id===$V1)||{}).note")
[ "$LT" = "null" ] && [ "$LA" = "บัตรลงท้าย 8853 ทดสอบ" ] && pass "รายชื่อรถ: ช่างไม่ได้หมายเหตุ แอดมินได้ (คำตอบ API)" || fail "vehicles: ช่าง=$LT แอดมิน=$LA"

echo
# เก็บกวาด — ลบรายการ รูป และรถทดสอบ
for L in $(DB "select id from \"VehicleLog\" where \"vehicleId\" in ($V1,$V2)"); do curl -s -X DELETE "localhost:4000/api/vehicle-logs/$L" -H "$(H $A)" >/dev/null; done
DB "delete from \"VehicleLogPhoto\" where \"logId\" is null and \"uploadedById\" in (select id from \"User\" where \"employeeCode\" in ('A001','S001','T001'))" >/dev/null
DB "delete from \"Vehicle\" where id in ($V1,$V2)" >/dev/null
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
