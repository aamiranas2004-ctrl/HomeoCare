import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { LogBox, View, Text, Pressable, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth, apiJson } from "@/src/api";
import { colors, setColorSchemeOverride } from "@/src/theme";

LogBox.ignoreAllLogs(true);
WebBrowser.maybeCompleteAuthSession();

function AuthGate() {
  const { user, loading, logout } = useAuth();
  const [claimToken, setClaimToken] = useState<string | null>(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const token = params.get("claim") || query.get("claim");
    if (token) {
      window.sessionStorage.setItem("pending_booking_claim", token);
      query.delete("claim");
      window.history.replaceState({}, "", window.location.pathname + (query.size ? `?${query}` : ""));
    }
    return window.sessionStorage.getItem("pending_booking_claim");
  });
  const [claimMessage, setClaimMessage] = useState("");
  const [claiming, setClaiming] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const inRole = segments[0] === "role-select";
    if (!user) {
      if (!inAuth) router.replace("/(auth)/login");
      return;
    }
    // authenticated - only redirect when landing on auth screens.
    // Any other route (including /book, /role-select, tab groups) is allowed
    // so long as it matches the user's role.
    if (inAuth) {
      router.replace(user.role === "doctor" ? "/(doctor)" : "/(patient)");
      return;
    }
    if (user.role === "doctor" && segments[0] === "(patient)") {
      router.replace("/(doctor)");
    } else if (user.role === "patient" && segments[0] === "(doctor)") {
      router.replace("/(patient)");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  return <View style={{ flex: 1 }}>
    {claimToken && user?.role === "patient" ? <View style={{ padding: 16, backgroundColor: "#ECFDF5", gap: 8 }}>
      <Text>Link your website booking. Sign in with the Google account matching the email used for your booking, then confirm.</Text>
      {claimMessage ? <Text accessibilityRole="alert">{claimMessage}</Text> : null}
      <Pressable disabled={claiming} onPress={async () => {
        setClaiming(true);
        try {
          await apiJson("/appointment-requests/claim", { method: "POST", body: JSON.stringify({ claim_token: claimToken }) });
          window.sessionStorage.removeItem("pending_booking_claim");
          setClaimToken(null);
          window.location.assign("/appointments");
        } catch (error) { setClaimMessage(error instanceof Error ? error.message : "Unable to link booking"); }
        finally { setClaiming(false); }
      }}><Text>{claiming ? "Linking…" : "Confirm booking ownership"}</Text></Pressable>
      <Pressable disabled={claiming} onPress={async () => { await logout(); router.replace("/(auth)/login"); }}><Text>Sign in with another account</Text></Pressable>
      <Pressable disabled={claiming} onPress={() => { window.sessionStorage.removeItem("pending_booking_claim"); setClaimToken(null); }}><Text>Dismiss link</Text></Pressable>
    </View> : null}
    <Slot />
  </View>;
}

export default function RootLayout() {
  useEffect(() => {
    (async () => {
      try {
        const v = await SecureStore.getItemAsync("ahh_theme_override");
        if (v === "dark" || v === "light") setColorSchemeOverride(v);
      } catch {}
    })();
  }, []);
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <StatusBar style="dark" />
                <AuthGate />
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
