#!/bin/bash
# Tailscale 一键安装 + 配置（会要求输入 Mac 开机密码）
cd "$(dirname "$0")" || exit 1
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

PKG="$HOME/Downloads/Tailscale-1.104.6-macos.pkg"
CLI="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

echo ""
echo "  Tailscale 安装与配置"
echo "  ================================"
echo ""

if [ -d /Applications/Tailscale.app ]; then
  echo "  ✓ 已安装，跳过"
else
  if [ ! -f "$PKG" ]; then
    echo "  找不到安装包：$PKG"
    echo "  请先手动下载：https://tailscale.com/download/mac"
    read -n 1 -s -r -p "  按任意键关闭…"
    exit 1
  fi
  echo "  安装中（马上会让你输入开机密码）…"
  sudo installer -pkg "$PKG" -target / || { echo "  安装失败"; read -n 1 -s -r -p "  按任意键关闭…"; exit 1; }
  echo "  ✓ 安装完成"
fi

sleep 1
if [ ! -x "$CLI" ]; then
  CLI="$(command -v tailscale || true)"
fi
if [ -z "$CLI" ] || [ ! -x "$CLI" ]; then
  echo "  找不到 tailscale 命令，去 /Applications 里手动打开一次 Tailscale 再重跑"
  read -n 1 -s -r -p "  按任意键关闭…"
  exit 1
fi

echo ""
echo "  现在开始登录 + 打开「出口节点」开关。"
echo "  下面会打印一个 https://login.tailscale.com/... 的链接，"
echo "  用浏览器打开、登录你的账号（Google/GitHub/邮箱都行）。"
echo "  这个窗口先别关。"
echo ""
sleep 2

sudo "$CLI" up --advertise-exit-node --accept-dns=false

echo ""
echo "  ================================"
"$CLI" status 2>/dev/null | head -5
echo ""
IP=$("$CLI" ip -4 2>/dev/null | head -1)
echo "  你这台 Mac 的私网地址： $IP"
echo "  植物管家： http://$IP:7788"
echo ""
echo "  手机装 Tailscale 并登录同一个账号后，"
echo "  用上面这个地址就能在任何网络下打开植物管家。"
echo ""
echo "  想当出口节点用：去 https://login.tailscale.com/admin/machines"
echo "  找到这台机器 → ⋯ → Edit route settings → 勾选 Use as exit node"
echo ""
read -n 1 -s -r -p "  按任意键关闭…"
