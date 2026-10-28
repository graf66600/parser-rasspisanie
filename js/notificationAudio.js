// ==========================================================================
// NOTIFICATION AUDIO & VIBRATION HELPER
// ==========================================================================

let audioContext = null;
let isAudioUnlocked = false;

/**
 * Инициализировать / разблокировать AudioContext по первому жесту пользователя
 */
export function unlockAudio() {
  if (isAudioUnlocked && audioContext && audioContext.state === 'running') return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        isAudioUnlocked = true;
      }).catch(() => {});
    } else {
      isAudioUnlocked = true;
    }
  } catch (e) {
    // Web Audio не поддерживается или заблокирован
  }
}

// Слушаем любые клики и тапы для гарантированной разблокировки звука
if (typeof window !== 'undefined') {
  const unlockEvents = ['click', 'touchstart', 'keydown'];
  const handleUserGesture = () => {
    unlockAudio();
    unlockEvents.forEach((ev) => window.removeEventListener(ev, handleUserGesture));
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, handleUserGesture, { passive: true }));
}

/**
 * Проиграть мягкий двухтоновый сигнал (колокольчик напоминания)
 */
export async function playNotificationSound() {
  const soundPref = localStorage.getItem('pwa_notif_sound');
  if (soundPref === 'false') return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume().catch(() => {});
    }

    const ctx = audioContext;
    const now = ctx.currentTime;

    // Первый мягкий тон (E5 ~ 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Второй гармоничный тон чуть позже (A5 ~ 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (e) {
    // Игнорируем ошибки аудио
  }
}

/**
 * Тактильная вибрация мобильного устройства (если поддерживается)
 */
export function triggerVibration(pattern = [180, 80, 180]) {
  const vibPref = localStorage.getItem('pwa_notif_vibrate');
  if (vibPref === 'false') return;

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}
