#!/bin/bash
# รันเทสต์ API ทุกชุด แล้วสรุปรวมท้ายสุด
#
# ไม่หยุดเมื่อชุดใดชุดหนึ่งพัง เพราะอยากเห็นภาพรวมว่าพังกี่ชุด ไม่ใช่ชุดแรกที่พัง
SP="$(cd "$(dirname "$0")" && pwd)"

if ! curl -s -m 3 -o /dev/null localhost:4000/health; then
  echo "backend ไม่ได้รันอยู่ที่ localhost:4000 — อ่าน tests/README.md ก่อน"
  exit 1
fi

TOTAL=0; BAD=0
for t in team-test requisition-test flow-test quote-test capacity-test backorder-test parts-out-test sendback-test status-guard-test live-sync-test plan-test vehicle-test user-delete-test roster-import-test team-rename-test role-change-test branch-move-test coverage-test team-group-test team-delete-test team-members-test list-filter-test timeline-test backfill-test view-as-test parts-admin-test claim-test test-copy-test backup-test coverage-map-test supervisor-close-test opener-report-test system-report-test off-catalog-test confirmed-report-test open-orders-test parts-out-report-test rollback-keep-test permission-test branch-manage-test pickup-test flow-simplify-test outsource-test list-version-test tech-day-test close-round2-test stage-speed-test split-quote-test restore-test repair-import-test team-name-test team-first-test area-team-test; do
  OUT=$(bash "$SP/$t.sh" 2>&1)
  P=$(echo "$OUT" | grep -cE '^PASS')
  F=$(echo "$OUT" | grep -cE '^FAIL')
  TOTAL=$((TOTAL + P))
  printf "%-18s %2d ผ่าน" "$t" "$P"
  if [ "$F" -gt 0 ]; then
    BAD=$((BAD + 1))
    printf "  %d ไม่ผ่าน\n" "$F"
    echo "$OUT" | grep -E '^FAIL' | sed 's/^/    /'
  else
    printf "\n"
  fi
done

echo
if [ "$BAD" -eq 0 ]; then
  echo "── ผ่านทั้งหมด $TOTAL ข้อ ──"
else
  echo "── มี $BAD ชุดที่ไม่ผ่าน (ผ่าน $TOTAL ข้อ) ──"
  exit 1
fi
