import React from "react";
import { View, Text, Pressable, ScrollView, Linking } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { makeStyles, spacing, radius } from "@/src/theme";
import { useAuth } from "@/src/api";

export default function DoctorProfile() {
  const styles = useStyles();
  const { user, logout } = useAuth();
  const router = useRouter();

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
          <View style={{ marginTop: spacing.md, gap: 4 }}>
            {user?.email && <Text style={styles.row}><Icon name="mail" size={12} color="#64748B" />  {user.email}</Text>}
            {user?.phone && <Text style={styles.row}><Icon name="call" size={12} color="#64748B" />  {user.phone}</Text>}
          </View>
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
  row: { color: c.onSurfaceSecondary, fontSize: 13 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: c.error, padding: 14, marginTop: spacing.xl },
  logoutTxt: { color: c.error, fontWeight: "700" },
}));
