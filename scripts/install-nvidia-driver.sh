#!/usr/bin/env bash
set -euo pipefail

# ==========================================================
# WORDNEST
# NVIDIA GPU DRIVER + NVIDIA CONTAINER TOOLKIT INSTALLER
#
# Target:
#   Ubuntu 26.04 LTS
#   NVIDIA GeForce RTX 4050 Laptop GPU
#   Recommended driver: nvidia-driver-595-open
#
# Script này:
#   - Cài NVIDIA driver
#   - Cài NVIDIA Container Toolkit
#   - Cấu hình Docker NVIDIA runtime
#   - Backup Docker daemon.json trước khi sửa
#   - Tạo checkpoint cho bước verify sau reboot
#
# Script KHÔNG:
#   - purge driver/package
#   - sửa GRUB
#   - xóa Docker volume
#   - xóa dữ liệu WordNest
#   - tự reboot
# ==========================================================

echo "=========================================================="
echo " WORDNEST: NVIDIA GPU & CONTAINER TOOLKIT INSTALL SCRIPT "
echo "=========================================================="

# ----------------------------------------------------------
# CONSTANTS
# ----------------------------------------------------------

WORDNEST_DIR="/home/dinduong/PROJECTS/Wordnest-"
CHECKPOINT_FILE="${WORDNEST_DIR}/.gpu-setup-checkpoint.json"

NVIDIA_DRIVER_PACKAGE="nvidia-driver-595-open"

NVIDIA_KEYRING="/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg"
NVIDIA_REPO_FILE="/etc/apt/sources.list.d/nvidia-container-toolkit.list"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

# ----------------------------------------------------------
# HELPERS
# ----------------------------------------------------------

log() {
  echo
  echo "[$1] $2"
}

fail() {
  echo
  echo "[ERROR] $1" >&2
  exit 1
}

write_checkpoint() {
  local step="$1"
  local reboot_required="$2"
  local toolkit_installed="$3"

  mkdir -p "$WORDNEST_DIR"

  cat > "$CHECKPOINT_FILE" <<EOF
{
  "step": "${step}",
  "timestamp": "$(date -Iseconds)",
  "driver": "${NVIDIA_DRIVER_PACKAGE}",
  "containerToolkitInstalled": ${toolkit_installed},
  "rebootRequired": ${reboot_required}
}
EOF

  chown dinduong:dinduong "$CHECKPOINT_FILE" 2>/dev/null || true
}

# ----------------------------------------------------------
# ROOT CHECK
# ----------------------------------------------------------

if [[ "${EUID}" -ne 0 ]]; then
  fail "Script cần chạy với quyền root.

Hãy chạy:

sudo ${WORDNEST_DIR}/scripts/install-nvidia-driver.sh"
fi

# ----------------------------------------------------------
# BASIC SYSTEM INFORMATION
# ----------------------------------------------------------

echo
echo "Thông tin hệ thống:"
echo "----------------------------------------------------------"

if command -v lsb_release >/dev/null 2>&1; then
  lsb_release -ds || true
fi

echo "Kernel: $(uname -r)"

if command -v lspci >/dev/null 2>&1; then
  echo
  echo "GPU NVIDIA phát hiện:"
  lspci -nnk | grep -A3 -i NVIDIA || true
fi

echo "----------------------------------------------------------"

write_checkpoint "starting" false false

# ----------------------------------------------------------
# 1/7 UPDATE PACKAGE LIST
# ----------------------------------------------------------

log "1/7" "Cập nhật danh sách package Ubuntu..."

apt-get update --allow-releaseinfo-change || true

# ----------------------------------------------------------
# 2/7 INSTALL REQUIRED UTILITIES
# ----------------------------------------------------------

log "2/7" "Cài các package prerequisite..."

DEBIAN_FRONTEND=noninteractive \
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg

command -v curl >/dev/null 2>&1 \
  || fail "Không tìm thấy curl sau khi cài đặt."

