import { Capacitor } from "@capacitor/core";

/**
 * 网页里 API 与页面同源，用相对路径即可；
 * 装进 App 以后页面源是 http://localhost，必须写服务器的绝对地址。
 * 换服务器时改这里，或者打包时用 VITE_API_BASE 覆盖。
 */
const DEFAULT_NATIVE_API_BASE = "http://39.106.48.233";

function resolveBase(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (Capacitor.isNativePlatform()) return DEFAULT_NATIVE_API_BASE;
  return "";
}

export const API_BASE = resolveBase();

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
