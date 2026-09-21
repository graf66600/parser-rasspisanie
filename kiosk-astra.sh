#!/bin/bash
# ==============================================================================
# Скрипт запуска интерактивного стола в режиме Kiosk на Astra Linux
# Разрешение экрана: 1920x1080 (43" FullHD)
# ==============================================================================

# Задержка 3 секунды для инициализации графической подсистемы Fly / X11
sleep 3

# Отключение гашения экрана и режима сна (DPMS)
xset s off 2>/dev/null
xset -dpms 2>/dev/null
xset s noblank 2>/dev/null

# Скрыть курсор мыши при отсутствии движения (если установлен unclutter)
if command -v unclutter &>/dev/null; then
  unclutter -idle 2 -root &
fi

# URL приложения (замените на ваш локальный или удаленный URL GitHub Pages)
# Пример: https://yourusername.github.io/parser-rasspisanie/?kiosk=1
APP_URL="${1:-https://graf66600.github.io/parser-rasspisanie/?kiosk=1}"

# Определение установленного браузера (Chromium / Chromium-gost / Яндекс.Браузер)
BROWSER_BIN=""
for b in chromium-gost chromium yandex-browser-stable google-chrome; do
  if command -v "$b" &>/dev/null; then
    BROWSER_BIN="$b"
    break
  fi
done

if [ -z "$BROWSER_BIN" ]; then
  echo "Браузер Chromium не найден! Установите chromium-gost или chromium."
  exit 1
fi

# Флаги Kiosk-режима для стабильной работы 24/7 без всплывающих окон
$BROWSER_BIN \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --touch-events=enabled \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --incognito \
  "$APP_URL"
