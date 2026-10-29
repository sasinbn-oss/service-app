#!/bin/bash
# ทดสอบ: ประวัติเคลม (GET /api/part-claims · /pending-count · /related · /export)
#   · ใครเห็น: แอดมิน · Admin Spare Part · Super Admin เห็นทั้งหมด · หัวหน้าภาคเฉพาะใบในขอบเขต (นอกพื้นที่ไม่เห็น)
#     · ช่าง / Area 403 · ไม่ล็อกอิน 401 · ใบทดสอบไม่นับ
#   · รอบ: ค่าตั้งต้นเฉพาะรอบล่าสุดของอะไหล่แต่ละตัวในใบ · rounds=all เห็นรอบที่ตีกลับแล้วส่งใหม่ (ป้าย "ส่งใหม่แล้ว")
#     · รอบนับจากทุกแถวของใบ ไม่ใช่เฉพาะที่ผ่านตัวกรองวันที่ · ตีกลับแล้วไม่ได้ส่งชิ้นนั้นใหม่ ≠ "รอช่างแก้"
#   · ตัวกรอง: วันที่ (วันตามเวลาไทย) · สถานะ · ยี่ห้อ · ค้นหา (ใบงาน/สาขา/รหัสอะไหล่/รหัสตัวเสีย/เครื่อง) · สาขา+เครื่องตรงตัว
#   · ตัวเลขการ์ด (ชิ้น · รอบล่าสุด) และปุ่มสถานะ (แถว) ตรงกับที่คิดจากฐานข้อมูลเอง · แบ่งหน้า · ตัวเลขข้างเมนู · ลิงก์ในใบงาน
#   · Excel เป็นไฟล์ xlsx จริง แถวตรงกับหน้าจอ · ตรวจเคลมผ่าน API จริงแล้วประวัติเปลี่ยนตาม · ใบเคลม PDF เปิดได้
#
# สร้างแถวเคลมด้วย psql บนใบงานจริงที่เปิดผ่าน API — ทางปิดงานจริงต้องเดินขั้นอะไหล่ทั้งสายและแนบหลักฐานครบ
# (อยู่ใน claim-test.sh แล้ว) ที่นี่ต้องการเวลาส่งย้อนหลังหลายเดือนและหลายรอบที่คุมได้ ซึ่งทางจริงทำไม่ได้
set -e
SP="$(cd "$(dirname "$0")" && pwd)"
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -qAtc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
GET() { curl -s "localhost:4000/api/$2" -H "$(H $1)"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "localhost:4000/api/$2" -H "$(H $1)"; }
SUF=$RANDOM
BC1="DZCH${SUF}A"; BC2="DZCH${SUF}B"
R1="ภาคทดสอบประวัติเคลม$SUF"; R2="ภาคทดสอบประวัติเคลมอื่น$SUF"
BRA="ยี่ห้อทดสอบเคลม$SUF-ก"; BRB="ยี่ห้อทดสอบเคลม$SUF-ข"
IDS=""
XLSX=$(mktemp --suffix=.xlsx); PDF=$(mktemp --suffix=.pdf)
cleanup() {
  for i in $IDS; do curl -s -X DELETE "localhost:4000/api/work-orders/$i" -H "$(H $A)" >/dev/null; done
  DB "delete from \"Machine\" where \"branchId\" in (select id from \"Branch\" where code in ('$BC1','$BC2'));
      delete from \"Branch\" where code in ('$BC1','$BC2');
      delete from \"User\" where \"employeeCode\" like 'ZCH_$SUF';
      update \"User\" set region=nullif('$OLD_REGION','') where \"employeeCode\"='S001'" >/dev/null
  rm -f "$XLSX" "$PDF"
}
trap cleanup EXIT
A=$(login A001); T=$(login T001)
OLD_REGION=$(DB "select coalesce(region,'') from \"User\" where \"employeeCode\"='S001'")
DB "update \"User\" set region='$R1' where \"employeeCode\"='S001'" >/dev/null
S=$(login S001)
HASH=$(DB "select \"passwordHash\" from \"User\" where \"employeeCode\"='T001'")
for u in "P:PARTS_ADMIN:แอดมินอะไหล่ทดสอบประวัติเคลม" "X:SUPER_ADMIN:ซูเปอร์แอดมินทดสอบประวัติเคลม" "R:AREA:Area ทดสอบประวัติเคลม"; do
  IFS=: read -r k role name <<<"$u"
  DB "insert into \"User\"(\"employeeCode\",name,role,\"passwordHash\",\"mustChangePassword\") values ('ZCH$k$SUF','$name','$role','$HASH',false)" >/dev/null
