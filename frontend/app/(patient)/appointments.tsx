import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { apiJson } from "@/src/api";

type Tab = "upcoming" | "past";

export default function AppointmentsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await apiJson<any[]>("/appointments/mine");
      setItems(data);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = items.filter((a) => {
    const done = a.status === "completed" || a.status === "cancelled";
    return tab === "upcoming" ? !done : done;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "confirmed": return "#10B981";
      case "pending": return "#F59E0B";
      case "completed": return "#2563EB";
      case "cancelled": return "#EF4444";
      default: return "#64748B";
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="appointments-screen">
      <View style={styles.header}>
        <Text style={styles.title}>My Appointments</Text>
        <Pressable testID="book-new-btn" onPress={() => router.push("/book")} style={styles.newBtn}>
          <Icon name="add" size={16} color="#FFFFFF" />
          <Text style={styles.newBtnTxt}>New</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(["upcoming", "past"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            testID={`tab-${t}`}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === "upcoming" ? "Upcoming" : "Past"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="calendar-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyTxt}>No {tab} appointments</Text>
              <Pressable onPress={() => router.push("/book")} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnTxt}>Book your first consultation</Text>
              </Pressable>
            </View>
          ) : (
            filtered.map((a) => (
              <View key={a.id} style={styles.card} testID={`appt-${a.id}`}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctor}>{a.doctor_name}</Text>
                    <Text style={styles.date}>{a.date} • {a.time_slot}</Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: statusColor(a.status) + "22", borderColor: statusColor(a.status) }]}>
                    <Text style={[styles.chipTxt, { color: statusColor(a.status) }]}>{a.status}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <Icon name={a.mode === "online" ? "videocam" : "medkit"} size={14} color="#64748B" />
                  <Text style={styles.metaTxt}>{a.mode === "online" ? "Online Consultation" : "In-clinic Visit"}</Text>
                </View>
                {a.symptoms ? (
                  <Text style={styles.notes} numberOfLines={2}>
                    <Text style={styles.notesLbl}>Symptoms: </Text>{a.symptoms}
                  </Text>
                ) : null}
                {a.consultation_notes ? (
                  <View style={styles.replyBox}>
                    <Text style={styles.replyLbl}>Doctor&apos;s Notes</Text>
                    <Text style={styles.replyTxt}>{a.consultation_notes}</Text>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md,
  },
  title: { flex: 1, color: c.onSurface, fontSize: 20, fontWeight: "700" },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandPrimary,
    paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill,
  },
  newBtnTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  tabs: {
    flexDirection: "row", marginHorizontal: spacing.lg, backgroundColor: c.surfaceTertiary,
    borderRadius: radius.pill, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.pill },
  tabActive: { backgroundColor: c.surface, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4 },
  tabTxt: { color: c.muted, fontSize: 13, fontWeight: "600" },
  tabTxtActive: { color: c.brandPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.md },
  emptyTxt: { color: c.muted, fontSize: 14 },
  emptyBtn: { backgroundColor: c.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radius.pill },
  emptyBtnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center" },
  doctor: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  date: { color: c.muted, fontSize: 12, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  chipTxt: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaTxt: { color: c.onSurfaceSecondary, fontSize: 12 },
  notes: { color: c.onSurfaceSecondary, fontSize: 12 },
  notesLbl: { fontWeight: "700" },
  replyBox: { backgroundColor: c.brandTertiary, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs },
  replyLbl: { color: c.onBrandTertiary, fontSize: 11, fontWeight: "700", marginBottom: 2 },
  replyTxt: { color: c.onBrandTertiary, fontSize: 12 },
}));
