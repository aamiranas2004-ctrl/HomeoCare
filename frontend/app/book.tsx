import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { apiJson, useAuth } from "@/src/api";

const TIME_SLOTS = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
];

function nextDays(n: number) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(d);
  }
  return days;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function BookScreen() {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [slot, setSlot] = useState<string>(TIME_SLOTS[0]);
  const [mode, setMode] = useState<"in-clinic" | "online">("in-clinic");
  const [symptoms, setSymptoms] = useState("");
  const [family, setFamily] = useState<any[]>([]);
  const [forWhom, setForWhom] = useState<string>("self"); // "self" or family member id
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    apiJson<any[]>("/doctors").then((d) => {
      setDoctors(d);
      if (d[0]) setDoctorId(d[0].user_id);
    });
    apiJson<any[]>("/family").then(setFamily).catch(() => {});
  }, []);

  const days = useMemo(() => nextDays(14), []);

  const submit = async () => {
    if (!doctorId) { setError("Select a doctor"); return; }
    setLoading(true);
    setError(null);
    try {
      await apiJson("/appointments", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: doctorId,
          date: iso(date),
          time_slot: slot,
          mode,
          symptoms,
          family_member_id: forWhom === "self" ? undefined : forWhom,
        }),
      });
      setOk(true);
      setTimeout(() => router.replace("/(patient)/appointments"), 1000);
    } catch (e: any) {
      setError(e?.message || "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="book-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Book Appointment</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          {/* For Whom */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
            <Text style={styles.section}>Booking For</Text>
            <Pressable testID="manage-family-btn" onPress={() => router.push("/family")} hitSlop={8}>
              <Text style={{ color: "#2563EB", fontSize: 12, fontWeight: "700" }}>Manage family →</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            <Pressable
              testID="for-self"
              onPress={() => setForWhom("self")}
              style={[styles.forWhom, forWhom === "self" && styles.forWhomActive, { flexShrink: 0 }]}
            >
              <Icon name="person" size={16} color={forWhom === "self" ? "#FFFFFF" : "#334155"} />
              <Text style={[styles.forWhomTxt, forWhom === "self" && styles.forWhomTxtActive]}>
                Myself
              </Text>
              {user?.uhid && (
                <Text style={[styles.forWhomHint, forWhom === "self" && { color: "rgba(255,255,255,0.85)" }]}>
                  {user.uhid}
                </Text>
              )}
            </Pressable>
            {family.map((f) => (
              <Pressable
                key={f.id}
                testID={`for-${f.id}`}
                onPress={() => setForWhom(f.id)}
                style={[styles.forWhom, forWhom === f.id && styles.forWhomActive, { flexShrink: 0 }]}
              >
                <Icon
                  name={f.relation === "spouse" ? "heart" : f.relation === "child" ? "happy" : f.relation === "parent" ? "people" : "person-add"}
                  size={16}
                  color={forWhom === f.id ? "#FFFFFF" : "#334155"}
                />
                <View>
                  <Text style={[styles.forWhomTxt, forWhom === f.id && styles.forWhomTxtActive]}>
                    {f.name}
                  </Text>
                  <Text style={[styles.forWhomHint, forWhom === f.id && { color: "rgba(255,255,255,0.85)" }]}>
                    {f.relation}{f.age ? ` • ${f.age}y` : ""}
                  </Text>
                </View>
              </Pressable>
            ))}
            <Pressable
              testID="add-family-inline"
              onPress={() => router.push("/family")}
              style={[styles.forWhom, styles.addMore, { flexShrink: 0 }]}
            >
              <Icon name="add" size={16} color="#059669" />
              <Text style={{ color: "#059669", fontWeight: "700", fontSize: 12 }}>Add member</Text>
            </Pressable>
          </ScrollView>

          {/* Doctor */}
          <Text style={styles.section}>Select Doctor</Text>
          {doctors.map((d) => (
            <Pressable
              key={d.user_id}
              testID={`doctor-${d.user_id}`}
              onPress={() => setDoctorId(d.user_id)}
              style={[styles.doctor, doctorId === d.user_id && styles.doctorActive]}
            >
              <View style={styles.dAvatar}>
                <Icon name="medical" size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dName}>{d.name}</Text>
                <Text style={styles.dMeta}>
                  {d.qualification || "BHMS"} • {d.specialization || "Homeopathic Physician"}
                </Text>
              </View>
              {doctorId === d.user_id && <Icon name="checkmark-circle" size={22} color="#059669" />}
            </Pressable>
          ))}

          {/* Mode */}
          <Text style={styles.section}>Consultation Mode</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {(["in-clinic", "online"] as const).map((m) => (
              <Pressable
                key={m}
                testID={`mode-${m}`}
                onPress={() => setMode(m)}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              >
                <Icon name={m === "online" ? "videocam" : "medkit"} size={16} color={mode === m ? "#FFFFFF" : "#334155"} />
                <Text style={[styles.modeTxt, mode === m && styles.modeTxtActive]}>
                  {m === "in-clinic" ? "In-Clinic" : "Online"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Date */}
          <Text style={styles.section}>Select Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {days.map((d, i) => {
              const sel = iso(d) === iso(date);
              return (
                <Pressable
                  key={i}
                  testID={`date-${iso(d)}`}
                  onPress={() => setDate(d)}
                  style={[styles.day, sel && styles.dayActive, { flexShrink: 0 }]}
                >
                  <Text style={[styles.dayWk, sel && styles.dayTxtActive]}>
                    {d.toLocaleDateString("en", { weekday: "short" })}
                  </Text>
                  <Text style={[styles.dayNum, sel && styles.dayTxtActive]}>{d.getDate()}</Text>
                  <Text style={[styles.dayMo, sel && styles.dayTxtActive]}>
                    {d.toLocaleDateString("en", { month: "short" })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Time */}
          <Text style={styles.section}>Select Time Slot</Text>
          <View style={styles.slotsGrid}>
            {TIME_SLOTS.map((t) => (
              <Pressable
                key={t}
                testID={`slot-${t}`}
                onPress={() => setSlot(t)}
                style={[styles.slot, slot === t && styles.slotActive]}
              >
                <Text style={[styles.slotTxt, slot === t && styles.slotTxtActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          {/* Symptoms */}
          <Text style={styles.section}>Symptoms / Reason (optional)</Text>
          <TextInput
            testID="symptoms-input"
            value={symptoms}
            onChangeText={setSymptoms}
            placeholder="Briefly describe your symptoms or concern"
            multiline
            style={styles.textArea}
            placeholderTextColor="#94A3B8"
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {ok && (
            <View style={styles.ok}>
              <Icon name="checkmark-circle" size={18} color="#065F46" />
              <Text style={styles.okTxt}>Appointment requested! Redirecting…</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            testID="confirm-btn"
            onPress={submit}
            disabled={loading}
            style={[styles.confirm, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmTxt}>Confirm Booking (₹400)</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, gap: spacing.md,
    borderBottomWidth: 1, borderBottomColor: c.divider,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  title: { flex: 1, color: c.onSurface, fontWeight: "700", fontSize: 17, textAlign: "center" },
  section: { color: c.onSurface, fontWeight: "700", fontSize: 14, marginTop: spacing.md },

  doctor: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: c.border,
  },
  doctorActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  dAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandSecondary,
    alignItems: "center", justifyContent: "center",
  },
  dName: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  dMeta: { color: c.muted, fontSize: 12, marginTop: 2 },

  modeBtn: {
    flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
    paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  modeBtnActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  modeTxt: { color: c.onSurfaceSecondary, fontWeight: "600" },
  modeTxtActive: { color: c.onBrandPrimary },

  day: {
    width: 62, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: "center",
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
  },
  dayActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  dayWk: { color: c.muted, fontSize: 11, fontWeight: "600" },
  dayNum: { color: c.onSurface, fontSize: 18, fontWeight: "700", marginTop: 2 },
  dayMo: { color: c.muted, fontSize: 11 },
  dayTxtActive: { color: c.onBrandPrimary },

  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slot: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
  },
  slotActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  slotTxt: { color: c.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  slotTxtActive: { color: c.onBrandPrimary },

  textArea: {
    minHeight: 90, backgroundColor: c.surfaceTertiary, borderRadius: radius.md,
    padding: spacing.md, color: c.onSurface, textAlignVertical: "top", borderWidth: 1, borderColor: c.border,
  },

  error: { color: c.error, fontSize: 13 },
  ok: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandTertiary, padding: 10, borderRadius: radius.sm },
  okTxt: { color: c.onBrandTertiary, fontWeight: "600" },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg,
    backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider,
  },
  confirm: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center" },
  confirmTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },

  forWhom: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, minWidth: 130,
  },
  forWhomActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  forWhomTxt: { color: c.onSurface, fontSize: 13, fontWeight: "700" },
  forWhomTxtActive: { color: c.onBrandPrimary },
  forWhomHint: { color: c.muted, fontSize: 10, textTransform: "capitalize" },
  addMore: { borderStyle: "dashed", borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
}));
