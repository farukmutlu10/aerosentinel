#!/bin/bash
# AeroSentinel Bakım Modu Toggle
# Kullanım:
#   ./scripts/toggle-maintenance.sh on    → Bakım modunu aç
#   ./scripts/toggle-maintenance.sh off   → Bakım modunu kapat
#   ./scripts/toggle-maintenance.sh status → Durumu göster

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REDIRECTS_FILE="$PROJECT_ROOT/artifacts/aero-sentinel/public/_redirects"

case "$1" in
  on)
    echo "/* /maintenance.html 503" > "$REDIRECTS_FILE"
    echo "# Bakım modu AÇIK — kapatmak için: $0 off" >> "$REDIRECTS_FILE"
    echo "🔧 Bakım modu AÇILDI"
    echo "Build + deploy yapmayı unutmayın."
    ;;
  off)
    echo "# Bakım modu — açmak için aşağıdaki satırın başındaki # işaretini kaldırın" > "$REDIRECTS_FILE"
    echo "# /* /maintenance.html 503" >> "$REDIRECTS_FILE"
    echo "✅ Bakım modu KAPATILDI"
    echo "Build + deploy yapmayı unutmayın."
    ;;
  status)
    if grep -q "^/\* /maintenance.html 503" "$REDIRECTS_FILE" 2>/dev/null; then
      echo "🔧 Bakım modu: AÇIK"
    else
      echo "✅ Bakım modu: KAPALI (normal çalışma)"
    fi
    ;;
  *)
    echo "Kullanım: $0 {on|off|status}"
    exit 1
    ;;
esac
