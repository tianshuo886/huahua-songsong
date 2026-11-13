#!/bin/bash
# 一键对外分享：启动服务 + Cloudflare 隧道，打印两个链接
cd "$(dirname "$0")" || exit 1
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

TOKEN=$(cat .token 2>/dev/null | tr -d '\n')
PORT=${PORT:-7788}
LOG=/tmp/plant-tunnel.log
SRVLOG=/tmp/plant-server.log

echo ""
echo "  植物管家 · 对外分享"
echo "  ─────────────────────────────"

# 1) 本地服务
if lsof -ti :$PORT >/dev/null 2>&1; then
  echo "  服务已在运行，端口 $PORT"
else
  echo "  启动本地服务…"
  PLANT_TOKEN="$TOKEN" nohup node server.js > "$SRVLOG" 2>&1 &
  sleep 1.6
fi

if ! curl -s --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null; then
  echo "  服务没起来，看 $SRVLOG"
  exit 1
fi

# 2) 隧道
pkill -f "bin/cloudflared tunnel" 2>/dev/null
sleep 0.6
: > "$LOG"
nohup ./bin/cloudflared tunnel --url "http://127.0.0.1:$PORT" \
  --no-autoupdate --protocol http2 --logfile "$LOG" >/dev/null 2>&1 &

printf "  申请公网地址"
URL=""
for i in $(seq 1 40); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  printf "."
  sleep 1
done
echo ""

if [ -z "$URL" ]; then
  echo "  没拿到地址，检查网络或看 $LOG"
  exit 1
fi
sleep 4

# 3) 等隧道真正可用
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "$URL/health")
  [ "$code" = "200" ] && break
  sleep 1
done

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

echo ""
echo "  ─────────────────────────────"
if [ "$code" = "200" ]; then
  echo "  通了 ✓"
else
  echo "  隧道建好了但还没回源，状态码 $code，等半分钟再刷新"
fi
echo ""
echo "  自己用（能改数据）："
echo "    $URL/?t=$TOKEN"
echo ""
echo "  发给别人（只读）："
echo "    $URL"
echo ""
echo "  局域网内： http://$IP:$PORT"
echo "  ─────────────────────────────"
echo "  这个地址是临时的，关掉就失效；重开会换一个。"
echo "  停止： pkill -f cloudflared; pkill -f 'node server.js'"
echo ""
