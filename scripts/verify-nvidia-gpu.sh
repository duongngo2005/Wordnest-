#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " WORDNEST: POST-REBOOT VERIFICATION & BENCHMARK "
echo "=========================================================="

CHECKPOINT_FILE="/home/dinduong/PROJECTS/Wordnest-/.gpu-setup-checkpoint.json"

echo "[1/5] Kiểm tra NVIDIA GPU Driver trên Host..."
if ! command -v nvidia-smi &>/dev/null; then
  echo "[-] Lỗi: Không tìm thấy nvidia-smi."
  exit 1
fi

nvidia-smi

echo
echo "[2/5] Kiểm tra NVIDIA Container Runtime trong Docker..."
docker info 2>&1 | grep -i "nvidia" || {
  echo "[!] Chưa thấy nvidia runtime, khởi động lại docker daemon..."
  systemctl restart docker
  sleep 2
}

echo
echo "[3/5] Recreate container Ollama với GPU passthrough..."
cd /home/dinduong/PROJECTS/Wordnest-
docker compose -f docker-compose.local-ai.yml up -d --force-recreate
sleep 5

echo
echo "[4/5] Kích hoạt model qwen3:8b và kiểm tra CPU/GPU residency..."
docker exec wordnest-local-ai-ollama-1 ollama run qwen3:8b "Hi" || true
docker exec wordnest-local-ai-ollama-1 ollama ps

echo
echo "[5/5] Chạy benchmark tự động các context 4096 / 6144 / 8192 trên RTX 4050..."
npx tsx scripts/benchmark-gpu-contexts.ts

# Cập nhật checkpoint hoàn thành
cat <<EOF > "$CHECKPOINT_FILE"
{
  "step": "completed",
  "timestamp": "$(date -Iseconds)",
  "driver": "nvidia-driver-595-open",
  "containerToolkitInstalled": true,
  "rebootRequired": false,
  "verifiedGpu": true
}
EOF

echo
echo "=========================================================="
echo "[V] HOÀN TẤT TẤT CẢ CÁC BƯỚC THIẾT LẬP VÀ BENCHMARK GPU!"
echo "=========================================================="
