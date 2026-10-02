/* Phone features through Capacitor, with web fallbacks. Plugins load lazily. */
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

export async function onBack(handler) {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', handler);
}
export async function exitApp() {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  App.exitApp();
}
export async function onResume(fn) {
  if (isNative) { const { App } = await import('@capacitor/app'); App.addListener('resume', fn); }
  else document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fn(); });
}

function toBase64(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = ''; const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(bin);
}
/** Writes the file to the app cache and opens the Android share sheet (Save to Files / Drive / WhatsApp…). */
export async function shareFile(name, data) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const res = await Filesystem.writeFile({ path: name, data: toBase64(data), directory: Directory.Cache });
  try {
    await Share.share({ title: name, files: [res.uri], dialogTitle: `Save or share ${name}` });
    return 'saved';
  } catch (e) {
    if (/cancel/i.test(e && e.message)) return 'declined';
    throw e;
  }
}

export async function openUrl(url) {
  if (isNative) { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url }); }
  else window.open(url, '_blank', 'noopener');
}

export async function setStatusBar(dark, color) {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color });
  } catch (e) { /* not critical */ }
}

/* ---- Daily reminder (local notifications, scheduled only for future times) ---- */
const REMINDER_IDS = Array.from({ length: 14 }, (_, i) => 1000 + i);
export async function reminderPermission(request) {
  if (!isNative) return 'unavailable';
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted' && request) p = await LocalNotifications.requestPermissions();
  return p.display;
}
export async function scheduleReminders(list) {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: REMINDER_IDS.map(id => ({ id })) });
    if (!list.length) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: list.map(n => ({ id: n.id, title: 'Daily Duty Tracker', body: n.body, schedule: { at: n.at, allowWhileIdle: true }, extra: { date: n.date } }))
    });
  } catch (e) { console.warn('Reminder scheduling failed', e); }
}
export async function onReminderTap(fn) {
  if (!isNative) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  LocalNotifications.addListener('localNotificationActionPerformed', a => fn(a.notification && a.notification.extra && a.notification.extra.date));
}
