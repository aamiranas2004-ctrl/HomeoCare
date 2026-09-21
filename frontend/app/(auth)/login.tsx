import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { API, apiJson, useAuth } from "@/src/api";
import { ClinicLogo } from "@/src/components/clinic-logo";

const HERO_IMG =
  "https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?crop=entropy&cs=srgb&fm=jpg&q=85&w=1080";

const DOCTOR_PHOTO =
  "https://agrawalhomeohall.com/wp-content/uploads/2026/06/ChatGPT-Image-Jun-23-2026-11_17_26-AM-682x1024.png";

type Mode = "phone" | "otp";

export default function LoginScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { loginWithToken } = useAuth();
  const [mode, setMode] = useState<Mode>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"patient" | "doctor">("patient");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedSession = useRef<Set<string>>(new Set());
  const cachedUrl = useRef<string | null>(null);

  // ------------------------------------------------------------------ Google
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      cachedUrl.current = url;
      processGoogleCallback(url);
    });
    (async () => {
      const initial = await Linking.getInitialURL();
      if (initial) processGoogleCallback(initial);
    })();
    return () => sub.remove();
  }, []);

  const extractSessionId = (url: string): string | null => {
    const m = url.match(/[?#&]session_id=([^&#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };

  const processGoogleCallback = async (url: string | null | undefined) => {
    if (!url) return;
    const sid = extractSessionId(url);
    if (!sid || processedSession.current.has(sid)) return;
    processedSession.current.add(sid);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      if (!res.ok) throw new Error("Google auth failed");
      const data = await res.json();
      await loginWithToken(data.session_token, data.user);
      if (Platform.OS === "web") {
        try {
          const u = new URL(window.location.href);
          u.hash = "";
          u.searchParams.delete("session_id");
          window.history.replaceState(window.history.state, "", u.toString());
        } catch {}
      }
    } catch (e: any) {
      setError(e?.message || "Google login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      const redirectUrl =
        Platform.OS === "web" ? `${window.location.origin}/` : Linking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === "web") {
        window.location.href = authUrl;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        let url: string | null = null;
        if (result.type === "success" && (result as any).url) url = (result as any).url;
        if (!url) url = cachedUrl.current;
        if (!url) url = await Linking.getInitialURL();
        if (url) await processGoogleCallback(url);
      }
    } catch (e: any) {
      setError(e?.message || "Google login failed");
    }
  };

  // ------------------------------------------------------------------ Phone
  const handleRequestOtp = async () => {
    if (!phone.match(/^\+?\d{10,15}$/)) {
      setError("Enter a valid phone number");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await apiJson<{ otp_dev?: string; provider?: string }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setDevOtp(data.provider === "msg91" ? null : (data.otp_dev || null));
      setMode("otp");
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      setError("Enter the OTP");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await apiJson<{ session_token: string; user: any }>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, otp, name: name || undefined, role }),
      });
      await loginWithToken(data.session_token, data.user);
    } catch (e: any) {
      setError(e?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="login-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Image source={{ uri: HERO_IMG }} style={styles.heroImg} contentFit="cover" />
            <LinearGradient
              colors={["rgba(6,95,70,0.55)", "rgba(5,150,105,0.85)", "rgba(15,23,42,0.92)"]}
              locations={[0, 0.55, 1]}
              style={styles.heroScrim}
            />
            <View style={styles.heroContent}>
              <View style={styles.brandRow}>
                <ClinicLogo size={68} />
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={styles.wordmark}>
                    Agrawal <Text style={styles.wordmarkAccent}>Homeo Hall</Text>
                  </Text>
                  <Text style={styles.tagline}>Personalized homeopathic care · Ranchi</Text>
                </View>
                <View style={styles.docAvatar} testID="doc-avatar">
                  <Image source={{ uri: DOCTOR_PHOTO }} style={styles.docImg} contentFit="cover" contentPosition={{ top: "12%" }} />
                  <View style={styles.docBadge}>
                    <Icon name="checkmark-circle" size={12} color="#FFFFFF" />
                  </View>
                </View>
              </View>
              <View style={styles.docCard}>
                <Text style={styles.docName}>Dr. Sonima Agrawal</Text>
                <Text style={styles.docTitle}>BHMS · Homeopathic Physician · 14+ yrs</Text>
              </View>
              <View style={styles.trustRow}>
                <TrustPill icon="star" text="5.0" sub="2000+ reviews" />
                <TrustPill icon="ribbon" text="14+ yrs" sub="Experience" />
                <TrustPill icon="shield-checkmark" text="BHMS" sub="Certified" />
              </View>
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.roleRow}>
              {(["patient", "doctor"] as const).map((r) => (
                <Pressable
                  key={r}
                  testID={`role-${r}-btn`}
                  onPress={() => setRole(r)}
                  style={[styles.roleChip, role === r && styles.roleChipActive]}
                >
                  <Icon
                    name={r === "patient" ? "person" : "medical"}
                    size={16}
                    color={role === r ? "#FFFFFF" : "#334155"}
                  />
                  <Text style={[styles.roleChipTxt, role === r && styles.roleChipTxtActive]}>
                    {r === "patient" ? "I'm a Patient" : "I'm a Doctor"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {role === "doctor" && (
              <View style={styles.docHint} testID="doctor-hint">
                <Icon name="lock-closed" size={12} color="#065F46" />
                <Text style={styles.docHintTxt}>
                  Doctor login is restricted to the clinic&apos;s registered number (+91-7294136264).
                </Text>
              </View>
            )}

            {mode === "phone" ? (
              <View>
                <Text style={styles.label}>Phone number</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.prefix}>+91</Text>
                  <TextInput
                    testID="phone-input"
                    value={phone.replace(/^\+91/, "")}
                    onChangeText={(t) => setPhone("+91" + t.replace(/\D/g, ""))}
                    placeholder="10-digit mobile number"
                    keyboardType="phone-pad"
                    style={styles.input}
                    maxLength={10}
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                {role === "patient" && (
                  <>
                    <Text style={styles.label}>Full Name (optional)</Text>
                    <View style={styles.inputWrap}>
                      <TextInput
                        testID="name-input"
                        value={name}
                        onChangeText={setName}
                        placeholder="Your name"
                        style={styles.input}
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </>
                )}

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  testID="request-otp-btn"
                  onPress={handleRequestOtp}
                  disabled={loading}
                  style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryTxt}>Send OTP</Text>
                  )}
                </Pressable>

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerTxt}>or</Text>
                  <View style={styles.divider} />
                </View>

                <Pressable testID="google-btn" onPress={handleGoogle} style={styles.googleBtn}>
                  <Icon name="logo-google" size={18} color="#0F172A" />
                  <Text style={styles.googleTxt}>Continue with Google</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>Enter OTP sent to {phone}</Text>
                {devOtp ? (
                  <View style={styles.devHint} testID="dev-otp-hint">
                    <Icon name="information-circle" size={14} color="#065F46" />
                    <Text style={styles.devHintTxt}>Dev OTP: {devOtp}  •  (or use 123456)</Text>
                  </View>
                ) : (
                  <View style={styles.devHint} testID="sms-otp-hint">
                    <Icon name="chatbubble-ellipses" size={14} color="#065F46" />
                    <Text style={styles.devHintTxt}>SMS sent via MSG91. Backup code: 123456</Text>
                  </View>
                )}
                <View style={styles.inputWrap}>
                  <TextInput
                    testID="otp-input"
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, ""))}
                    placeholder="6-digit OTP"
                    keyboardType="number-pad"
                    style={[styles.input, { letterSpacing: 8, fontSize: 18 }]}
                    maxLength={6}
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  testID="verify-otp-btn"
                  onPress={handleVerifyOtp}
                  disabled={loading}
                  style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryTxt}>Verify & Continue</Text>
                  )}
                </Pressable>

                <Pressable
                  testID="change-phone-btn"
                  onPress={() => {
                    setMode("phone");
                    setOtp("");
                    setError(null);
                  }}
                  style={styles.ghostBtn}
                >
                  <Text style={styles.ghostTxt}>Change phone number</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.terms}>
              By continuing you agree to our Terms & Privacy Policy. Consultation fee: ₹400
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TrustPill({ icon, text, sub }: { icon: any; text: string; sub: string }) {
  const styles = useStyles();
  return (
    <View style={styles.trustPill}>
      <Icon name={icon} size={12} color="#FFFFFF" />
      <View>
        <Text style={styles.trustPillText}>{text}</Text>
        <Text style={styles.trustPillSub}>{sub}</Text>
      </View>
    </View>
  );
}


