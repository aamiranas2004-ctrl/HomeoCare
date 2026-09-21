import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Switch } from "react-native";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { makeStyles, spacing, radius, setColorSchemeOverride, getColorSchemeOverride, useTheme } from "@/src/theme";
import { useAuth } from "@/src/api";

const DARK_KEY = "ahh_theme_override"; // "dark" | "light" | null

export default function DoctorProfile() {
  const styles = useStyles();
  const { user, logout } = useAuth();
  const router = useRouter();
  const { scheme } = useTheme();
  const [dark, setDark] = useState(scheme === "dark");

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(DARK_KEY);
        if (stored === "dark" || stored === "light") {
          setColorSchemeOverride(stored);
          setDark(stored === "dark");
        }
      } catch {}
    })();
  }, []);

  const toggleDark = async (val: boolean) => {
    setDark(val);
    const next = val ? "dark" : "light";
    setColorSchemeOverride(next);
    try {
      await SecureStore.setItemAsync(DARK_KEY, next);
    } catch {}
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="doctor-profile">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Icon name="medical" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.name}>{user?.name || "—"}</Text>
          <Text style={styles.meta}>
            {user?.qualification || "BHMS"} • {user?.specialization || "Homeopathic Physician"}
          </Text>
        </View>

        <View style={styles.settingCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Dark Mode</Text>
            <Text style={styles.settingSub}>Easier on the eyes for night consultations</Text>
          </View>
          <Switch
            testID="dark-mode-toggle"
            value={dark}
            onValueChange={toggleDark}
            trackColor={{ false: "#94A3B8", true: "#059669" }}
            thumbColor="#FFFFFF"
          />
        </View>

        <Pressable
          testID="logout-btn"
          onPress={async () => { await logout(); router.replace("/(auth)/login"); }}
          style={styles.logout}
        >
          <Icon name="log-out" size={18} color="#EF4444" />
          <Text style={styles.logoutTxt}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: c.border },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontSize: 18, fontWeight: "700", marginTop: spacing.md },
  meta: { color: c.muted, fontSize: 13, marginTop: 4 },
  settingCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: c.border,
  },
  settingTitle: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  settingSub: { color: c.muted, fontSize: 12, marginTop: 2 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: c.error, padding: 14, marginTop: spacing.xl },
  logoutTxt: { color: c.error, fontWeight: "700" },
}));