done
PA=$(login ZCHP$SUF); SA=$(login ZCHX$SUF); AR=$(login ZCHR$SUF)
PANAME=$(DB "select name from \"User\" where \"employeeCode\"='ZCHP$SUF'")
PAID=$(DB "select id from \"User\" where \"employeeCode\"='ZCHP$SUF'")
TID=$(DB "select id from \"User\" where \"employeeCode\"='T001'"); TNAME=$(DB "select name from \"User\" where id=$TID")
BOARD=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BOARD'")
BELT=$(DB "select id from \"SparePart\" where \"partCode\"='SP-BELT'")
# สาขา 1 ในภาคของ S001 · สาขา 2 อยู่ภาคอื่น (นอกขอบเขตหัวหน้าภาค) — ทีมประจำชื่อเฉพาะ ไม่มีหัวหน้าภาคคนอื่นดูแล
DB "insert into \"Branch\"(name,code,region,zone,ownership) values ('สาขาทดสอบประวัติเคลมหนึ่ง','$BC1','$R1','ทีมทดสอบประวัติเคลม$SUF','FRANCHISE'),
    ('สาขาทดสอบประวัติเคลมสอง','$BC2','$R2','ทีมทดสอบประวัติเคลมสอง$SUF','FRANCHISE')" >/dev/null
for m in "$BC1:W1" "$BC1:W2" "$BC1:W3" "$BC2:W1"; do
  DB "insert into \"Machine\"(\"branchId\",code,type,\"updatedAt\") values ((select id from \"Branch\" where code='${m%%:*}'),'${m##*:}','WASHER',now())" >/dev/null
done
newwo() { POST $A work-orders "{\"branchCode\":\"$1\",\"jobType\":\"CM\",\"priority\":\"NORMAL\",\"machines\":[{\"code\":\"$2\",\"symptom\":\"ทดสอบประวัติเคลม\"}]}" | J 'd.orders?d.orders[0].id:d.id'; }
W1=$(newwo $BC1 W1); W2=$(newwo $BC1 W2); W3=$(newwo $BC2 W1); W4=$(newwo $BC1 W3); IDS="$W1 $W2 $W3 $W4"
DB "update \"WorkOrder\" set \"isTest\"=true where id=$W4" >/dev/null
C1=$(DB "select code from \"WorkOrder\" where id=$W1"); C2=$(DB "select code from \"WorkOrder\" where id=$W2")
[ -n "$C1" ] && [ -n "$C2" ] && [ -n "$W3" ] && [ -n "$W4" ] || { echo "FAIL เปิดใบงานทดสอบไม่ได้"; exit 1; }

