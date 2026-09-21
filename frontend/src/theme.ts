// Theme tokens for Agrawal Homeo Hall - medical/homeopathy theme
import { useEffect, useMemo, useState } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#0F172A",
  surfaceSecondary: "#F8FAFC",
  onSurfaceSecondary: "#334155",
  surfaceTertiary: "#F1F5F9",
  onSurfaceTertiary: "#475569",
  surfaceInverse: "#0F172A",
  onSurfaceInverse: "#F8FAFC",
  muted: "#64748B",

  brand: "#059669",
  onBrand: "#FFFFFF",
  brandPrimary: "#059669",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#2563EB",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#D1FAE5",
  onBrandTertiary: "#065F46",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;

const dark: ThemeColors = {
  surface: "#0B1220",
  onSurface: "#F1F5F9",
  surfaceSecondary: "#111A2E",
  onSurfaceSecondary: "#CBD5E1",
  surfaceTertiary: "#1B253D",
  onSurfaceTertiary: "#94A3B8",
  surfaceInverse: "#F8FAFC",
  onSurfaceInverse: "#0F172A",
  muted: "#94A3B8",

  brand: "#10B981",
  onBrand: "#052E1F",
  brandPrimary: "#10B981",
  onBrandPrimary: "#052E1F",
  brandSecondary: "#60A5FA",
  onBrandSecondary: "#082247",
  brandTertiary: "#134E3A",
  onBrandTertiary: "#D1FAE5",

  success: "#22C55E",
  onSuccess: "#052E1F",
  warning: "#FBBF24",
  onWarning: "#3B2A05",
  error: "#F87171",
  onError: "#3B0A0A",
  info: "#60A5FA",
  onInfo: "#082247",

  border: "#1F2A44",
  borderStrong: "#334155",
  divider: "#1F2A44",
};

export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

// Optional in-app override (persisted separately). null = follow device.
let _override: ColorScheme | null = null;
const _listeners = new Set<() => void>();
export function setColorSchemeOverride(scheme: ColorScheme | null) {
  _override = scheme;
  _listeners.forEach((fn) => fn());
}
export function getColorSchemeOverride(): ColorScheme | null {
  return _override;
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const [, setTick] = useMemoState();
  const active: ColorScheme = _override ?? (system && themes[system] ? system : defaultScheme);
  // subscribe to overrides
  if (typeof setTick === "function") {
    // noop — subscription registered by hook below
  }
  return { scheme: active, colors: themes[active] ?? themes.light };
}

// tiny subscription helper without adding a dep
function useMemoState() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const fn = () => setN((v) => v + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return [n, setN] as const;
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

// Export a plain `colors` object for legacy consumers. Prefer useTheme() in components.
export const colors = light;
