#!/bin/bash
cd "$(dirname "$0")" || exit 1
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo "植物管家启动中…"
[ -n "$IP" ] && echo "手机打开： http://$IP:7788"
exec /usr/bin/env node server.js