# แถวเคลม — เวลาเขียนเป็น UTC (ตารางเก็บ UTC) · วงเล็บคือเวลาไทย
# $1 ใบ · $2 อะไหล่ · $3 รหัส · $4 ชื่อ · $5 รหัสตัวเสีย · $6 จำนวน · $7 สาขา · $8 ยี่ห้อ · $9 เครื่อง · $10 สถานะ · $11 ส่ง · $12 ตรวจ · $13 เหตุผล
ins() {
  local br=$(DB "select name from \"Branch\" where code='$7'")
  local rev="null" revBy="null" reason="null"
  [ -n "${12}" ] && rev="timestamp '${12}'" && revBy=$PAID
  [ -n "${13}" ] && reason="'${13}'"
  DB "insert into \"PartClaim\"(\"workOrderId\",\"sparePartId\",\"partCode\",\"partName\",\"brokenPartCode\",quantity,\"branchCode\",\"branchName\",brand,model,\"machineCode\",symptom,\"checkNote\",status,\"rejectReason\",\"createdById\",\"createdAt\",\"reviewedById\",\"reviewedAt\")
      values ($1,$2,'$3','$4','$5',$6,'$7','$br','$8','รุ่นทดสอบ','$9','อาการทดสอบ','เช็คทดสอบ','${10}',$reason,$TID,timestamp '${11}',$revBy,$rev) returning id"
}
# ใบ 1 ส่งรอบแรกสองชิ้น (10 มี.ค. 68 10:00) ถูกตีกลับทั้งคู่ → รอบสองส่งแผงวงจรตัวเดียว (2 เม.ย. 09:00) อนุมัติ
#   สายพานไม่ได้ส่งใหม่ — รอบล่าสุดของมันยังเป็นตีกลับ แต่ไม่ใช่ "รอช่างแก้"
K1=$(ins $W1 $BOARD SP-BOARD แผงวงจรทดสอบ OLD-1$SUF 1 $BC1 "$BRA" W1 REJECTED "2025-03-10 03:00" "2025-03-11 03:00" "รูปป้ายรุ่นไม่ชัด")
K3=$(ins $W1 $BELT SP-BELT สายพานทดสอบ BELT-OLD$SUF 2 $BC1 "$BRA" W1 REJECTED "2025-03-10 03:00" "2025-03-11 03:00" "รูปป้ายรุ่นไม่ชัด")
K2=$(ins $W1 $BOARD SP-BOARD แผงวงจรทดสอบ OLD-2$SUF 1 $BC1 "$BRA" W1 APPROVED "2025-04-02 02:00" "2025-04-03 02:00" "")
# ใบ 2 รอตรวจ ส่ง 15 เม.ย. 00:30 เวลาไทย = 14 เม.ย. ตาม UTC — ตัดวันตาม UTC จะหลุดไปวันก่อน
K4=$(ins $W2 $BOARD SP-BOARD แผงวงจรทดสอบ OLD-4$SUF 3 $BC1 "$BRB" W2 PENDING "2025-04-14 17:30" "" "")
# ใบ 3 สาขานอกขอบเขตหัวหน้าภาค · ตีกลับ ใบยังเปิดอยู่ = รอช่างแก้
K5=$(ins $W3 $BOARD SP-BOARD แผงวงจรทดสอบ OLD-5$SUF 1 $BC2 "$BRA" W1 REJECTED "2025-04-20 05:00" "2025-04-21 05:00" "อาการไม่ตรงกับชิ้นที่เปลี่ยน")
# ใบทดสอบ — ไม่นับ
K6=$(ins $W4 $BOARD SP-BOARD แผงวงจรทดสอบ OLD-6$SUF 1 $BC1 "$BRA" W3 APPROVED "2025-04-05 03:00" "2025-04-05 04:00" "")
[ "$(DB "select count(*) from \"PartClaim\" where id in ($K1,$K2,$K3,$K4,$K5,$K6)")" = "6" ] || { echo "FAIL เตรียมแถวเคลมไม่ได้"; exit 1; }

# id ของแถวเคลมของเทสต์นี้ที่อยู่ในคำตอบ เรียงตามที่ส่งมา — ข้อมูลของเทสต์อื่นที่รันพร้อมกันไม่ปน
ALL_K="$K1,$K2,$K3,$K4,$K5,$K6"
mine() { GET $1 "part-claims?limit=500&$2" | J "d.rows.filter(r=>[$ALL_K].includes(r.id)).map(r=>r.id).join(',')"; }
row() { GET $A "part-claims?limit=500&rounds=all&branchCode=$3" | J "const r=d.rows.find(x=>x.id==$1); r?$2:'ไม่มีแถว'"; }

