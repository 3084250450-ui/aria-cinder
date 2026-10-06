#!/bin/bash
cd "/Users/wangxinbei/Desktop/昭然的家/伺服器/toy/toy"
echo "—— Aria MCP 起 ——"
echo "地址：http://100.126.175.67:7915/mcp"
echo
# 防止休眠，前台跑着，别关
caffeinate -d -i -m -s node aria-mcp.js
echo
echo "（窗口别关，关了我这扇口就断了）"
