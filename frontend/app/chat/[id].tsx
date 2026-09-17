import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform,
  FlatList, ActivityIndicator,
} from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { apiJson, useAuth } from "@/src/api";

type Msg = {
  id: string;
  appointment_id: string;
  sender_id: string;
  sender_role: "patient" | "doctor";
  sender_name: string;
  text: string;
  created_at: string;
};

type Appt = {
  id: string;
  patient_name: string;
  patient_uhid?: string;
  doctor_name: string;
  date: string;
  time_slot: string;
  family_member_name?: string;
  family_member_relation?: string;
};

export default function ChatScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [appt, setAppt] = useState<Appt | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);
  const stopped = useRef(false);

  const load = useCallback(async () => {
    if (!id || stopped.current) return;
    try {
      const [a, m] = await Promise.all([
        apiJson<Appt>(`/appointments/${id}`),
        apiJson<Msg[]>(`/appointments/${id}/messages`),
      ]);
      setAppt(a);
      setMsgs(m);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    stopped.current = false;
    load();
    const t = setInterval(() => {
      if (!stopped.current) load();
    }, 4000);
    return () => { stopped.current = true; clearInterval(t); };
  }, [load]);

  useEffect(() => {
    if (msgs.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !id) return;
    setSending(true);
    setError(null);
    try {
      const created = await apiJson<Msg>(`/appointments/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: body }),
      });
      setText("");
      setMsgs((prev) => [...prev, created]);
    } catch (e: any) {
      setError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Msg }) => {
    const mine = item.sender_id === user?.user_id;
    return (
      <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          {!mine && <Text style={styles.author}>{item.sender_name}</Text>}
          <Text style={mine ? styles.txtMine : styles.txtOther}>{item.text}</Text>
          <Text style={mine ? styles.timeMine : styles.timeOther}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  const other = user?.role === "doctor"
    ? (appt?.family_member_name ? `${appt.patient_name} (for ${appt.family_member_name})` : appt?.patient_name)
    : appt?.doctor_name;

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="chat-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1} testID="chat-title">
            {other || "Chat"}
          </Text>
          {appt && (
            <Text style={styles.subtitle}>
              {appt.date} • {appt.time_slot}
            </Text>
          )}
        </View>
        <View style={styles.avatar}>
          <Icon name={user?.role === "doctor" ? "person" : "medical"} size={16} color="#FFFFFF" />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 12 : 0}
          style={{ flex: 1 }}
        >
          {msgs.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="chatbubbles-outline" size={52} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Start the conversation</Text>
              <Text style={styles.emptySub}>
                {user?.role === "doctor"
                  ? "Ask follow-up questions or share prescription details with the patient."
                  : "Ask your doctor a question, describe new symptoms, or share how you're feeling."}
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={msgs}
              keyExtractor={(m) => m.id}
              renderItem={renderItem}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              showsVerticalScrollIndicator={false}
            />
          )}

          {error && (
            <View style={styles.errBox}>
              <Icon name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errTxt}>{error}</Text>
            </View>
          )}

          <View style={[styles.inputRow, { paddingBottom: insets.bottom + spacing.sm }]}>
            <TextInput
              testID="chat-input"
              value={text}
              onChangeText={setText}
              placeholder="Type your message…"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              multiline
              maxLength={2000}
            />
            <Pressable
              testID="send-btn"
              onPress={send}
              disabled={sending || !text.trim()}
              style={[styles.sendBtn, (sending || !text.trim()) && { opacity: 0.5 }]}
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Icon name="send" size={18} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.surface,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  title: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  subtitle: { color: c.muted, fontSize: 11 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  emptySub: { color: c.muted, fontSize: 13, textAlign: "center", paddingHorizontal: spacing.md },

  bubbleRow: { flexDirection: "row", width: "100%" },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "80%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, gap: 2,
  },
  bubbleMine: { backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: c.surfaceTertiary, borderBottomLeftRadius: 4 },
  author: { color: c.brandSecondary, fontSize: 10, fontWeight: "700" },
  txtMine: { color: c.onBrandPrimary, fontSize: 14 },
  txtOther: { color: c.onSurface, fontSize: 14 },
  timeMine: { color: "rgba(255,255,255,0.75)", fontSize: 10, alignSelf: "flex-end", marginTop: 2 },
  timeOther: { color: c.muted, fontSize: 10, alignSelf: "flex-end", marginTop: 2 },

  errBox: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEE2E2",
    padding: 8, marginHorizontal: spacing.md, borderRadius: radius.sm,
  },
  errTxt: { color: c.error, fontSize: 12 },

  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface,
  },
  input: {
    flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8, color: c.onSurface, fontSize: 14,
    maxHeight: 120, borderWidth: 1, borderColor: c.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
}));