echo "═══ ใครเห็น"
LATEST="$K5,$K4,$K2,$K3"
[ "$(mine $A)" = "$LATEST" ] && pass "แอดมิน: รอบล่าสุดของแต่ละชิ้น เรียงส่งล่าสุดก่อน · ไม่มีรอบที่ส่งใหม่แล้ว · ไม่มีใบทดสอบ" || fail "แอดมินเห็น: $(mine $A) (ควรเป็น $LATEST)"
[ "$(mine $PA)" = "$LATEST" ] && pass "Admin Spare Part เห็นเหมือนแอดมิน" || fail "Admin Spare Part เห็น: $(mine $PA)"
[ "$(mine $SA)" = "$LATEST" ] && pass "Super Admin เห็นเหมือนแอดมิน" || fail "Super Admin เห็น: $(mine $SA)"
[ "$(mine $S)" = "$K4,$K2,$K3" ] && pass "หัวหน้าภาคเห็นเฉพาะสาขาในภาคตัวเอง (สาขาภาคอื่นไม่ขึ้น)" || fail "หัวหน้าภาคเห็น: $(mine $S)"
[ "$(GET $S part-claims/pending-count | J d.pending)" = "1" ] && pass "ตัวเลขข้างเมนูของหัวหน้าภาค = รอตรวจในภาคตัวเอง (1)" || fail "pending-count หัวหน้าภาค: $(GET $S part-claims/pending-count)"
DB "update \"User\" set region='ภาคทดสอบไม่มีจริง$SUF' where \"employeeCode\"='S001'" >/dev/null
S2=$(login S001)
[ -z "$(mine $S2)" ] && pass "หัวหน้าภาคนอกพื้นที่ไม่เห็นสักแถว" || fail "นอกพื้นที่เห็น: $(mine $S2)"
[ "$(GET $S2 part-claims/pending-count | J d.pending)" = "0" ] && pass "หัวหน้าภาคนอกพื้นที่ ตัวเลขข้างเมนู 0" || fail "pending นอกพื้นที่: $(GET $S2 part-claims/pending-count)"
DB "update \"User\" set region='$R1' where \"employeeCode\"='S001'" >/dev/null
BAD403=""
for p in part-claims part-claims/pending-count "part-claims/related?branchCode=$BC1" part-claims/export; do
  [ "$(CODE $T "$p")" = "403" ] && [ "$(CODE $AR "$p")" = "403" ] || BAD403="$BAD403 $p($(CODE $T "$p")/$(CODE $AR "$p"))"
done
[ -z "$BAD403" ] && pass "ช่าง / Area 403 ทุกเส้น (รายการ · ตัวเลขข้างเมนู · ลิงก์ในใบงาน · Excel)" || fail "ช่าง/Area เข้าได้:$BAD403"
GET $T part-claims | J 'd.error' | grep -q "Admin Spare Part แอดมิน และหัวหน้าภาค" && pass "ข้อความ 403 ภาษาไทยบอกว่าใครดูได้" || fail "ข้อความ 403: $(GET $T part-claims)"
[ "$(curl -s -o /dev/null -w '%{http_code}' localhost:4000/api/part-claims)" = "401" ] && pass "ไม่ล็อกอิน 401" || fail "ไม่ล็อกอินเข้าได้"

echo
echo "═══ รอบที่ตีกลับแล้วส่งใหม่"
[ "$(mine $A rounds=all)" = "$K5,$K4,$K2,$K3,$K1" ] && pass "rounds=all เห็นรอบแรกที่ถูกตีกลับด้วย (ยังไม่มีใบทดสอบ)" || fail "rounds=all: $(mine $A rounds=all)"
[ "$(row $K1 '[r.round,r.latest,r.look,r.statusLabel,r.rejectReason].join("|")' $BC1)" = "1|false|OLD|ตีกลับ · ส่งใหม่แล้ว|รูปป้ายรุ่นไม่ชัด" ] \
  && pass "รอบแรก: รอบ 1 · ไม่ใช่รอบล่าสุด · ป้าย \"ตีกลับ · ส่งใหม่แล้ว\" + เหตุผล" || fail "แถวรอบแรก: $(row $K1 'JSON.stringify(r)' $BC1)"
