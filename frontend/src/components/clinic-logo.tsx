/**
 * Agrawal Homeo Hall — clinic logo monogram.
 * Composed from React Native primitives (no SVG dep). Renders a green
 * medallion with an "A" mark, a leaf accent (for homeopathy), and an
 * optional wordmark below.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/src/theme";

type Props = {
  size?: number;
  showWordmark?: boolean;
  variant?: "light" | "dark"; // "light" = white text (for dark bg)
  compact?: boolean;
};

export function ClinicLogo({ size = 72, showWordmark = false, variant = "light", compact = false }: Props) {
  const { colors } = useTheme();
  const onDark = variant === "light";
  const monogramFontSize = Math.round(size * 0.44);
  const badgeSize = Math.round(size * 0.32);

  return (
    <View style={[styles.wrap, compact && { flexDirection: "row", alignItems: "center", gap: 10 }]}>
      <View
        style={[
          styles.medallion,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <LinearGradient
          colors={["#10B981", "#059669", "#065F46"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            StyleSheet.absoluteFillObject,
            { borderRadius: size / 2 },
          ]}
        />
        <View
          style={[
            styles.innerRing,
            { width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 },
          ]}
        />
        <Text
          style={[
            styles.monogram,
            { fontSize: monogramFontSize, lineHeight: monogramFontSize * 1.02 },
          ]}
        >
          A
        </Text>
        <View
          style={[
            styles.leafBadge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              right: -badgeSize * 0.15,
              bottom: -badgeSize * 0.05,
            },
          ]}
        >
          <Icon name="leaf" size={Math.round(badgeSize * 0.55)} color="#FFFFFF" />
        </View>
      </View>

      {showWordmark && (
        <View style={compact ? { alignItems: "flex-start" } : { alignItems: "center", marginTop: 12 }}>
          <Text style={[styles.wordmark, { color: onDark ? "#FFFFFF" : colors.onSurface }]}>
            Agrawal <Text style={[styles.wordmarkAccent, { color: onDark ? "#D1FAE5" : colors.brandPrimary }]}>Homeo Hall</Text>
          </Text>
          <Text
            style={[
              styles.wordmarkSub,
              { color: onDark ? "rgba(255,255,255,0.75)" : colors.muted },
            ]}
          >
            Personalized homeopathic care · Since 2010
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  medallion: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    shadowColor: "#065F46",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  innerRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
  },
  monogram: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: -1,
    textShadowColor: "rgba(0,0,0,0.15)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontFamily: undefined,
  },
  leafBadge: {
    position: "absolute",
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  wordmarkAccent: {
    fontWeight: "800",
  },
  wordmarkSub: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
