import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput } from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { SafeAreaView } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { apiJson } from "@/src/api";

export default function DoctorPatients() {
  const styles = useStyles();
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await apiJson<any[]>("/doctor/patients");
      setItems(data);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (p: any) => {
    setSelected(p); setDetail(null);
    try {
      const d = await apiJson(`/doctor/patients/${p.user_id}`);
      setDetail(d);
    } catch {}
  };

  const replyToFile = async (fileId: string, reply: string) => {
    await apiJson(`/files/${fileId}/reply`, { method: "PATCH", body: JSON.stringify({ doctor_reply: reply }) });
    if (selected) openDetail(selected);
  };

  const filtered = q
    ? items.filter((p) => (p.name || "").toLowerCase().includes(q.toLowerCase()) || (p.uhid || "").includes(q))
    : items;

  if (selected) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.detailHead}>
          <Pressable testID="back-btn" onPress={() => { setSelected(null); setDetail(null); }} style={{ padding: 6 }}>
            <Icon name="arrow-back" size={22} color="#0F172A" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailName}>{selected.name}</Text>
            <Text style={styles.detailMeta}>
              {selected.uhid || "No UHID"} • {selected.phone || selected.email || ""}
            </Text>
            {selected.address ? (
              <Text style={styles.detailMeta}>📍 {selected.address}</Text>
            ) : null}
          </View>
        </View>
        {!detail ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#059669" />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
            <Text style={styles.section}>Appointments ({detail.appointments.length})</Text>
            {detail.appointments.length === 0 ? (
              <Text style={styles.muted}>No appointments</Text>
            ) : detail.appointments.map((a: any) => (
              <View key={a.id} style={styles.item}>
                <Text style={styles.itemTitle}>{a.date} • {a.time_slot}</Text>
                <Text style={styles.itemMeta}>{a.mode} • {a.status}</Text>
                {a.family_member_name ? (
                  <Text style={styles.itemFam}>👤 For {a.family_member_name} ({a.family_member_relation})</Text>
                ) : null}
                {a.symptoms ? <Text style={styles.itemSym}>{a.symptoms}</Text> : null}
              </View>
            ))}

            {detail.family_members && detail.family_members.length > 0 && (
              <>
                <Text style={styles.section}>Family Members ({detail.family_members.length})</Text>
                {detail.family_members.map((f: any) => (
                  <View key={f.id} style={styles.item}>
                    <Text style={styles.itemTitle}>{f.name} <Text style={styles.itemMeta}>({f.relation})</Text></Text>
                    <Text style={styles.itemMeta}>
                      UHID: {f.uhid}{f.age ? ` • ${f.age}y` : ""}{f.gender ? ` • ${f.gender}` : ""}{f.blood_group ? ` • ${f.blood_group}` : ""}
                    </Text>
                    {f.allergies ? <Text style={styles.itemSym}><Text style={{ fontWeight: "700" }}>Allergies: </Text>{f.allergies}</Text> : null}
                  </View>
                ))}
              </>
            )}

            <Text style={styles.section}>Uploaded Records ({detail.files.length})</Text>
            {detail.files.length === 0 ? (
              <Text style={styles.muted}>No uploads</Text>
            ) : detail.files.map((f: any) => (
              <FileRow key={f.id} file={f} onReply={(r) => replyToFile(f.id, r)} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="doctor-patients">
      <View style={styles.header}>
        <Text style={styles.title}>Patients</Text>
        <View style={styles.search}>
          <Icon name="search" size={16} color="#64748B" />
          <TextInput
            testID="search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Search by name or UHID"
            style={styles.searchInput}
            placeholderTextColor="#94A3B8"
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#059669" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="people-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyTxt}>No patients yet</Text>
            </View>
          ) : filtered.map((p) => (
            <Pressable key={p.user_id} testID={`patient-${p.user_id}`} onPress={() => openDetail(p)} style={styles.card}>
              <View style={styles.pAvatar}>
                <Icon name="person" size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pName}>{p.name}</Text>
                <Text style={styles.pMeta}>{p.uhid || "No UHID"}</Text>
                <View style={styles.pBadges}>
                  <Text style={styles.badge}>{p.appointments_count} visits</Text>
                  <Text style={styles.badge}>{p.files_count} files</Text>
                </View>
              </View>
              <Icon name="chevron-forward" size={22} color="#94A3B8" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FileRow({ file, onReply }: { file: any; onReply: (reply: string) => Promise<void> }) {
  const styles = useStyles();
  const [reply, setReply] = useState(file.doctor_reply || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <View style={styles.item}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={file.content_type?.includes("pdf") ? "document-text" : "image"} size={18} color="#059669" />
        <Text style={styles.itemTitle}>{file.filename}</Text>
      </View>
      <Text style={styles.itemMeta}>
        {file.category.replace("_", " ")} • {new Date(file.created_at).toLocaleDateString()}
      </Text>
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextInput
            testID={`reply-input-${file.id}`}
            value={reply}
            onChangeText={setReply}
            placeholder="Write reply / prescription"
            multiline
            style={styles.replyArea}
            placeholderTextColor="#94A3B8"
          />
          <Pressable
            testID={`send-reply-${file.id}`}
            onPress={async () => { setSaving(true); await onReply(reply); setSaving(false); setEditing(false); }}
            style={styles.sendBtn}
          >
            <Text style={styles.sendBtnTxt}>{saving ? "Saving..." : "Send Reply"}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {file.doctor_reply ? (
            <View style={styles.replyDone}>
              <Text style={styles.replyDoneLbl}>Your Reply</Text>
              <Text style={styles.replyDoneTxt}>{file.doctor_reply}</Text>
            </View>
          ) : null}
          <Pressable testID={`edit-reply-${file.id}`} onPress={() => setEditing(true)} style={styles.editBtn}>
            <Icon name="chatbubble" size={12} color="#2563EB" />
            <Text style={styles.editBtnTxt}>{file.doctor_reply ? "Edit reply" : "Reply to patient"}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  header: { padding: spacing.lg, gap: spacing.sm },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "700" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 12, color: c.onSurface, fontSize: 14 },

  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyTxt: { color: c.muted },

  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  pAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  pName: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  pMeta: { color: c.muted, fontSize: 11, marginTop: 2 },
  pBadges: { flexDirection: "row", gap: 6, marginTop: 6 },
  badge: { backgroundColor: c.brandTertiary, color: c.onBrandTertiary, fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },

  detailHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  detailName: { color: c.onSurface, fontWeight: "700", fontSize: 17 },
  detailMeta: { color: c.muted, fontSize: 12, marginTop: 2 },

  section: { color: c.onSurface, fontWeight: "700", fontSize: 14, marginTop: spacing.sm },
  muted: { color: c.muted, fontSize: 13 },
  item: { backgroundColor: c.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, gap: 4 },
  itemTitle: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  itemMeta: { color: c.muted, fontSize: 11 },
  itemFam: { color: c.onBrandTertiary, fontSize: 11, fontWeight: "700", backgroundColor: c.brandTertiary, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 4 },
  itemSym: { color: c.onSurfaceSecondary, fontSize: 12, marginTop: 4 },

  replyArea: { minHeight: 60, backgroundColor: c.surface, borderRadius: radius.md, padding: 10, color: c.onSurface, textAlignVertical: "top", borderWidth: 1, borderColor: c.border },
  sendBtn: { backgroundColor: c.brandPrimary, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  sendBtnTxt: { color: c.onBrandPrimary, fontWeight: "700" },

  replyDone: { backgroundColor: "#EFF6FF", padding: spacing.sm, borderRadius: radius.sm, marginTop: 4 },
  replyDoneLbl: { color: "#1D4ED8", fontSize: 11, fontWeight: "700" },
  replyDoneTxt: { color: "#1E3A8A", fontSize: 12, marginTop: 2 },

  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 6 },
  editBtnTxt: { color: c.brandSecondary, fontSize: 12, fontWeight: "700" },
}));