[ "$(row $K2 '[r.round,r.latest,r.statusLabel,r.code,r.techName,r.reviewerName,r.reviewedAt.slice(0,10),r.brokenPartCode,r.machineCode,r.brand].join("|")' $BC1)" = "2|true|อนุมัติ|$C1|$TNAME|$PANAME|2025-04-03|OLD-2$SUF|W1|$BRA" ] \
  && pass "รอบสอง: \"ส่งรอบ 2\" อนุมัติ · เลขใบงาน ช่างที่ส่ง คนตรวจ วันตรวจ รหัสตัวเสีย เครื่อง ยี่ห้อ ตรงฐานข้อมูล" || fail "แถวรอบสอง: $(row $K2 'JSON.stringify(r)' $BC1)"
[ "$(row $K3 '[r.round,r.latest,r.look,r.statusLabel].join("|")' $BC1)" = "1|true|REJECTED|ตีกลับ · ไม่ได้ส่งเคลมใหม่" ] \
  && pass "ชิ้นที่ตีกลับแล้วช่างไม่ส่งใหม่ (ใบส่งรอบใหม่ไปแล้ว) ไม่ขึ้นว่ารอช่างแก้" || fail "แถวสายพาน: $(row $K3 'JSON.stringify(r)' $BC1)"
[ "$(row $K5 '[r.latest,r.statusLabel].join("|")' $BC2)" = "true|ตีกลับ · รอช่างแก้" ] && pass "ตีกลับรอบล่าสุด ใบยังเปิด = \"ตีกลับ · รอช่างแก้\"" || fail "แถวใบ 3: $(row $K5 'JSON.stringify(r)' $BC2)"
# รอบนับจากทุกแถวของใบ — กรองเฉพาะเดือนเมษายน รอบแรก (มีนาคม) ไม่อยู่ในชุด แต่แถวเมษายนยังเป็นรอบ 2
[ "$(GET $A "part-claims?from=2025-04-01&to=2025-04-30&branchCode=$BC1" | J "d.rows.find(r=>r.id==$K2).round")" = "2" ] \
  && pass "กรองวันที่แล้วรอบแรกหลุดช่วง แถวรอบสองยังบอก \"ส่งรอบ 2\"" || fail "รอบหลังกรองวันที่"