command -v gpg >/dev/null 2>&1 \
  || fail "Không tìm thấy gpg sau khi cài đặt."

write_checkpoint "prerequisites_installed" false false

# ----------------------------------------------------------
# OPTIONAL: DISPLAY UBUNTU RECOMMENDED DRIVER
# ----------------------------------------------------------

if command -v ubuntu-drivers >/dev/null 2>&1; then
  echo
  echo "Driver Ubuntu đề xuất:"
  echo "----------------------------------------------------------"
  ubuntu-drivers devices || true
  echo "----------------------------------------------------------"
else
  echo
  echo "[INFO] ubuntu-drivers chưa có; tiếp tục với driver:"
  echo "       ${NVIDIA_DRIVER_PACKAGE}"
fi

# ----------------------------------------------------------
# VERIFY DRIVER PACKAGE EXISTS
# ----------------------------------------------------------

log "3/7" "Kiểm tra package ${NVIDIA_DRIVER_PACKAGE}..."

if ! apt-cache show "${NVIDIA_DRIVER_PACKAGE}" >/dev/null 2>&1; then
  fail "Không tìm thấy package ${NVIDIA_DRIVER_PACKAGE} trong repository hiện tại.

KHÔNG tiếp tục cài driver.

Hãy kiểm tra lại:

ubuntu-drivers devices"
fi

echo "[OK] Package ${NVIDIA_DRIVER_PACKAGE} tồn tại."

# ----------------------------------------------------------
# INSTALL NVIDIA DRIVER
# ----------------------------------------------------------

log "4/7" "Cài đặt NVIDIA Driver: ${NVIDIA_DRIVER_PACKAGE}..."

DEBIAN_FRONTEND=noninteractive \
apt-get install -y "${NVIDIA_DRIVER_PACKAGE}"

write_checkpoint "driver_installed" true false

echo
echo "[OK] NVIDIA driver package đã được cài."
echo
echo "Lưu ý:"
echo "Kernel hiện tại có thể vẫn đang sử dụng nouveau."
echo "Driver NVIDIA mới sẽ được xác minh sau reboot."

# ----------------------------------------------------------
# NVIDIA CONTAINER TOOLKIT REPOSITORY
# ----------------------------------------------------------

log "5/7" "Thiết lập NVIDIA Container Toolkit repository..."

echo "Đang tải NVIDIA repository signing key..."

TMP_KEY="$(mktemp)"

cleanup() {
  rm -f "$TMP_KEY"
}

trap cleanup EXIT

curl \
  --fail \
  --silent \
  --show-error \
  --location \
  https://nvidia.github.io/libnvidia-container/gpgkey \
  -o "$TMP_KEY"

gpg \
  --dearmor \
  --yes \
  --output "$NVIDIA_KEYRING" \
  "$TMP_KEY"

chmod 0644 "$NVIDIA_KEYRING"

echo "Đang tải NVIDIA Container Toolkit repository configuration..."

curl \
  --fail \
  --silent \
  --show-error \
  --location \
  https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed \
      "s#deb https://#deb [signed-by=${NVIDIA_KEYRING}] https://#g" \
  > "$NVIDIA_REPO_FILE"

chmod 0644 "$NVIDIA_REPO_FILE"

echo
echo "Repository đã thêm:"
cat "$NVIDIA_REPO_FILE"

apt-get update --allow-releaseinfo-change || true

# ----------------------------------------------------------
# INSTALL NVIDIA CONTAINER TOOLKIT
# ----------------------------------------------------------

log "6/7" "Cài NVIDIA Container Toolkit..."

DEBIAN_FRONTEND=noninteractive \
apt-get install -y nvidia-container-toolkit

command -v nvidia-ctk >/dev/null 2>&1 \
  || fail "nvidia-container-toolkit đã cài nhưng không tìm thấy nvidia-ctk."

echo
echo "[OK] NVIDIA Container Toolkit đã được cài."

