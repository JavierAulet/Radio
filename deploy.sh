#!/bin/bash
set -e
cd /home/ubuntu/radio
git checkout -- .
git pull
cd frontend && npm ci && npm run build
cd ..
mkdir -p backend/hls
pm2 restart radio-server
echo "✅ Deploy completado"
