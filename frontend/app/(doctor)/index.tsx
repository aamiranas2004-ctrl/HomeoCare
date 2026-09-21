import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { apiJson, useAuth } from "@/src/api";
import { ClinicLogo } from "@/src/components/clinic-logo";

const DOCTOR_PHOTO =
  "https://agrawalhomeohall.com/wp-content/uploads/2026/06/ChatGPT-Image-Jun-23-2026-11_17_26-AM-682x1024.png";

export default function DoctorQueue() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const load = async () => {
    try {
      const [data, u] = await Promise.all([
        apiJson<any[]>("/appointments/mine"),
        apiJson<Record<string, number>>("/chat/unread").catch(() => ({})),
      ]);
      setItems(data);
      setUnread(u || {});
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const saveNotes = async (id: string, status: string | undefined) => {
    try {
      await apiJson(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ consultation_notes: noteDraft, status }),
      });
      setEditingId(null);
      setNoteDraft("");
      await load();
    } catch {}
  };

  const waiting = items.filter((a) => a.status === "pending" || a.status === "confirmed").length;
  const completed = items.filter((a) => a.status === "completed").length;

  return (
    <View style={styles.safe} testID="doctor-queue">
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "transparent" }}>
        <LinearGradient
          colors={["#065F46", "#059669", "#10B981"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.brandStrip}
        >
          <View style={styles.brandRow}>
            <ClinicLogo size={40} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.brandName}>Agrawal Homeo Hall</Text>
              <Text style={styles.brandTagline}>Doctor Console · Ranchi</Text>
            </View>
            <Pressable
              testID="profile-btn"
              onPress={() => router.push("/(doctor)/profile")}
              style={styles.avatarBtn}
            >
              <Image source={{ uri: DOCTOR_PHOTO }} style={styles.avatarImg} contentFit="cover" contentPosition={{ top: "12%" }} />
            </Pressable>
          </View>

          <View style={styles.greetRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hi}>Welcome back,</Text>
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.credentials}>
                {user?.qualification || "BHMS"} • {user?.specialization || "Homeopathic Physician"}
              </Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statN}>{waiting}</Text>
                <Text style={styles.statL}>Waiting</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statN}>{completed}</Text>
                <Text style={styles.statL}>Done</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          <Text style={styles.section}>Today&apos;s Queue</Text>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="calendar-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyTxt}>No appointments yet</Text>
            </View>
          ) : (
            items.map((a) => (
              <View key={a.id} style={styles.card} testID={`appt-${a.id}`}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName}>{a.patient_name}</Text>
                    <Text style={styles.pMeta}>
                      {a.patient_uhid || "No UHID"} • {a.date} • {a.time_slot}
                    </Text>
                    {a.family_member_name ? (
                      <Text style={styles.pFam}>For {a.family_member_name} ({a.family_member_relation})</Text>
                    ) : null}
                  </View>
                  <View style={[styles.chip, {
                    backgroundColor: a.status === "completed" ? "#DBEAFE" : a.status === "confirmed" ? "#D1FAE5" : "#FEF3C7",
                  }]}>
                    <Text style={[styles.chipTxt, {
                      color: a.status === "completed" ? "#1D4ED8" : a.status === "confirmed" ? "#065F46" : "#92400E",
                    }]}>{a.status}</Text>
                  </View>
                </View>
                {a.symptoms ? (
                  <Text style={styles.sym}><Text style={styles.symLbl}>Symptoms: </Text>{a.symptoms}</Text>
                ) : null}
                {a.consultation_notes && editingId !== a.id ? (
                  <View style={styles.notes}>
                    <Text style={styles.notesLbl}>Consultation Notes</Text>
                    <Text style={styles.notesTxt}>{a.consultation_notes}</Text>
                  </View>
                ) : null}

                {editingId === a.id ? (
                  <View style={{ gap: spacing.sm }}>
                    <TextInput
                      testID={`notes-input-${a.id}`}
                      value={noteDraft}
                      onChangeText={setNoteDraft}
                      placeholder="Add consultation notes / prescription details"
                      multiline
                      style={styles.textArea}
                      placeholderTextColor="#94A3B8"
                    />
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <Pressable
                        testID={`save-notes-${a.id}`}
                        onPress={() => saveNotes(a.id, "completed")}
                        style={styles.saveBtn}
                      >
                        <Text style={styles.saveBtnTxt}>Save & Mark Completed</Text>
                      </Pressable>
                      <Pressable onPress={() => { setEditingId(null); setNoteDraft(""); }} style={styles.cancelBtn}>
                        <Text style={styles.cancelBtnTxt}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Pressable
                      testID={`consult-${a.id}`}
                      onPress={() => { setEditingId(a.id); setNoteDraft(a.consultation_notes || ""); }}
                      style={styles.consultBtn}
                    >
                      <Icon name="create" size={14} color="#FFFFFF" />
                      <Text style={styles.consultTxt}>
                        {a.consultation_notes ? "Edit Notes" : "Add Consultation Notes"}
                      </Text>
                    </Pressable>
                    {a.status === "pending" && (
                      <Pressable
                        testID={`confirm-${a.id}`}
                        onPress={async () => {
                          await apiJson(`/appointments/${a.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ consultation_notes: a.consultation_notes || "", status: "confirmed" }),
                          });
                          load();
                        }}
                        style={styles.confirmBtn}
                      >
                        <Text style={styles.confirmTxt}>Confirm</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <Pressable
                  testID={`chat-${a.id}`}
                  onPress={() => router.push(`/chat/${a.id}` as any)}
                  style={styles.chatBtn}
                >
                  <Icon name="chatbubbles" size={14} color="#FFFFFF" />
                  <Text style={styles.chatBtnTxt}>
                    Chat with patient
                    {unread[a.id] ? `  •  ${unread[a.id]} new` : ""}
                  </Text>
                  {unread[a.id] ? <View style={styles.dot} /> : null}
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  brandStrip: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandName: { color: "#FFFFFF", fontWeight: "800", fontSize: 16, letterSpacing: -0.2 },
  brandTagline: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  avatarBtn: {
    width: 48, height: 48, borderRadius: 24, overflow: "hidden",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "#FFFFFF",
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  greetRow: {
    marginTop: spacing.lg,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    borderRadius: radius.lg, padding: spacing.md,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  hi: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  name: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 2 },
  credentials: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statBox: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center",
    minWidth: 60, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  statN: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  statL: { color: "rgba(255,255,255,0.85)", fontSize: 10 },

  section: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyTxt: { color: c.muted },

  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center" },
  pName: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  pMeta: { color: c.muted, fontSize: 11, marginTop: 2 },
  pFam: { color: c.onBrandTertiary, fontSize: 10, fontWeight: "700", backgroundColor: c.brandTertiary, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 4, textTransform: "capitalize" },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  chipTxt: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },

  sym: { color: c.onSurfaceSecondary, fontSize: 12 },
  symLbl: { fontWeight: "700" },

  notes: { backgroundColor: "#EFF6FF", padding: spacing.sm, borderRadius: radius.sm },
  notesLbl: { color: "#1D4ED8", fontSize: 11, fontWeight: "700" },
  notesTxt: { color: "#1E3A8A", fontSize: 12, marginTop: 2 },

  textArea: {
    minHeight: 80, backgroundColor: c.surface, borderRadius: radius.md,
    padding: spacing.md, color: c.onSurface, textAlignVertical: "top", borderWidth: 1, borderColor: c.border,
  },
  saveBtn: { flex: 1, backgroundColor: c.brandPrimary, paddingVertical: 12, borderRadius: radius.pill, alignItems: "center" },
  saveBtnTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
  cancelBtnTxt: { color: c.onSurfaceSecondary, fontWeight: "600" },

  consultBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, backgroundColor: c.brandSecondary, paddingVertical: 10, borderRadius: radius.pill },
  consultTxt: { color: c.onBrandSecondary, fontWeight: "700", fontSize: 12 },
  confirmBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: c.brandPrimary },
  confirmTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  chatBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: c.brandSecondary, borderRadius: radius.pill, paddingVertical: 10,
  },
  chatBtnTxt: { color: c.onBrandSecondary, fontSize: 12, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
}));
