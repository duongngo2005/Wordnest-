#!/usr/bin/env bash

EDGE_BIN="/opt/microsoft/msedge/microsoft-edge"
APP_ID="hbblfifohofgngfbjbiimbbcimepbdcb"
APP_URL="http://localhost:3000/"
ICON_PATH="$HOME/.local/share/icons/hicolor/256x256/apps/msedge-${APP_ID}-Default.png"

# Check if port 3000 is ready
is_server_ready() {
    curl -s -m 1 -o /dev/null -w "%{http_code}" "$APP_URL" 2>/dev/null | grep -qE "^(200|304|307|308)$"
}

if ! is_server_ready; then
    notify-send "WordNest" "Đang khởi động máy chủ..." -i "$ICON_PATH" 2>/dev/null || true

    # Start via systemd user service (survives desktop app cgroup exit)
    systemctl --user start wordnest.service

    # Wait until port 3000 is ready (timeout: 30 seconds)
    TIMEOUT=30
    ELAPSED=0
    while ! is_server_ready; do
        sleep 0.5
        ELAPSED=$((ELAPSED + 1))
        if [ "$ELAPSED" -ge $((TIMEOUT * 2)) ]; then
            notify-send "WordNest" "Không thể kết nối máy chủ sau ${TIMEOUT}s. Xem: systemctl --user status wordnest" -u critical -i "$ICON_PATH" 2>/dev/null || true
            break
        fi
    done
fi

# Launch Edge PWA
exec "$EDGE_BIN" --profile-directory=Default --app-id="$APP_ID" --app-url="$APP_URL" "$@"