echo
echo "═══ ตัวกรอง"
[ "$(mine $A status=APPROVED)" = "$K2" ] && pass "สถานะ อนุมัติ" || fail "อนุมัติ: $(mine $A status=APPROVED)"
[ "$(mine $A status=PENDING)" = "$K4" ] && pass "สถานะ รอตรวจ" || fail "รอตรวจ: $(mine $A status=PENDING)"
[ "$(mine $A status=REJECTED)" = "$K5,$K3" ] && pass "สถานะ ตีกลับ (รอบล่าสุด)" || fail "ตีกลับ: $(mine $A status=REJECTED)"
[ "$(mine $A 'status=REJECTED&rounds=all')" = "$K5,$K3,$K1" ] && pass "สถานะ ตีกลับ + รวมรอบเก่า" || fail "ตีกลับ+รอบเก่า: $(mine $A 'status=REJECTED&rounds=all')"
[ "$(mine $A "brand=$(node -pe 'encodeURIComponent(process.argv[1])' "$BRB")")" = "$K4" ] && pass "ยี่ห้อ ข" || fail "ยี่ห้อ ข: $(mine $A "brand=$BRB")"
[ "$(mine $A "brand=$(node -pe 'encodeURIComponent(process.argv[1])' "$BRA")")" = "$K5,$K2,$K3" ] && pass "ยี่ห้อ ก" || fail "ยี่ห้อ ก"
GET $A part-claims | J "d.brands.includes('$BRA')&&d.brands.includes('$BRB')?'ok':'no'" | grep -q ok && pass "ตัวเลือกยี่ห้อมีทั้งสองยี่ห้อ" || fail "ตัวเลือกยี่ห้อ"
[ "$(mine $A 'from=2025-04-01&to=2025-04-30')" = "$K5,$K4,$K2" ] && pass "ช่วงวันที่ 1–30 เม.ย." || fail "เม.ย.: $(mine $A 'from=2025-04-01&to=2025-04-30')"
[ "$(mine $A 'from=2025-04-15&to=2025-04-15')" = "$K4" ] && pass "ส่ง 00:30 เวลาไทย นับเป็นวันที่ 15 (ไม่ใช่วันที่ 14 ตาม UTC)" || fail "วันที่ 15: $(mine $A 'from=2025-04-15&to=2025-04-15')"
[ -z "$(mine $A 'from=2025-04-14&to=2025-04-14')" ] && pass "วันที่ 14 ไม่มีแถวที่ส่งวันที่ 15 เวลาไทย" || fail "วันที่ 14: $(mine $A 'from=2025-04-14&to=2025-04-14')"
[ "$(mine $A 'to=2025-03-31')" = "$K3" ] && pass "ถึง 31 มี.ค. (ไม่ระบุวันเริ่ม) — เห็นสายพาน รอบแรกแผงวงจรถูกแทนแล้วจึงไม่ขึ้น" || fail "ถึง มี.ค.: $(mine $A 'to=2025-03-31')"
[ "$(mine $A "q=old-2$SUF")" = "$K2" ] && pass "ค้นรหัสตัวเสีย (ตัวพิมพ์เล็ก)" || fail "ค้นรหัสตัวเสีย: $(mine $A "q=old-2$SUF")"
[ "$(mine $A "q=$C2")" = "$K4" ] && pass "ค้นเลขใบงาน" || fail "ค้นเลขใบงาน: $(mine $A "q=$C2")"
[ "$(mine $A "q=$(echo $BC2 | tr A-Z a-z)")" = "$K5" ] && pass "ค้นรหัสสาขา (ตัวพิมพ์เล็ก)" || fail "ค้นสาขา: $(mine $A "q=$BC2")"
[ "$(mine $A "q=$(node -pe 'encodeURIComponent("ประวัติเคลมสอง")')")" = "$K5" ] && pass "ค้นชื่อสาขา" || fail "ค้นชื่อสาขา"
[ "$(mine $A "q=belt-old$SUF")" = "$K3" ] && pass "ค้นรหัสตัวเสียของอีกชิ้น" || fail "ค้นสายพาน"
[ "$(mine $A "q=SP-BELT&branchCode=$BC1")" = "$K3" ] && pass "ค้นรหัสอะไหล่ที่เบิก" || fail "ค้นรหัสอะไหล่: $(mine $A "q=SP-BELT&branchCode=$BC1")"
[ "$(mine $A "q=W2&branchCode=$BC1")" = "$K4" ] && pass "ค้นเลขเครื่อง" || fail "ค้นเครื่อง: $(mine $A "q=W2&branchCode=$BC1")"
[ "$(mine $A "branchCode=$BC1&machineCode=w1")" = "$K2,$K3" ] && pass "ลิงก์เครื่องนี้: สาขา + เครื่องตรงตัว (W1 ของสาขาอื่นไม่ปน)" || fail "สาขา+เครื่อง: $(mine $A "branchCode=$BC1&machineCode=W1")"
[ "$(mine $A "branchCode=$BC1")" = "$K4,$K2,$K3" ] && pass "ลิงก์สาขานี้" || fail "สาขา: $(mine $A "branchCode=$BC1")"
[ -z "$(mine $A "branchCode=${BC1:0:6}")" ] && pass "รหัสสาขาในลิงก์ต้องตรงทั้งตัว ไม่ใช่ค้นบางส่วน" || fail "สาขาบางส่วนติด"
[ "$(GET $A "part-claims/related?branchCode=$BC1&machineCode=W1" | J '[d.branch,d.machine].join("|")')" = "3|2" ] \
  && pass "ตัวเลขบนลิงก์ในใบงาน: สาขานี้ 3 · เครื่องนี้ 2" || fail "related: $(GET $A "part-claims/related?branchCode=$BC1&machineCode=W1")"
