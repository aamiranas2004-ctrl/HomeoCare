import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { apiJson, useAuth } from "@/src/api";
import { ClinicLogo } from "@/src/components/clinic-logo";

type SiteContent = any;

const HERO =
  "https://images.unsplash.com/photo-1725267882596-2d08e560b250?crop=entropy&cs=srgb&fm=jpg&q=85";

export default function PatientHome() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [site, setSite] = useState<SiteContent | null>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [nextAppt, setNextAppt] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [content, docs, appts] = await Promise.all([
        apiJson("/site/content"),
        apiJson<any[]>("/doctors"),
        apiJson<any[]>("/appointments/mine").catch(() => []),
      ]);
      setSite(content);
      setDoctors(docs);
      const upcoming = (appts || []).find((a: any) => a.status !== "completed" && a.status !== "cancelled");
      setNextAppt(upcoming || null);
    } catch {}
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!site) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="patient-home">
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Branded top strip */}
        <LinearGradient
          colors={["#065F46", "#059669", "#10B981"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.brandStrip, { paddingTop: insets.top + spacing.md }]}
        >
          <View style={styles.brandRow}>
            <ClinicLogo size={44} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.brandName}>Agrawal Homeo Hall</Text>
              <Text style={styles.brandTagline}>Personalized homeopathic care</Text>
            </View>
            <Pressable onPress={() => router.push("/(patient)/profile")} style={styles.avatar}>
              {user?.picture ? (
                <Image source={{ uri: user.picture }} style={{ width: 44, height: 44, borderRadius: 22 }} />
              ) : (
                <Icon name="person" size={22} color="#065F46" />
              )}
            </Pressable>
          </View>

          <View style={styles.greetCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hi}>Hello,</Text>
              <Text style={styles.name} numberOfLines={1}>
                {user?.name || "Patient"}
              </Text>
              {user?.uhid && (
                <View style={styles.uhidBadge} testID="uhid-badge">
                  <Icon name="finger-print" size={12} color="#065F46" />
                  <Text style={styles.uhidTxt}>UHID: {user.uhid}</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Featured card */}
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={styles.heroImg} contentFit="cover" />
          <LinearGradient
            colors={["rgba(5,150,105,0.2)", "rgba(15,23,42,0.85)"]}
            style={styles.heroScrim}
          />
          <View style={styles.heroContent}>
            {nextAppt ? (
              <>
                <Text style={styles.heroLabel}>Upcoming Appointment</Text>
                <Text style={styles.heroTitle}>{nextAppt.doctor_name}</Text>
                <Text style={styles.heroSub}>
                  {nextAppt.date} • {nextAppt.time_slot} • {nextAppt.mode}
                </Text>
                <Pressable
                  testID="view-appt-btn"
                  onPress={() => router.push("/(patient)/appointments")}
                  style={styles.heroBtn}
                >
                  <Text style={styles.heroBtnTxt}>View details</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.heroLabel}>{site.clinic.tagline}</Text>
                <Text style={styles.heroTitle}>Book a Consultation</Text>
                <Text style={styles.heroSub}>
                  With {site.doctor.name} • {site.doctor.experience}
                </Text>
                <Pressable
                  testID="book-hero-btn"
                  onPress={() => router.push("/book")}
                  style={styles.heroBtn}
                >
                  <Text style={styles.heroBtnTxt}>Book Appointment</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickGrid}>
          <QuickAction
            icon="calendar"
            label="Book Visit"
            testID="qa-book"
            onPress={() => router.push("/book")}
          />
          <QuickAction
            icon="cloud-upload"
            label="Upload Records"
            testID="qa-upload"
            onPress={() => router.push("/(patient)/uploads")}
          />
          <QuickAction
            icon="people"
            label="Family"
            testID="qa-family"
            onPress={() => router.push("/family")}
          />
          <QuickAction
            icon="notifications"
            label="Reminders"
            testID="qa-reminders"
            onPress={() => router.push("/reminders")}
          />
          <QuickAction
            icon="call"
            label="Call Clinic"
            testID="qa-call"
            onPress={() => {
              const num = "+917294136264";
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const Linking = require("react-native").Linking;
                Linking.openURL(`tel:${num}`);
              } catch {}
            }}
          />
        </View>

        {/* About Doctor */}
        <SectionTitle title="Meet Your Doctor" />
        <View style={styles.doctorCard}>
          <Image
            source={{ uri: site.doctor.photo_url }}
            style={styles.doctorAvatarImg}
            contentFit="cover"
            contentPosition={{ top: "12%" }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.doctorName}>{site.doctor.name}</Text>
            <Text style={styles.doctorMeta}>
              {site.doctor.qualification} • {site.doctor.experience}
            </Text>
            <Text style={styles.doctorBio} numberOfLines={3}>
              {site.doctor.bio}
            </Text>
          </View>
        </View>

        {/* Services */}
        <SectionTitle title="Our Specialities" />
        <View style={styles.servicesGrid}>
          {site.services.slice(0, 8).map((s: any, idx: number) => (
            <View key={idx} style={styles.serviceCard}>
              <View style={styles.serviceIcon}>
                <Icon name={s.icon as any} size={20} color="#059669" />
              </View>
              <Text style={styles.serviceTitle} numberOfLines={1}>
                {s.title}
              </Text>
              <Text style={styles.serviceDesc} numberOfLines={2}>
                {s.desc}
              </Text>
            </View>
          ))}
        </View>

        {/* Why choose */}
        <SectionTitle title="Why Choose Us" />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {site.why_us.map((w: any, idx: number) => (
            <View key={idx} style={styles.whyRow}>
              <View style={styles.whyDot}>
                <Icon name="checkmark" size={14} color="#065F46" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.whyTitle}>{w.title}</Text>
                <Text style={styles.whyDesc}>{w.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{site.clinic.experience_years}+</Text>
            <Text style={styles.statLbl}>Years Experience</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{site.clinic.happy_patients}+</Text>
            <Text style={styles.statLbl}>Happy Patients</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>₹{site.clinic.consultation_fee}</Text>
            <Text style={styles.statLbl}>Consultation Fee</Text>
          </View>
        </View>

        {/* Testimonials */}
        <SectionTitle title="What Patients Say" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        >
          {site.testimonials.map((t: any, idx: number) => (
            <View key={idx} style={styles.testCard}>
              <View style={{ flexDirection: "row", gap: 2 }}>
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Icon key={i} name="star" size={12} color="#F59E0B" />
                ))}
              </View>
              <Text style={styles.testTxt} numberOfLines={5}>
                &ldquo;{t.text}&rdquo;
              </Text>
              <Text style={styles.testAuthor}>
                — {t.name}, {t.location}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const styles = useStyles();
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function MiniStat({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, testID }: any) {
  const styles = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.quickCard}>
      <View style={styles.quickIcon}>
        <Icon name={icon} size={22} color="#FFFFFF" />
      </View>
      <Text style={styles.quickLbl}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },

  brandStrip: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandName: { color: "#FFFFFF", fontWeight: "800", fontSize: 16, letterSpacing: -0.2 },
  brandTagline: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)",
  },
  greetCard: {
    marginTop: spacing.lg, backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    borderRadius: radius.lg, padding: spacing.md,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  hi: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  name: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 2 },
  uhidBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: "#FFFFFF", paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill, marginTop: 6,
  },
  uhidTxt: { color: "#065F46", fontSize: 11, fontWeight: "800" },
  miniStats: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.sm },
  miniDivider: { width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.35)" },
  miniStatValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  miniStatLabel: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "600" },

  hero: { margin: spacing.lg, borderRadius: radius.lg, overflow: "hidden", height: 200 },
  heroImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroContent: { flex: 1, padding: spacing.lg, justifyContent: "flex-end" },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  heroTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 2 },
  heroBtn: {
    alignSelf: "flex-start", backgroundColor: "#FFFFFF", paddingHorizontal: spacing.lg,
    paddingVertical: 10, borderRadius: radius.pill, marginTop: spacing.md,
  },
  heroBtnTxt: { color: c.brandPrimary, fontWeight: "700", fontSize: 13 },

  quickGrid: {
    flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg,
    gap: spacing.sm, marginTop: spacing.xs,
  },
  quickCard: {
    flexBasis: "48%", flexGrow: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: c.border,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: radius.sm, backgroundColor: c.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  quickLbl: { color: c.onSurface, fontWeight: "600", fontSize: 13, flex: 1 },

  sectionTitle: { color: c.onSurface, fontSize: 16, fontWeight: "700", marginTop: spacing.xl, marginBottom: spacing.md, paddingHorizontal: spacing.lg },

  doctorCard: {
    marginHorizontal: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, flexDirection: "row", gap: spacing.md, borderWidth: 1, borderColor: c.border,
  },
  doctorAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: c.brandSecondary,
    alignItems: "center", justifyContent: "center",
  },
  doctorAvatarImg: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceTertiary,
  },
  doctorName: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  doctorMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  doctorBio: { color: c.onSurfaceSecondary, fontSize: 12, marginTop: 6, lineHeight: 18 },

  servicesGrid: {
    flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: spacing.sm,
  },
  serviceCard: {
    flexBasis: "47%", flexGrow: 1, backgroundColor: c.surface, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: c.border,
  },
  serviceIcon: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: c.brandTertiary,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  serviceTitle: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  serviceDesc: { color: c.muted, fontSize: 11, marginTop: 2, lineHeight: 15 },

  whyRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  whyDot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: c.brandTertiary,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  whyTitle: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  whyDesc: { color: c.muted, fontSize: 12 },

  statsRow: { flexDirection: "row", paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.xl },
  statCard: {
    flex: 1, backgroundColor: c.brandPrimary, borderRadius: radius.md,
    padding: spacing.md, alignItems: "center",
  },
  statNum: { color: c.onBrandPrimary, fontSize: 20, fontWeight: "800" },
  statLbl: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 2, textAlign: "center" },

  testCard: {
    width: 280, backgroundColor: c.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: c.border, gap: 8,
  },
  testTxt: { color: c.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  testAuthor: { color: c.brandPrimary, fontSize: 12, fontWeight: "600" },
}));