const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  hero: { minHeight: 340, position: "relative" },
  heroImg: { ...(Platform.OS === "web" ? { width: "100%", height: "100%" } : {}), position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl, gap: spacing.xl, paddingTop: spacing.xxxl, paddingBottom: spacing.xl },

  trustRow: { flexDirection: "row", gap: spacing.sm },
  trustPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  trustPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  trustPillSub: { color: "rgba(255,255,255,0.75)", fontSize: 10 },

  brandRow: { flexDirection: "row", alignItems: "center", width: "100%", gap: spacing.md },
  wordmark: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.3, textAlign: "center" },
  wordmarkAccent: { color: "#D1FAE5" },
  tagline: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600", marginTop: 2, textAlign: "center" },
  docAvatar: {
    width: 68, height: 68, borderRadius: 34, overflow: "hidden",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.6)", backgroundColor: "#FFFFFF",
  },
  docImg: { width: 62, height: 62, borderRadius: 31 },
  docBadge: {
    position: "absolute", bottom: -1, right: -1, width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#059669", borderWidth: 2, borderColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },
  docCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
    borderRadius: radius.md, padding: spacing.md, alignItems: "center",
  },
  docName: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  docTitle: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },

  form: { padding: spacing.xl, gap: spacing.md },
  roleRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  roleChip: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  roleChipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  roleChipTxt: { color: c.onSurfaceSecondary, fontWeight: "600", fontSize: 13 },
  roleChipTxtActive: { color: c.onBrandPrimary },

  label: { color: c.onSurface, fontSize: 13, fontWeight: "600", marginTop: spacing.sm, marginBottom: 6 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceTertiary,
    borderRadius: radius.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: c.border,
  },
  prefix: { color: c.onSurface, fontWeight: "600", marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, color: c.onSurface, fontSize: 15 },
  error: { color: c.error, fontSize: 13, marginTop: spacing.sm },
  devHint: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandTertiary,
    padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.sm,
  },
  devHintTxt: { color: c.onBrandTertiary, fontSize: 12, fontWeight: "500" },

  docHint: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandTertiary,
    padding: spacing.sm, borderRadius: radius.sm, marginTop: -spacing.xs,
  },
  docHintTxt: { color: c.onBrandTertiary, fontSize: 11, fontWeight: "500", flex: 1 },

  primaryBtn: {
    backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 16,
    alignItems: "center", marginTop: spacing.md,
  },
  primaryTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.md },
  divider: { flex: 1, height: 1, backgroundColor: c.border },
  dividerTxt: { color: c.muted, fontSize: 12 },

  googleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: c.surface, borderColor: c.borderStrong, borderWidth: 1,
    paddingVertical: 14, borderRadius: radius.pill,
  },
  googleTxt: { color: c.onSurface, fontWeight: "600", fontSize: 14 },

  ghostBtn: { alignItems: "center", paddingVertical: 12 },
  ghostTxt: { color: c.brandSecondary, fontWeight: "600" },

  terms: { color: c.muted, fontSize: 11, textAlign: "center", marginTop: spacing.md },
}));
