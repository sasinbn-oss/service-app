#!/bin/bash
# ทดสอบ: ย้ายสาขาเข้าทีม (แอดมิน) — ตั้งทีมใหม่ตามบันทึกแบ่งทีมได้โดยไม่ต้องแก้ไฟล์ทะเบียน
#        อัปไฟล์ทะเบียนที่ยังเขียนทีมเดิม สาขาต้องไม่เด้งกลับ · คืนตามไฟล์ได้ · เปลี่ยนชื่อทีมแล้วยังคงอยู่
# ยืนยันผลที่ฐานข้อมูลด้วยทุกข้อ (CLAUDE.md)
set -e
J() { node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); eval(process.argv[1])' "$1"; }
H() { echo "Authorization: Bearer $1"; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILED=1; }
DB() { PGPASSWORD="${PGPASSWORD:-postgres}" psql -h localhost -U postgres serviceapp -Atc "$1"; }
login() { curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' -d "{\"employeeCode\":\"$1\",\"password\":\"test1234\"}" | J 'd.token'; }
POST() { curl -s -X POST "localhost:4000/api/$2" -H "$(H $1)" -H 'Content-Type: application/json' -d "$3"; }
SUF=$RANDOM
OLD="ทีมเดิมทดสอบย้าย$SUF"; NEW="นครศรีทดสอบ$SUF"; NEW2="นครศรีฯทดสอบ$SUF"
cleanup() {
  DB "delete from \"Branch\" where code like 'ZM%$SUF'; delete from \"TeamRename\" where \"fromName\" in ('$NEW','$NEW2','$OLD')" >/dev/null
}
trap cleanup EXIT
A=$(login A001); S=$(login S001)
DB "insert into \"Branch\"(code,name,zone,\"pmTeam\",region) values
  ('ZM1$SUF','สาขาทดสอบย้ายทีม หนึ่ง','$OLD','$OLD','ใต้'),
  ('ZM2$SUF','สาขาทดสอบย้ายทีม สอง','$OLD','$OLD','ใต้'),
  ('ZM3$SUF','สาขาทดสอบย้ายทีม สาม','$OLD',null,'ใต้')" >/dev/null
ID1=$(DB "select id from \"Branch\" where code='ZM1$SUF'"); ID2=$(DB "select id from \"Branch\" where code='ZM2$SUF'"); ID3=$(DB "select id from \"Branch\" where code='ZM3$SUF'")
zp() { DB "select coalesce(zone,'-')||'|'||coalesce(\"pmTeam\",'-') from \"Branch\" where code='$1'"; }
upload() {
  local X=$(mktemp --suffix=.xlsx)
  NODE_PATH="$(dirname "$0")/../backend/node_modules" node -e '
    const E=require("exceljs"); const wb=new E.Workbook(); const ws=wb.addWorksheet("s");
    ws.addRow(["code","ชื่อสาขา","ผจกภาค","ทีมช่าง","ผู้ดูแล PM"]);
    for (const c of process.argv[2].split(",")) ws.addRow([c,"สาขาทดสอบ","ใต้",process.argv[1],process.argv[1]]);
    wb.xlsx.writeFile(process.argv[3]);' "$OLD" "ZM1$SUF,ZM2$SUF,ZM3$SUF" "$X"
  curl -s -X POST localhost:4000/api/branches/import -H "$(H $A)" -F "file=@$X" -F mode=commit >/dev/null
  rm -f "$X"
}

echo "═══ ค้นหาสาขา"
N=$(curl -s -G localhost:4000/api/teams/branches --data-urlencode "search=ทดสอบย้ายทีม" -H "$(H $A)" | J 'd.branches.filter(b=>b.code.endsWith("'$SUF'")).length')
[ "$N" = "3" ] && pass "ค้นชื่อสาขาเจอครบ 3 สาขา" || fail "ค้นเจอ $N"
N=$(curl -s -G localhost:4000/api/teams/branches --data-urlencode "search=$OLD" -H "$(H $A)" | J 'd.branches.length')
[ "$N" = "3" ] && pass "ค้นด้วยชื่อทีมเดิมได้" || fail "ค้นด้วยทีมเจอ $N"

echo
echo "═══ สิทธิ์"
R=$(POST $S teams/move-branches "{\"branchIds\":[$ID1],\"team\":\"$NEW\",\"fields\":[\"zone\"]}")
[ "$(zp ZM1$SUF)" = "$OLD|$OLD" ] && pass "หัวหน้าภาคย้ายสาขาไม่ได้ (DB ไม่เปลี่ยน)" || fail "หัวหน้าภาคย้ายได้: $R"

echo
echo "═══ ย้ายไปทีมใหม่"
R=$(POST $A teams/move-branches "{\"branchIds\":[$ID1,$ID2,$ID3],\"team\":\"  $NEW \",\"fields\":[\"zone\",\"pmTeam\"]}")
[ "$(echo "$R" | J 'd.isNew+"|"+d.branches+"|"+d.technicians')" = "true|3|0" ] && pass "ตอบว่าเป็นทีมใหม่ 3 สาขา ยังไม่มีช่าง" || fail "คำตอบ: $(echo $R|head -c 160)"
[ "$(zp ZM1$SUF)|$(zp ZM2$SUF)|$(zp ZM3$SUF)" = "$NEW|$NEW|$NEW|$NEW|$NEW|$NEW" ] \
  && pass "DB: ทีม CM และ PM ของทั้ง 3 สาขาเป็นทีมใหม่ (ตัดช่องว่างให้)" || fail "DB: $(zp ZM1$SUF) $(zp ZM3$SUF)"
[ "$(DB "select count(*)||'|'||count(distinct \"fromTeam\") from \"BranchTeamMove\" where \"branchId\" in ($ID1,$ID2,$ID3)")" = "6|1" ] \
  && pass "DB: จำการย้ายไว้ 6 รายการ พร้อมทีมเดิมตามไฟล์" || fail "BranchTeamMove: $(DB "select field,\"fromTeam\",\"toTeam\" from \"BranchTeamMove\" where \"branchId\"=$ID3")"
curl -s localhost:4000/api/branches/teams -H "$(H $A)" | J 'd.some(t=>t.name==="'$NEW'")?"ok":"bad"' | grep -q ok \
  && pass "ทีมใหม่ขึ้นในรายชื่อทีมให้เลือกที่การ์ดช่าง" || fail "ทีมใหม่ไม่ขึ้นให้เลือก"
curl -s localhost:4000/api/teams -H "$(H $A)" | J 'const t=d.teams.find(t=>t.name==="'$NEW'"); t&&!t.orphan&&t.cmBranches===3&&d.moves.filter(m=>m.to==="'$NEW'").length===6?"ok":"bad"' | grep -q ok \
  && pass "หน้าทีมช่างเห็นทีมใหม่ 3 สาขา และรายการที่ย้ายในแอป" || fail "หน้าทีมช่างไม่ตรง"

echo
echo "═══ อัปไฟล์ทะเบียนที่ยังเขียนทีมเดิม"
upload
[ "$(zp ZM1$SUF)|$(zp ZM2$SUF)|$(zp ZM3$SUF)" = "$NEW|$NEW|$NEW|$NEW|$NEW|$NEW" ] \
  && pass "DB: สาขาไม่เด้งกลับทีมเดิม" || fail "เด้งกลับ: $(zp ZM1$SUF) $(zp ZM3$SUF)"

echo
echo "═══ คืนตามไฟล์"
MID=$(DB "select id from \"BranchTeamMove\" where \"branchId\"=$ID1 and field='zone'")
POST $A "teams/moves/$MID/revert" '{}' >/dev/null
[ "$(zp ZM1$SUF)" = "$OLD|$NEW" ] && [ "$(DB "select count(*) from \"BranchTeamMove\" where id=$MID")" = "0" ] \
  && pass "DB: คืนเฉพาะทีม CM ของสาขาหนึ่ง ทีม PM ยังอยู่ทีมใหม่" || fail "คืนไม่ตรง: $(zp ZM1$SUF)"
upload
[ "$(zp ZM1$SUF)" = "$OLD|$NEW" ] && pass "อัปไฟล์หลังคืน → ทีม CM ใช้ค่าในไฟล์ · ทีม PM ยังคงที่ย้ายไว้" || fail "หลังคืน: $(zp ZM1$SUF)"

echo
echo "═══ ย้ายซ้ำ / ย้ายกลับ"
POST $A teams/move-branches "{\"branchIds\":[$ID2],\"team\":\"$OLD\",\"fields\":[\"zone\"]}" >/dev/null
[ "$(zp ZM2$SUF)" = "$OLD|$NEW" ] && [ "$(DB "select count(*) from \"BranchTeamMove\" where \"branchId\"=$ID2 and field='zone'")" = "0" ] \
  && pass "ย้ายกลับไปทีมตามไฟล์ = เลิกบังคับ (ไม่ค้างรายการ)" || fail "ย้ายกลับ: $(zp ZM2$SUF)"

echo
echo "═══ เปลี่ยนชื่อทีมที่ย้ายมา"
POST $A teams/rename "{\"from\":\"$NEW\",\"to\":\"$NEW2\"}" >/dev/null
upload
[ "$(zp ZM3$SUF)" = "$NEW2|$NEW2" ] && [ "$(DB "select count(*) from \"BranchTeamMove\" where \"toTeam\"='$NEW'")" = "0" ] \
  && pass "เปลี่ยนชื่อทีมแล้วอัปไฟล์ → สาขาที่ย้ายไว้ตามชื่อใหม่ ไม่กลับไปชื่อเก่า" || fail "หลังเปลี่ยนชื่อ: $(zp ZM3$SUF)"

echo
[ -z "$FAILED" ] && echo "── ผ่านทั้งหมด ──" || echo "── มีข้อที่ไม่ผ่าน ──"
