/**
 * Agrawal Homeo Hall — official logo.
 * Uses the print-ready PNG shipped by the clinic. When `showWordmark` is true
 * the full logo is used; otherwise the icon-only mark (square crop).
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";

const LOGO = require("../../assets/images/clinic-logo.png");

type Props = {
  size?: number;
  showWordmark?: boolean;
  variant?: "light" | "dark"; // kept for API compatibility (background is not tinted)
  compact?: boolean;          // kept for API compatibility
};

export function ClinicLogo({ size = 48, showWordmark = false }: Props) {
  if (showWordmark) {
    // Full lockup (icon + wordmark + tagline). Aspect ~ 3:2.
    return (
      <View style={[styles.wrap, { width: size * 3.5, height: size * 1.8 }]}>
        <Image
          source={LOGO}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
        />
      </View>
    );
  }
  // Icon-only crop (square). The PNG contains generous padding; we render the
  // whole logo in a circular container so the mark reads well at small sizes.
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={LOGO}
        style={{ width: size * 1.35, height: size * 1.35, marginLeft: -size * 0.85 }}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  badge: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#065F46",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
});
