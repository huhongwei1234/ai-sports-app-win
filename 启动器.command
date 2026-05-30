#!/bin/bash
# 切换到脚本所在目录，确保相对路径正确
cd "$(dirname "$0")"

# 启动 Electron 应用（使用相对路径）
exec ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
