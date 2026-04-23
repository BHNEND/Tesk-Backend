#!/bin/bash
# ============================================================
# Tesk-Backend 并发压力测试脚本
# 用法: bash scripts/concurrency-test.sh [并发数] [总数]
# 示例: bash scripts/concurrency-test.sh 20 50
# ============================================================

set -e

BASE_URL="${BASE_URL:-http://localhost:4000}"
CONCURRENCY="${1:-20}"
TOTAL="${2:-50}"
ADMIN_KEY="${ADMIN_API_KEY:-admin-secret-key-change-in-production}"

echo "========================================="
echo " Tesk-Backend 并发压力测试"
echo "========================================="
echo " 目标: $BASE_URL"
echo " 并发数: $CONCURRENCY (WORKER_CONCURRENCY 建议 >= $CONCURRENCY)"
echo " 总任务数: $TOTAL"
echo "========================================="

# 1. 检查服务是否在线
echo ""
echo "[1/5] 检查服务健康..."
HEALTH=$(curl -sf "$BASE_URL/health" 2>/dev/null || echo "")
if [ -z "$HEALTH" ]; then
  echo "❌ 服务未启动！请先启动: npm run dev 或 PROCESS_TYPE=all npm run start"
  exit 1
fi
echo "✅ 服务在线: $HEALTH"

# 2. 创建或获取测试 API Key
echo ""
echo "[2/5] 准备测试 API Key..."
TEST_KEY_NAME="concurrency-test-$(date +%s)"

# 尝试创建新 Key，直接设置高并发限制
API_RESPONSE=$(curl -sf -X POST "$BASE_URL/api/v1/admin/apikeys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d "{\"name\":\"$TEST_KEY_NAME\"}" 2>/dev/null || echo "")

if [ -z "$API_RESPONSE" ]; then
  echo "❌ 创建 API Key 失败。请检查 ADMIN_API_KEY 是否正确。"
  exit 1
fi

API_KEY=$(echo "$API_RESPONSE" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>console.log(JSON.parse(d.join('')).data.key))")
API_KEY_ID=$(echo "$API_RESPONSE" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>console.log(JSON.parse(d.join('')).data.id))")

if [ -z "$API_KEY" ]; then
  echo "❌ 解析 API Key 失败"
  exit 1
fi

# 更新并发限制为总任务数的 3 倍，确保提交阶段不触发限制
curl -sf -X PATCH "$BASE_URL/api/v1/admin/apikeys/$API_KEY_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d "{\"concurrencyLimit\":$((TOTAL * 3)),\"rpmLimit\":1000}" > /dev/null 2>&1

if [ -z "$API_RESPONSE" ]; then
  echo "❌ 创建 API Key 失败。请检查 ADMIN_API_KEY 是否正确。"
  exit 1
fi

API_KEY=$(echo "$API_RESPONSE" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>console.log(JSON.parse(d.join('')).data.key))")
API_KEY_ID=$(echo "$API_RESPONSE" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>console.log(JSON.parse(d.join('')).data.id))")

if [ -z "$API_KEY" ]; then
  echo "❌ 解析 API Key 失败"
  exit 1
fi
echo "✅ API Key: ${API_KEY:0:8}... (ID: $API_KEY_ID, 并发限制: $((TOTAL * 3)))"

# 3. 注册 mock 模型策略（使用 defaultModelHandler）
echo ""
echo "[3/5] 注册测试模型策略..."
MOCK_MODEL="mock-test-model"

# 检查是否已存在（从列表中查找）
EXISTING=$(curl -sf "$BASE_URL/api/v1/admin/strategies/models" \
  -H "Authorization: Bearer $ADMIN_KEY" 2>/dev/null | \
  node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{const r=JSON.parse(d.join(''));const m=r.data.find(x=>x.modelName==='$MOCK_MODEL');console.log(m?'exists':'')})" 2>/dev/null)

if [ "$EXISTING" != "exists" ]; then
  curl -sf -X POST "$BASE_URL/api/v1/admin/strategies/models" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_KEY" \
    -d "{\"modelName\":\"$MOCK_MODEL\",\"handler\":\"defaultModelHandler\"}" > /dev/null 2>&1
  echo "✅ 已注册 $MOCK_MODEL → defaultModelHandler"
else
  echo "✅ $MOCK_MODEL 策略已存在"
fi

# 4. 并发提交任务
echo ""
echo "[4/5] 并发提交 $TOTAL 个任务..."
START_TIME=$(date +%s%N)

SUBMIT_SUCCESS=0
SUBMIT_FAIL=0
TASK_IDS=()
TMPDIR_TEST=$(mktemp -d)
trap "rm -rf $TMPDIR_TEST" EXIT

# 用后台子进程实现并发提交，每个结果写入独立文件
# 注意：全局限流 10 req/sec，需要控制并发批次
ACTIVE=0
for i in $(seq 1 "$TOTAL"); do
  curl -sf -X POST "$BASE_URL/api/v1/jobs/createTask" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"model\":\"$MOCK_MODEL\",\"callBackUrl\":\"https://httpbin.org/status/200\",\"input\":{\"prompt\":\"test-$i\"}}" \
    > "$TMPDIR_TEST/resp-$i" 2>/dev/null || echo "FAIL" > "$TMPDIR_TEST/resp-$i" &

  ACTIVE=$((ACTIVE + 1))
  if [ $ACTIVE -ge 8 ]; then
    sleep 1    # 控制在限流阈值内 (8 req/sec < 10 req/sec limit)
    wait 2>/dev/null || true
    ACTIVE=0
  fi
done
wait

SUBMIT_END=$(date +%s%N)
SUBMIT_MS=$(( (SUBMIT_END - START_TIME) / 1000000 ))

for i in $(seq 1 "$TOTAL"); do
  LINE=$(cat "$TMPDIR_TEST/resp-$i" 2>/dev/null)
  if echo "$LINE" | grep -q '"taskId"'; then
    SUBMIT_SUCCESS=$((SUBMIT_SUCCESS + 1))
    TID=$(echo "$LINE" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>console.log(JSON.parse(d.join('')).data.taskId))" 2>/dev/null)
    [ -n "$TID" ] && TASK_IDS+=("$TID")
  else
    SUBMIT_FAIL=$((SUBMIT_FAIL + 1))
  fi
done

rm -rf "$TMPDIR_TEST"

echo "✅ 提交完成: 成功 $SUBMIT_SUCCESS / 失败 $SUBMIT_FAIL (耗时 ${SUBMIT_MS}ms)"

# 5. 等待所有任务完成并统计
echo ""
echo "[5/5] 等待任务完成 (defaultModelHandler mock 耗时 5-10s)..."

TIMEOUT=120  # 最大等待 120 秒
ELAPSED=0
SUCCESS_COUNT=0
FAILED_COUNT=0
PENDING_COUNT=$SUBMIT_SUCCESS

while [ $ELAPSED -lt $TIMEOUT ] && [ $((SUCCESS_COUNT + FAILED_COUNT)) -lt $SUBMIT_SUCCESS ]; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))

  # 用 admin stats 接口快速获取统计
  STATS=$(curl -sf "$BASE_URL/api/v1/admin/stats" \
    -H "Authorization: Bearer $ADMIN_KEY" 2>/dev/null)

  # 从提交的 task 列表批量查询前几个剩余任务
  NEW_SUCCESS=0
  NEW_FAILED=0
  for tid in "${TASK_IDS[@]}"; do
    RESP=$(curl -sf "$BASE_URL/api/v1/jobs/recordInfo?taskId=$tid" \
      -H "Authorization: Bearer $API_KEY" 2>/dev/null || echo "")
    STATE=$(echo "$RESP" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{console.log(JSON.parse(d.join('')).data.state)}catch(e){console.log('')}})" 2>/dev/null)
    [ "$STATE" = "SUCCESS" ] && NEW_SUCCESS=$((NEW_SUCCESS + 1))
    [ "$STATE" = "FAILED" ] && NEW_FAILED=$((NEW_FAILED + 1))
  done
  SUCCESS_COUNT=$NEW_SUCCESS
  FAILED_COUNT=$NEW_FAILED
  PENDING_COUNT=$((SUBMIT_SUCCESS - SUCCESS_COUNT - FAILED_COUNT))

  printf "\r  [%3ds] ✅ SUCCESS: %d | ❌ FAILED: %d | ⏳ PENDING/RUNNING: %d" "$ELAPSED" "$SUCCESS_COUNT" "$FAILED_COUNT" "$PENDING_COUNT"