[ "$(GET $S2 "part-claims/related?branchCode=$BC2&machineCode=W1" | J '[d.branch,d.machine].join("|")')" = "0|0" ] \
  && pass "ตัวเลขบนลิงก์ไม่นับใบนอกขอบเขตหัวหน้าภาค" || fail "related นอกขอบเขต"
GET $A "part-claims?from=2025-05-01&to=2025-04-01" | J 'd.error' | grep -q "วันที่เริ่มต้องไม่หลัง" && pass "วันที่เริ่มหลังวันสิ้นสุด = 400 ข้อความไทย" || fail "วันที่กลับด้าน"
[ "$(CODE $A "part-claims?from=2025-02-30")" = "400" ] && [ "$(CODE $A "part-claims?status=OOPS")" = "400" ] && pass "วันที่ไม่มีจริง / สถานะมั่ว = 400" || fail "ตรวจตัวกรองผิด"

echo
echo "═══ ตัวเลขสรุป เทียบกับที่คิดจากฐานข้อมูลเอง"
# รอบล่าสุดของแต่ละชิ้นต่อใบ (ไม่นับใบทดสอบ) ของสาขา 1 — คิดด้วย SQL แยกจากโค้ดเซิร์ฟเวอร์
EXP=$(DB "with x as (select c.*, row_number() over (partition by c.\"workOrderId\", coalesce(c.\"sparePartId\"::text, c.\"partCode\") order by c.\"createdAt\" desc, c.id desc) rn
            from \"PartClaim\" c join \"WorkOrder\" w on w.id=c.\"workOrderId\" where c.\"branchCode\"='$BC1' and not w.\"isTest\")
          select concat_ws('|', coalesce(sum(quantity) filter (where status='PENDING'),0), coalesce(sum(quantity) filter (where status='APPROVED'),0),
                 coalesce(sum(quantity) filter (where status='REJECTED'),0), sum(quantity), count(distinct \"workOrderId\"), count(*),
                 count(*) filter (where status='PENDING'), count(*) filter (where status='APPROVED'), count(*) filter (where status='REJECTED'))
          from x where rn=1")
GOT=$(GET $A "part-claims?branchCode=$BC1" | J '[d.tiles.pending,d.tiles.approved,d.tiles.rejected,d.tiles.total,d.tiles.orders,d.counts.ALL,d.counts.PENDING,d.counts.APPROVED,d.counts.REJECTED].join("|")')
[ "$GOT" = "$EXP" ] && [ "$GOT" = "3|1|2|6|2|3|1|1|1" ] && pass "การ์ด (ชิ้น) + ปุ่มสถานะ (แถว) ตรงกับฐานข้อมูล: $GOT" || fail "ตัวเลข: ได้ $GOT · ฐานข้อมูล $EXP"
GOT=$(GET $A "part-claims?branchCode=$BC1&rounds=all&status=APPROVED" | J '[d.tiles.total,d.counts.ALL,d.counts.REJECTED,d.total].join("|")')
[ "$GOT" = "6|4|2|1" ] && pass "รวมรอบเก่า: ปุ่มสถานะนับรอบเก่าด้วย (4 · ตีกลับ 2) การ์ดยังนับรอบล่าสุด (6 ชิ้น) · กรองสถานะไม่เปลี่ยนตัวเลข" || fail "รวมรอบเก่า: $GOT"
P=$(GET $A "part-claims?branchCode=$BC1&limit=1&offset=1")
[ "$(echo "$P" | J '[d.total,d.rows.length,d.rows[0].id].join("|")')" = "3|1|$K2" ] && pass "แบ่งหน้า: limit 1 offset 1 = แถวที่สองตามลำดับส่งล่าสุด · total ทั้งหมด" || fail "แบ่งหน้า: $(echo "$P" | head -c 200)"

echo
echo "═══ Excel"
OUT=$(GET $A "part-claims/export?branchCode=$BC1&rounds=all")
curl -s "localhost:4000$(echo "$OUT" | J d.path)" -o "$XLSX"
X=$(node -e '
  const E=require(process.argv[1]); const wb=new E.Workbook();
  wb.xlsx.readFile(process.argv[2]).then(()=>{
    const s=wb.worksheets[0]; let head=0; const codes=[];
    s.eachRow((r,i)=>{ const v=r.values; if(v[1]==="วันที่ส่งเคลม") head=i; else if(head&&v[3]) codes.push(v[3]+"/"+v[10]+"/"+v[14]); });
    console.log([wb.worksheets.map(w=>w.name).join(","), codes.length, codes.sort().join(",")].join("|"));
  }).catch(e=>console.log("อ่านไม่ได้ "+e.message));
' "$SP/../backend/node_modules/exceljs" "$XLSX")
[ "$(echo "$OUT" | J d.count)" = "4" ] && [ "$(head -c 2 "$XLSX")" = "PK" ] && pass "ส่งออก Excel ได้ไฟล์ xlsx · นับ 4 แถวตามตัวกรอง" || fail "export: $OUT"
EXPX="ประวัติเคลม,รวมตามอะไหล่|4|$(node -pe 'process.argv.slice(1).sort().join(",")' "$C1/SP-BOARD/อนุมัติ" "$C1/SP-BOARD/ตีกลับ · ส่งใหม่แล้ว" "$C1/SP-BELT/ตีกลับ · ไม่ได้ส่งเคลมใหม่" "$C2/SP-BOARD/รอตรวจ")"
[ "$X" = "$EXPX" ] && pass "ไฟล์มีชีตประวัติเคลม + รวมตามอะไหล่ · แถวตรงกับหน้าจอ (เลขใบงาน รหัสอะไหล่ ผลตรวจ)" || fail "ในไฟล์: $X"

echo
echo "═══ ใบเคลม PDF + ตรวจเคลมผ่าน API จริง"
LINK=$(POST $PA "work-orders/$W1/claims/$K2/pdf-link" '{}' | J 'd.path')
curl -s "localhost:4000$LINK" -o "$PDF"; [ "$(head -c 4 "$PDF")" = "%PDF" ] && pass "ปุ่มใบเคลม PDF (ลิงก์เดิมของใบงาน) เปิดได้จากแถวในประวัติ" || fail "PDF: $LINK"
# ใบ 2 ถึงขั้นรอตรวจเคลม แล้ว Admin Spare Part กดอนุมัติจริง — ประวัติต้องเปลี่ยนตามฐานข้อมูล
DB "update \"WorkOrder\" set status='CLAIM_REVIEW' where id=$W2" >/dev/null
POST $PA "work-orders/$W2/claim-review" '{"approve":true}' >/dev/null
[ "$(DB "select c.status||'|'||w.status||'|'||(c.\"reviewedById\"=$PAID) from \"PartClaim\" c join \"WorkOrder\" w on w.id=c.\"workOrderId\" where c.id=$K4")" = "APPROVED|DONE|true" ] \
  && [ "$(row $K4 '[r.status,r.statusLabel,r.reviewerName,r.orderStatus].join("|")' $BC1)" = "APPROVED|อนุมัติ|$PANAME|DONE" ] \
  && pass "อนุมัติผ่าน API แล้ว แถวในประวัติเป็นอนุมัติ ชื่อคนตรวจ ใบงานปิด (ตรงฐานข้อมูล)" || fail "หลังอนุมัติ: $(row $K4 'JSON.stringify(r)' $BC1)"
[ "$(GET $S part-claims/pending-count | J d.pending)" = "0" ] && pass "ตรวจแล้วตัวเลขข้างเมนูลด (0)" || fail "pending หลังตรวจ: $(GET $S part-claims/pending-count)"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
