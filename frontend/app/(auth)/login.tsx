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
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { API, apiJson, useAuth } from "@/src/api";

const HERO_IMG =
  "https://images.unsplash.com/photo-1603277578692-c699f37c67d3?crop=entropy&cs=srgb&fm=jpg&q=85";

type Mode = "phone" | "otp";

export default function LoginScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loginWithToken, user } = useAuth();
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
      const data = await apiJson<{ otp_dev: string }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setDevOtp(data.otp_dev);
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
              colors={["rgba(5,150,105,0.65)", "rgba(15,23,42,0.85)"]}
              style={styles.heroScrim}
            />
            <View style={styles.heroContent}>
              <View style={styles.logoBadge}>
                <Icon name="medkit" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.heroTitle}>Agrawal Homeo Hall</Text>
              <Text style={styles.heroSub}>Expert Homeopathic Care by Dr. Sonima Agrawal</Text>
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
                {devOtp && (
                  <View style={styles.devHint} testID="dev-otp-hint">
                    <Icon name="information-circle" size={14} color="#065F46" />
                    <Text style={styles.devHintTxt}>Dev OTP: {devOtp}  •  (or use 123456)</Text>
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

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  hero: { height: 260, position: "relative" },
  heroImg: { ...(Platform.OS === "web" ? { width: "100%", height: "100%" } : {}), position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroContent: { flex: 1, justifyContent: "flex-end", padding: spacing.xl },
  logoBadge: {
    width: 52, height: 52, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
  },
  heroTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "700" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 14, marginTop: 4 },

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
