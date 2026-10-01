import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { LogBox, View, ActivityIndicator, StyleSheet } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/api";
import { colors, setColorSchemeOverride } from "@/src/theme";

LogBox.ignoreAllLogs(true);
WebBrowser.maybeCompleteAuthSession();

function AuthGate() {
  const { user, loading } = useAuth();
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
  return <Slot />;
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
