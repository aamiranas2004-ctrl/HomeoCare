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

type Member = {
  id: string;
  name: string;
  relation: "self" | "spouse" | "child" | "parent" | "sibling" | "other";
  age?: number;
  gender?: "male" | "female" | "other";
  blood_group?: string;
  allergies?: string;
  uhid: string;
};

const RELATIONS: Member["relation"][] = ["spouse", "child", "parent", "sibling", "other"];
const GENDERS: NonNullable<Member["gender"]>[] = ["male", "female", "other"];
const BLOOD = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

function relationIcon(r: Member["relation"]): any {
  return r === "spouse" ? "heart" : r === "child" ? "happy" : r === "parent" ? "people" : r === "sibling" ? "person" : "person-add";
}

export default function FamilyScreen() {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<Member["relation"]>("child");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Member["gender"]>("male");
  const [blood, setBlood] = useState("");
  const [allergies, setAllergies] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await apiJson<Member[]>("/family");
      setItems(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setName(""); setRelation("child"); setAge(""); setGender("male"); setBlood(""); setAllergies("");
    setErr(null);
    setShowForm(true);
  };

  const openEdit = (m: Member) => {
    setEditing(m);
    setName(m.name);
    setRelation(m.relation);
    setAge(m.age ? String(m.age) : "");
    setGender(m.gender || "male");
    setBlood(m.blood_group || "");
    setAllergies(m.allergies || "");
    setErr(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr(null);
    try {
      const body: any = {
        name: name.trim(),
        relation,
        gender,
        blood_group: blood || undefined,
        allergies: allergies.trim() || undefined,
      };
      if (age) body.age = Number(age);
      if (editing) {
        await apiJson(`/family/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiJson("/family", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally { setSaving(false); }
  };

  const remove = async (m: Member) => {
    try {
      await apiJson(`/family/${m.id}`, { method: "DELETE" });
      await load();
    } catch {}
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="family-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Family Profiles</Text>
          <Text style={styles.subtitle}>Manage records for your loved ones</Text>
        </View>
        <Pressable testID="add-family-btn" onPress={openAdd} style={styles.addBtn}>
          <Icon name="add" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxxl }}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="people-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTxt}>No family members added yet</Text>
              <Text style={styles.emptySub}>Add your spouse, kids, parents to book appointments and store their records here.</Text>
              <Pressable testID="empty-add-btn" onPress={openAdd} style={styles.emptyBtn}>
                <Icon name="add" size={16} color="#FFFFFF" />
                <Text style={styles.emptyBtnTxt}>Add first member</Text>
              </Pressable>
            </View>
          ) : items.map((m) => (
            <View key={m.id} style={styles.card} testID={`family-${m.id}`}>
              <View style={styles.avatar}>
                <Icon name={relationIcon(m.relation)} size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.relation}>
                  {m.relation.charAt(0).toUpperCase() + m.relation.slice(1)}
                  {m.age ? ` • ${m.age}y` : ""}
                  {m.gender ? ` • ${m.gender}` : ""}
                </Text>
                <View style={styles.uhidRow}>
                  <Icon name="finger-print" size={11} color="#065F46" />
                  <Text style={styles.uhid}>{m.uhid}</Text>
                  {m.blood_group ? (
                    <View style={styles.bloodChip}>
                      <Text style={styles.bloodTxt}>{m.blood_group}</Text>
                    </View>
                  ) : null}
                </View>
                {m.allergies ? (
                  <Text style={styles.allergy} numberOfLines={2}>
                    <Text style={{ fontWeight: "700" }}>Allergies: </Text>{m.allergies}
                  </Text>
                ) : null}
              </View>
              <View style={{ gap: 6 }}>
                <Pressable testID={`edit-${m.id}`} onPress={() => openEdit(m)} style={styles.rowBtn}>
                  <Icon name="create-outline" size={18} color="#2563EB" />
                </Pressable>
                <Pressable testID={`delete-${m.id}`} onPress={() => remove(m)} style={styles.rowBtn}>
                  <Icon name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>{editing ? "Edit member" : "Add family member"}</Text>
                <Pressable onPress={() => setShowForm(false)} testID="close-modal-btn">
                  <Icon name="close" size={22} color="#0F172A" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.md }} keyboardShouldPersistTaps="handled">
                <Field label="Full Name">
                  <TextInput
                    testID="form-name"
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Priya Sharma"
                    style={styles.input}
                    placeholderTextColor="#94A3B8"
                  />
                </Field>

                <Field label="Relation">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {RELATIONS.map((r) => (
                      <Pressable
                        key={r}
                        testID={`rel-${r}`}
                        onPress={() => setRelation(r)}
                        style={[styles.chip, relation === r && styles.chipActive, { flexShrink: 0 }]}
                      >
                        <Icon name={relationIcon(r)} size={12} color={relation === r ? "#FFFFFF" : "#334155"} />
                        <Text style={[styles.chipTxt, relation === r && styles.chipTxtActive]}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Field>

                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Field label="Age" style={{ flex: 1 }}>
                    <TextInput
                      testID="form-age"
                      value={age}
                      onChangeText={(t) => setAge(t.replace(/\D/g, ""))}
                      placeholder="e.g. 12"
                      keyboardType="number-pad"
                      style={styles.input}
                      maxLength={3}
                      placeholderTextColor="#94A3B8"
                    />
                  </Field>
                  <Field label="Gender" style={{ flex: 2 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {GENDERS.map((g) => (
                        <Pressable
                          key={g}
                          testID={`gen-${g}`}
                          onPress={() => setGender(g)}
                          style={[styles.chip, gender === g && styles.chipActive, { flex: 1, justifyContent: "center" }]}
                        >
                          <Text style={[styles.chipTxt, gender === g && styles.chipTxtActive]}>
                            {g.charAt(0).toUpperCase() + g.slice(1)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </Field>
                </View>

                <Field label="Blood Group (optional)">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {["", ...BLOOD].map((b) => (
                      <Pressable
                        key={b || "none"}
                        testID={`blood-${b || "none"}`}
                        onPress={() => setBlood(b)}
                        style={[styles.chip, blood === b && styles.chipActive, { flexShrink: 0 }]}
                      >
                        <Text style={[styles.chipTxt, blood === b && styles.chipTxtActive]}>{b || "None"}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Field>

                <Field label="Allergies / Notes (optional)">
                  <TextInput
                    testID="form-allergies"
                    value={allergies}
                    onChangeText={setAllergies}
                    placeholder="e.g. Penicillin, peanuts"
                    style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                    multiline
                    placeholderTextColor="#94A3B8"
                  />
                </Field>

                {err && <Text style={{ color: "#EF4444", fontSize: 13 }}>{err}</Text>}

                <Pressable
                  testID="save-family-btn"
                  onPress={save}
                  disabled={saving}
                  style={[styles.primary, saving && { opacity: 0.6 }]}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryTxt}>{editing ? "Save changes" : "Add member (auto UHID)"}</Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  const styles = useStyles();
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      {children}
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
  subtitle: { color: c.muted, fontSize: 12 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyTxt: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  emptySub: { color: c.muted, fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
  emptyBtn: {
    flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: c.brandPrimary,
    paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radius.pill, marginTop: spacing.md,
  },
  emptyBtnTxt: { color: c.onBrandPrimary, fontWeight: "700" },

  card: { flexDirection: "row", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  relation: { color: c.muted, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  uhidRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  uhid: { color: c.onBrandTertiary, fontSize: 11, fontWeight: "700", backgroundColor: c.brandTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  bloodChip: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  bloodTxt: { color: "#991B1B", fontSize: 11, fontWeight: "700" },
  allergy: { color: c.onSurfaceSecondary, fontSize: 11, marginTop: 4 },
  rowBtn: { padding: 6 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" },
  modalHead: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  modalTitle: { flex: 1, color: c.onSurface, fontWeight: "700", fontSize: 16 },

  label: { color: c.onSurface, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12,
    color: c.onSurface, fontSize: 14, borderWidth: 1, borderColor: c.border,
  },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border,
  },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipTxt: { color: c.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  chipTxtActive: { color: c.onBrandPrimary },

  primary: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  primaryTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
}));