write_checkpoint "container_toolkit_installed" true true

# ----------------------------------------------------------
# BACKUP DOCKER CONFIG
# ----------------------------------------------------------

log "7/7" "Cấu hình NVIDIA runtime cho Docker..."

if [[ ! -d /etc/docker ]]; then
  mkdir -p /etc/docker
fi

if [[ -f /etc/docker/daemon.json ]]; then

  DOCKER_BACKUP="/etc/docker/daemon.json.backup-${TIMESTAMP}"

  echo "Backup Docker config:"
  echo
  echo "  /etc/docker/daemon.json"
  echo
  echo "-> ${DOCKER_BACKUP}"

  cp \
    --preserve=mode,ownership,timestamps \
    /etc/docker/daemon.json \
    "$DOCKER_BACKUP"

  echo "[OK] Backup hoàn tất."

else

  echo "[INFO] /etc/docker/daemon.json chưa tồn tại."
  echo "       nvidia-ctk sẽ tạo/cấu hình file mới."

fi

# ----------------------------------------------------------
# CONFIGURE NVIDIA DOCKER RUNTIME
# ----------------------------------------------------------

nvidia-ctk runtime configure --runtime=docker

echo
echo "[OK] NVIDIA Container Runtime đã được thêm vào Docker config."

# ----------------------------------------------------------
# BASIC CONFIG VALIDATION
# ----------------------------------------------------------

if [[ -f /etc/docker/daemon.json ]]; then

  echo
  echo "Docker daemon configuration:"
  echo "----------------------------------------------------------"

  if command -v python3 >/dev/null 2>&1; then

    if python3 -m json.tool /etc/docker/daemon.json >/dev/null 2>&1; then
      echo "[OK] /etc/docker/daemon.json là JSON hợp lệ."
    else
      fail "/etc/docker/daemon.json không phải JSON hợp lệ."
    fi

  else
    echo "[WARN] Không có python3 nên bỏ qua JSON syntax validation."
  fi

fi

# ----------------------------------------------------------
# FINAL CHECKPOINT
# ----------------------------------------------------------

write_checkpoint "waiting_for_reboot" true true

# ----------------------------------------------------------
# FINISH
# ----------------------------------------------------------

echo
echo "=========================================================="
echo " NVIDIA SETUP PHASE 1 HOÀN TẤT"
echo "=========================================================="
echo
echo "Đã hoàn thành:"
echo
echo "  [✓] Ubuntu package update"
echo "  [✓] Prerequisites"
echo "  [✓] ${NVIDIA_DRIVER_PACKAGE}"
echo "  [✓] NVIDIA official repository"
echo "  [✓] NVIDIA Container Toolkit"
echo "  [✓] Docker NVIDIA runtime configuration"
echo "  [✓] Docker configuration backup"
echo "  [✓] WordNest GPU setup checkpoint"
echo
echo "Checkpoint:"
echo
echo "  ${CHECKPOINT_FILE}"
echo
echo "----------------------------------------------------------"
echo
echo "QUAN TRỌNG"
echo
echo "Kernel hiện tại có thể vẫn đang chạy module 'nouveau'."
echo
echo "Cần REBOOT máy để kernel nạp NVIDIA driver mới."
echo
echo "Script KHÔNG tự reboot máy."
echo
echo "Khi bạn sẵn sàng, chạy:"
echo
echo "  sudo reboot"
echo
echo "=========================================================="
echo
echo "Sau khi máy khởi động lại, bước đầu tiên cần kiểm tra:"
echo
echo "  nvidia-smi"
echo
echo "Sau đó mới tiếp tục:"
echo
echo "  1. Verify NVIDIA Docker runtime"
echo "  2. Recreate Ollama container"
echo "  3. Load qwen3:8b"
echo "  4. Kiểm tra 'ollama ps'"
echo "  5. Xác nhận model chạy GPU"
echo "  6. Benchmark context 4096 / 6144 / 8192"
echo
echo "=========================================================="