done

TOTAL_END=$(date +%s%N)
TOTAL_MS=$(( (TOTAL_END - START_TIME) / 1000000 ))

echo ""
echo ""
echo "========================================="
echo " 测试结果"
echo "========================================="
echo " 提交: 成功 $SUBMIT_SUCCESS / 失败 $SUBMIT_FAIL"
echo " 完成: SUCCESS $SUCCESS_COUNT / FAILED $FAILED_COUNT"
echo " 总耗时: ${TOTAL_MS}ms"
echo " 提交吞吐: $(echo "scale=0; $SUBMIT_SUCCESS * 1000 / ($SUBMIT_MS + 1)" | bc) tasks/sec"
echo " 平均任务耗时: $( [ $((SUCCESS_COUNT + FAILED_COUNT)) -gt 0 ] && echo "scale=0; ($TOTAL_MS - $SUBMIT_MS) / ($SUCCESS_COUNT + $FAILED_COUNT)" | bc || echo "N/A" )ms"
echo "========================================="

# 清理测试数据
echo ""
read -p "是否清理测试 API Key 和策略? [Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  curl -sf -X DELETE "$BASE_URL/api/v1/admin/apikeys/$API_KEY_ID" \
    -H "Authorization: Bearer $ADMIN_KEY" > /dev/null 2>&1
  # 删除策略需要 ID
  STRATEGY_ID=$(curl -sf "$BASE_URL/api/v1/admin/strategies/models" \
    -H "Authorization: Bearer $ADMIN_KEY" 2>/dev/null | \
    node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{const r=JSON.parse(d.join(''));const m=r.data.find(x=>x.modelName==='$MOCK_MODEL');if(m)console.log(m.id)})" 2>/dev/null)
  [ -n "$STRATEGY_ID" ] && curl -sf -X DELETE "$BASE_URL/api/v1/admin/strategies/models/$STRATEGY_ID" \
    -H "Authorization: Bearer $ADMIN_KEY" > /dev/null 2>&1
  echo "✅ 已清理"
fi
