import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function registerNativeBackHandler(handler: () => void) {
  if (!isNativeApp()) return () => undefined;

  const listener = await CapacitorApp.addListener('backButton', handler);
  return () => listener.remove();
}

export async function exitNativeApp() {
  if (Capacitor.getPlatform() === 'android') await CapacitorApp.exitApp();
}
