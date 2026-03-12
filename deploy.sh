#!/bin/bash
cd /home/ubuntu/radio
git checkout -- .
git pull
cd frontend && npm run build
cd ..
pm2 restart radio-server
echo "✅ Deploy completado"
