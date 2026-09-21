import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { apiJson } from "@/src/api";

type Kind = "refill" | "follow_up" | "medication" | "other";
type R = {
  id: string; kind: Kind; title: string; note?: string; remind_at: string;
  completed: boolean; family_member_name?: string;
};

const KINDS: { key: Kind; label: string; icon: any }[] = [
  { key: "medication", label: "Medication", icon: "medkit" },
  { key: "refill", label: "Refill", icon: "reload-circle" },
  { key: "follow_up", label: "Follow-up", icon: "calendar" },
  { key: "other", label: "Other", icon: "star" },
];

function iso(d: Date) { return d.toISOString(); }

function fmtRelative(d: Date) {
  const diff = d.getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 7) return `In ${days} days`;
  if (days < -1 && days > -7) return `${-days} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function RemindersScreen() {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<R[]>([]);
  const [family, setFamily] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<Kind>("medication");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(1);
  const [forWhom, setForWhom] = useState<string>("self");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const [d, fam] = await Promise.all([
        apiJson<R[]>("/reminders"),
        apiJson<any[]>("/family").catch(() => []),
      ]);
      setItems(d);
      setFamily(fam || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setKind("medication"); setTitle(""); setNote(""); setDays(1); setForWhom("self"); setErr(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!title.trim()) { setErr("Title is required"); return; }
    setSaving(true); setErr(null);
    try {
      const remindAt = new Date();
      remindAt.setDate(remindAt.getDate() + days);
      remindAt.setHours(9, 0, 0, 0);
      await apiJson("/reminders", {
        method: "POST",
        body: JSON.stringify({
          kind, title: title.trim(), note: note.trim(),
          remind_at: iso(remindAt),
          family_member_id: forWhom === "self" ? undefined : forWhom,
        }),
      });
      setShowForm(false);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally { setSaving(false); }
  };

  const toggle = async (r: R) => {
    try { await apiJson(`/reminders/${r.id}`, { method: "PATCH" }); await load(); } catch {}
  };
  const remove = async (r: R) => {
    try { await apiJson(`/reminders/${r.id}`, { method: "DELETE" }); await load(); } catch {}
  };

  const grouped = { due: items.filter((r) => !r.completed), done: items.filter((r) => r.completed) };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="reminders-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Health Reminders</Text>
          <Text style={styles.sub}>Medication refills & follow-up nudges</Text>
        </View>
        <Pressable testID="add-reminder-btn" onPress={openAdd} style={styles.addBtn}>
          <Icon name="add" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#059669" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxxl }}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="notifications-outline" size={52} color="#CBD5E1" />
              <Text style={styles.emptyTxt}>No reminders yet</Text>
              <Text style={styles.emptySub}>Add gentle nudges to refill medicines or come back for a follow-up visit.</Text>
              <Pressable testID="empty-add-btn" onPress={openAdd} style={styles.emptyBtn}>
                <Icon name="add" size={16} color="#FFFFFF" />
                <Text style={styles.emptyBtnTxt}>Add first reminder</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {grouped.due.length > 0 && <Text style={styles.section}>Upcoming</Text>}
              {grouped.due.map((r) => (
                <RemCard key={r.id} r={r} onToggle={() => toggle(r)} onDelete={() => remove(r)} styles={styles} />
              ))}
              {grouped.done.length > 0 && <Text style={styles.section}>Completed</Text>}
              {grouped.done.map((r) => (
                <RemCard key={r.id} r={r} onToggle={() => toggle(r)} onDelete={() => remove(r)} styles={styles} />
              ))}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>New reminder</Text>
                <Pressable onPress={() => setShowForm(false)}>
                  <Icon name="close" size={22} color="#0F172A" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
                <Text style={styles.label}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {KINDS.map((k) => (
                    <Pressable
                      key={k.key}
                      testID={`kind-${k.key}`}
                      onPress={() => setKind(k.key)}
                      style={[styles.chip, kind === k.key && styles.chipActive, { flexShrink: 0 }]}
                    >
                      <Icon name={k.icon} size={13} color={kind === k.key ? "#FFFFFF" : "#334155"} />
                      <Text style={[styles.chipTxt, kind === k.key && styles.chipTxtActive]}>{k.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.label}>Title</Text>
                <TextInput
                  testID="rem-title"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Refill migraine drops"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />

                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  testID="rem-note"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Dosage, instructions…"
                  placeholderTextColor="#94A3B8"
                  multiline
                  style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                />

                <Text style={styles.label}>Remind me in</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {[1, 3, 7, 14, 30].map((d) => (
                    <Pressable
                      key={d}
                      testID={`days-${d}`}
                      onPress={() => setDays(d)}
                      style={[styles.chip, days === d && styles.chipActive]}
                    >
                      <Text style={[styles.chipTxt, days === d && styles.chipTxtActive]}>
                        {d === 1 ? "1 day" : d === 7 ? "1 week" : d === 30 ? "1 month" : `${d} days`}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {family.length > 0 && (
                  <>
                    <Text style={styles.label}>For</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      <Pressable
                        testID="rem-for-self"
                        onPress={() => setForWhom("self")}
                        style={[styles.chip, forWhom === "self" && styles.chipActive, { flexShrink: 0 }]}
                      >
                        <Text style={[styles.chipTxt, forWhom === "self" && styles.chipTxtActive]}>Myself</Text>
                      </Pressable>
                      {family.map((f) => (
                        <Pressable
                          key={f.id}
                          onPress={() => setForWhom(f.id)}
                          style={[styles.chip, forWhom === f.id && styles.chipActive, { flexShrink: 0 }]}
                        >
                          <Text style={[styles.chipTxt, forWhom === f.id && styles.chipTxtActive]}>{f.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                )}

                {err && <Text style={{ color: "#EF4444", fontSize: 13 }}>{err}</Text>}

                <Pressable
                  testID="save-reminder-btn"
                  onPress={save}
                  disabled={saving}
                  style={[styles.primary, saving && { opacity: 0.6 }]}
                >
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryTxt}>Save reminder</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function RemCard({ r, onToggle, onDelete, styles }: any) {
  const remindDate = new Date(r.remind_at);
  const overdue = !r.completed && remindDate.getTime() < Date.now();
  const iconName = r.kind === "refill" ? "reload-circle" : r.kind === "follow_up" ? "calendar" : r.kind === "medication" ? "medkit" : "star";
  return (
    <View style={[styles.card, r.completed && { opacity: 0.6 }]} testID={`rem-${r.id}`}>
      <Pressable onPress={onToggle} testID={`toggle-${r.id}`} style={[styles.check, r.completed && styles.checkOn]}>
        {r.completed && <Icon name="checkmark" size={14} color="#FFFFFF" />}
      </Pressable>
      <View style={styles.icon}>
        <Icon name={iconName as any} size={18} color="#059669" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rTitle, r.completed && { textDecorationLine: "line-through" }]} numberOfLines={1}>{r.title}</Text>
        <Text style={[styles.rMeta, overdue && { color: "#EF4444", fontWeight: "700" }]}>
          {overdue ? "Overdue • " : ""}{fmtRelative(remindDate)}
          {r.family_member_name ? ` • For ${r.family_member_name}` : ""}
        </Text>
        {r.note ? <Text style={styles.rNote} numberOfLines={2}>{r.note}</Text> : null}
      </View>
      <Pressable onPress={onDelete} testID={`del-${r.id}`} style={{ padding: 6 }}>
        <Icon name="trash-outline" size={16} color="#EF4444" />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontSize: 18, fontWeight: "700" },
  sub: { color: c.muted, fontSize: 12 },

  section: { color: c.onSurface, fontWeight: "700", fontSize: 14, marginTop: spacing.sm },

  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyTxt: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  emptySub: { color: c.muted, fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
  emptyBtn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: c.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radius.pill, marginTop: spacing.md },
  emptyBtnTxt: { color: c.onBrandPrimary, fontWeight: "700" },

  card: { flexDirection: "row", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, alignItems: "center" },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rTitle: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  rMeta: { color: c.muted, fontSize: 11, marginTop: 2 },
  rNote: { color: c.onSurfaceSecondary, fontSize: 12, marginTop: 4 },

  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  sheetTitle: { color: c.onSurface, fontWeight: "700", fontSize: 16 },

  label: { color: c.onSurface, fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 12, color: c.onSurface, borderWidth: 1, borderColor: c.border, fontSize: 14 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border,
  },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipTxt: { color: c.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  chipTxtActive: { color: c.onBrandPrimary },

  primary: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  primaryTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
}));
