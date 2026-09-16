import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TextInput, Pressable, RefreshControl } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { makeStyles, spacing, radius } from "@/src/theme";
import { apiJson } from "@/src/api";

export default function DoctorRecords() {
  const styles = useStyles();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = async () => {
    try { setItems(await apiJson<any[]>("/files/mine")); } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const sendReply = async (id: string) => {
    const val = editing[id] || "";
    if (!val.trim()) return;
    await apiJson(`/files/${id}/reply`, { method: "PATCH", body: JSON.stringify({ doctor_reply: val }) });
    setEditing((e) => ({ ...e, [id]: "" }));
    load();
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="doctor-records">
      <View style={styles.header}>
        <Text style={styles.title}>All Patient Records</Text>
        <Text style={styles.sub}>Prescriptions & test results pending review</Text>
      </View>
      {loading ? <ActivityIndicator color="#059669" style={{ marginTop: 40 }} /> : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="folder-open-outline" size={48} color="#CBD5E1" />
              <Text style={{ color: "#64748B" }}>No records</Text>
            </View>
          ) : items.map((f) => (
            <View key={f.id} style={styles.card} testID={`rec-${f.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.icon}>
                  <Icon name={f.content_type?.includes("pdf") ? "document-text" : "image"} size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{f.patient_name} <Text style={styles.uhid}>({f.patient_uhid || "no uhid"})</Text></Text>
                  <Text style={styles.meta}>
                    {f.family_member_name ? `For ${f.family_member_name} (${f.family_member_relation}) • ` : ""}
                    {f.filename} • {f.category.replace("_", " ")}
                  </Text>
                </View>
                <View style={[styles.chip, { backgroundColor: f.status === "reviewed" ? "#DBEAFE" : "#FEF3C7" }]}>
                  <Text style={[styles.chipTxt, { color: f.status === "reviewed" ? "#1D4ED8" : "#92400E" }]}>{f.status.replace("_", " ")}</Text>
                </View>
              </View>
              {f.doctor_reply ? (
                <View style={styles.doneBox}>
                  <Text style={styles.doneLbl}>Your reply</Text>
                  <Text style={styles.doneTxt}>{f.doctor_reply}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  testID={`reply-${f.id}`}
                  placeholder={f.doctor_reply ? "Update reply" : "Write reply to patient"}
                  value={editing[f.id] ?? ""}
                  onChangeText={(t) => setEditing((e) => ({ ...e, [f.id]: t }))}
                  style={styles.input}
                  placeholderTextColor="#94A3B8"
                />
                <Pressable testID={`send-${f.id}`} onPress={() => sendReply(f.id)} style={styles.send}>
                  <Icon name="send" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  header: { padding: spacing.lg, paddingBottom: 0 },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "700" },
  sub: { color: c.muted, fontSize: 13, marginTop: 2 },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  uhid: { color: c.muted, fontWeight: "500", fontSize: 11 },
  meta: { color: c.muted, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  chipTxt: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  doneBox: { backgroundColor: "#EFF6FF", padding: 10, borderRadius: radius.sm },
  doneLbl: { color: "#1D4ED8", fontSize: 11, fontWeight: "700" },
  doneTxt: { color: "#1E3A8A", fontSize: 12, marginTop: 2 },
  input: { flex: 1, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: c.onSurface, borderWidth: 1, borderColor: c.border },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
