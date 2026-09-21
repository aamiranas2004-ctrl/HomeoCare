import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, Linking, TextInput } from "react-native";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { makeStyles, spacing, radius } from "@/src/theme";
import { useAuth } from "@/src/api";

export default function ProfileScreen() {
  const styles = useStyles();
  const { user, logout, updateRole } = useAuth();
  const router = useRouter();
  const [addrDraft, setAddrDraft] = useState("");
  const [savingAddr, setSavingAddr] = useState(false);

  const saveAddress = async () => {
    if (!addrDraft.trim()) return;
    setSavingAddr(true);
    try {
      await updateRole("patient", { address: addrDraft.trim() });
    } catch {} finally {
      setSavingAddr(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="profile-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={{ width: 72, height: 72, borderRadius: 36 }} />
            ) : (
              <Icon name="person" size={32} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.name}>{user?.name || "—"}</Text>
          {user?.uhid && (
            <View style={styles.uhidBadge}>
              <Icon name="finger-print" size={12} color="#065F46" />
              <Text style={styles.uhidTxt}>UHID: {user.uhid}</Text>
            </View>
          )}
          <View style={{ marginTop: spacing.md, alignSelf: "stretch" }}>
            {user?.email && <Row icon="mail" value={user.email} />}
            {user?.phone && <Row icon="call" value={user.phone} />}
            {user?.address ? (
              <Row icon="location" value={user.address} />
            ) : (
              <View style={styles.addrWrap} testID="address-edit">
                <Icon name="location" size={14} color="#64748B" />
                <TextInput
                  testID="address-input"
                  value={addrDraft}
                  onChangeText={setAddrDraft}
                  placeholder="Add your address"
                  placeholderTextColor="#94A3B8"
                  style={styles.addrInput}
                />
                <Pressable
                  testID="save-address-btn"
                  onPress={saveAddress}
                  disabled={savingAddr || !addrDraft.trim()}
                  style={[styles.addrSave, (!addrDraft.trim() || savingAddr) && { opacity: 0.5 }]}
                >
                  <Text style={styles.addrSaveTxt}>Save</Text>
                </Pressable>
              </View>
            )}
            <Row icon="person-circle" value={`Role: ${user?.role || "patient"}`} />
          </View>
        </View>

        <Text style={styles.section}>Family</Text>
        <Pressable
          testID="family-btn"
          style={styles.linkRow}
          onPress={() => router.push("/family")}
        >
          <Icon name="people" size={18} color="#059669" />
          <Text style={styles.linkTxt}>Family Profiles</Text>
          <Icon name="chevron-forward" size={18} color="#94A3B8" style={{ marginLeft: "auto" }} />
        </Pressable>

        <Text style={styles.section}>Clinic</Text>
        <Pressable
          testID="call-clinic-btn"
          style={styles.linkRow}
          onPress={() => Linking.openURL("tel:+917294136264")}
        >
          <Icon name="call" size={18} color="#059669" />
          <Text style={styles.linkTxt}>Call Clinic (+91 72941 36264)</Text>
        </Pressable>
        <Pressable
          testID="whatsapp-btn"
          style={styles.linkRow}
          onPress={() => Linking.openURL("https://wa.me/917294136264")}
        >
          <Icon name="logo-whatsapp" size={18} color="#059669" />
          <Text style={styles.linkTxt}>WhatsApp Consultation</Text>
        </Pressable>
        <Pressable
          testID="website-btn"
          style={styles.linkRow}
          onPress={() => Linking.openURL("https://agrawalhomeohall.com")}
        >
          <Icon name="globe" size={18} color="#059669" />
          <Text style={styles.linkTxt}>Visit Website</Text>
        </Pressable>

        <Pressable
          testID="logout-btn"
          style={styles.logout}
          onPress={async () => {
            await logout();
            router.replace("/(auth)/login");
          }}
        >
          <Icon name="log-out" size={18} color="#EF4444" />
          <Text style={styles.logoutTxt}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, value }: { icon: any; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Icon name={icon} size={14} color="#64748B" />
      <Text style={styles.rowTxt}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  card: {
    backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl,
    alignItems: "center", borderWidth: 1, borderColor: c.border,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandPrimary,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  name: { color: c.onSurface, fontSize: 18, fontWeight: "700", marginTop: spacing.md },
  uhidBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandTertiary,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginTop: 6,
  },
  uhidTxt: { color: c.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  rowTxt: { color: c.onSurfaceSecondary, fontSize: 13 },
  addrWrap: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6,
    backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
    paddingLeft: 10, paddingRight: 6, paddingVertical: 4,
  },
  addrInput: { flex: 1, color: c.onSurface, fontSize: 13, paddingVertical: 8 },
  addrSave: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  addrSaveTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  section: { color: c.onSurface, fontWeight: "700", fontSize: 14, marginTop: spacing.md },
  linkRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: c.border,
  },
  linkTxt: { color: c.onSurface, fontWeight: "600" },
  logout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: c.error, padding: 14, marginTop: spacing.xl,
  },
  logoutTxt: { color: c.error, fontWeight: "700" },
}));
