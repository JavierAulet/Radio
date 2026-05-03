#!/bin/bash
set -e

RADIO_DIR="/home/ubuntu/radio"
BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)

cd "$RADIO_DIR"

# Backup de la base de datos antes de cualquier cambio
mkdir -p "$BACKUP_DIR"
if [ -f backend/radio.db ]; then
    cp backend/radio.db "$BACKUP_DIR/radio_$DATE.db"
    # Conservar solo los últimos 7 backups
    ls -t "$BACKUP_DIR"/radio_*.db | tail -n +8 | xargs -r rm
fi

# Actualizar código sin tocar archivos locales (música, BD, segmentos HLS)
git fetch origin main
git reset --hard origin/main

# Preservar directorios que git no trackea
mkdir -p backend/hls backend/music backend/ads

# Instalar dependencias y compilar frontend
cd frontend && npm ci && npm run build
cd ..

# Reiniciar servidor
pm2 restart radio-server

echo "✅ Deploy completado — backup: radio_$DATE.db"
