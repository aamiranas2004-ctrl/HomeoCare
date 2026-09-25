import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Platform, Alert,
} from "react-native";
import Icon from "@react-native-vector-icons/ionicons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";

import { makeStyles, spacing, radius } from "@/src/theme";
import { API, apiFetch, apiJson, useAuth } from "@/src/api";

export default function UploadsScreen() {
  const styles = useStyles();
  const { getStoredToken, user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [family, setFamily] = useState<any[]>([]);
  const [forWhom, setForWhom] = useState<string>("self");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<"prescription" | "test_result" | "other">("prescription");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const [data, fam] = await Promise.all([
        apiJson<any[]>("/files/mine"),
        apiJson<any[]>("/family").catch(() => []),
      ]);
      setItems(data);
      setFamily(fam || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const doUpload = async (uri: string, filename: string, mime: string) => {
    setUploading(true);
    setStatusMsg(null);
    try {
      const token = await getStoredToken();
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        form.append("file", blob, filename);
      } else {
        form.append("file", { uri, name: filename, type: mime } as any);
      }
      form.append("category", category);
      if (forWhom !== "self") form.append("family_member_id", forWhom);
      const res = await fetch(`${API}/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Upload failed");
      }
      setStatusMsg("Uploaded successfully");
      await load();
    } catch (e: any) {
      setStatusMsg(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    try {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        quality: 0.85,
      });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        const name = a.fileName || `img_${Date.now()}.jpg`;
        await doUpload(a.uri, name, a.mimeType || "image/jpeg");
      }
    } catch (e: any) { setStatusMsg(e?.message || "Pick failed"); }
  };

  const takePhoto = async () => {
    try {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return;
      const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        const name = a.fileName || `cam_${Date.now()}.jpg`;
        await doUpload(a.uri, name, a.mimeType || "image/jpeg");
      }
    } catch (e: any) { setStatusMsg(e?.message || "Camera failed"); }
  };

  const pickDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        await doUpload(a.uri, a.name, a.mimeType || "application/octet-stream");
      }
    } catch (e: any) { setStatusMsg(e?.message || "Document pick failed"); }
  };

  const viewFile = async (f: any) => {
    try {
      setStatusMsg(null);
      const res = await apiFetch(`/files/${f.id}/content`);
      if (!res.ok) throw new Error(`Could not open file (HTTP ${res.status})`);
      const blob = await res.blob();

      if (Platform.OS === "web") {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        // Native viewer support will be added with the device build; keep the
        // authenticated read test explicit instead of exposing the private R2 URL.
        Alert.alert("File retrieved", `${f.filename} was securely retrieved from storage.`);
      }
    } catch (e: any) {
      setStatusMsg(e?.message || "Could not open file");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID="uploads-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Health Records</Text>
        <Text style={styles.subtitle}>Upload prescriptions & test results for review</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Family selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        >
          <Pressable
            testID="for-self"
            onPress={() => setForWhom("self")}
            style={[styles.forWhom, forWhom === "self" && styles.forWhomActive, { flexShrink: 0 }]}
          >
            <Icon name="person" size={14} color={forWhom === "self" ? "#FFFFFF" : "#334155"} />
            <Text style={[styles.forWhomTxt, forWhom === "self" && styles.forWhomTxtActive]}>
              Myself
            </Text>
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
                size={14}
                color={forWhom === f.id ? "#FFFFFF" : "#334155"}
              />
              <Text style={[styles.forWhomTxt, forWhom === f.id && styles.forWhomTxtActive]}>{f.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        >
          {(["prescription", "test_result", "other"] as const).map((k) => (
            <Pressable
              key={k}
              testID={`cat-${k}`}
              onPress={() => setCategory(k)}
              style={[styles.chip, category === k && styles.chipActive, { flexShrink: 0 }]}
            >
              <Text style={[styles.chipTxt, category === k && styles.chipTxtActive]}>
                {k === "prescription" ? "Prescription" : k === "test_result" ? "Test Result" : "Other"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Upload actions */}
        <View style={styles.uploadRow}>
          <UploadBtn testID="upload-camera" icon="camera" label="Camera" onPress={takePhoto} disabled={uploading} />
          <UploadBtn testID="upload-gallery" icon="image" label="Gallery" onPress={pickImage} disabled={uploading} />
          <UploadBtn testID="upload-pdf" icon="document" label="Document" onPress={pickDoc} disabled={uploading} />
        </View>
        {uploading && (
          <View style={styles.uploading}>
            <ActivityIndicator color="#059669" />
            <Text style={styles.uploadingTxt}>Uploading...</Text>
          </View>
        )}
        {statusMsg && (
          <View style={styles.status}>
            <Icon name="checkmark-circle" size={14} color="#065F46" />
            <Text style={styles.statusTxt}>{statusMsg}</Text>
          </View>
        )}

        {/* Files list */}
        <Text style={styles.section}>My Uploads</Text>
        {loading ? (
          <ActivityIndicator color="#059669" />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="folder-open-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyTxt}>No files uploaded yet</Text>
          </View>
        ) : (
          items.map((f) => (
            <Pressable key={f.id} onPress={() => viewFile(f)} style={styles.fileCard} testID={`file-${f.id}`}>
              <View style={styles.fileIcon}>
                <Icon
                  name={f.content_type?.includes("pdf") ? "document-text" : "image"}
                  size={22}
                  color="#059669"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>{f.filename}</Text>
                <Text style={styles.fileMeta}>
                  {f.family_member_name ? `👤 ${f.family_member_name} • ` : ""}
                  {f.category.replace("_", " ")} • {new Date(f.created_at).toLocaleDateString()}
                </Text>
                {f.doctor_reply ? (
                  <View style={styles.replyBox}>
                    <Text style={styles.replyLbl}>Doctor&apos;s Reply</Text>
                    <Text style={styles.replyTxt}>{f.doctor_reply}</Text>
                  </View>
                ) : (
                  <Text style={styles.pending}>Pending doctor review</Text>
                )}
              </View>
              <View style={styles.viewFile}>
                <Icon name="eye-outline" size={16} color="#059669" />
                <Text style={styles.viewFileTxt}>View File</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function UploadBtn({ icon, label, onPress, disabled, testID }: any) {
  const styles = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} style={[styles.upBtn, disabled && { opacity: 0.5 }]}>
      <Icon name={icon} size={22} color="#059669" />
      <Text style={styles.upBtnTxt}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.surface },
  header: { padding: spacing.lg, paddingBottom: 0 },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "700" },
  subtitle: { color: c.muted, fontSize: 13, marginTop: 2 },

  chip: {
    height: 36, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
  },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipTxt: { color: c.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  chipTxtActive: { color: c.onBrandPrimary },

  uploadRow: { flexDirection: "row", gap: spacing.sm },
  upBtn: {
    flex: 1, borderWidth: 2, borderStyle: "dashed", borderColor: c.brandPrimary,
    borderRadius: radius.md, alignItems: "center", justifyContent: "center", padding: spacing.md, gap: 6,
    backgroundColor: c.brandTertiary,
  },
  upBtnTxt: { color: c.brandPrimary, fontWeight: "700", fontSize: 12 },

  uploading: { flexDirection: "row", alignItems: "center", gap: 6 },
  uploadingTxt: { color: c.muted, fontSize: 13 },

  status: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandTertiary, padding: spacing.sm, borderRadius: radius.sm },
  statusTxt: { color: c.onBrandTertiary, fontSize: 12, fontWeight: "600" },

  section: { color: c.onSurface, fontSize: 14, fontWeight: "700", marginTop: spacing.md },

  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.sm },
  emptyTxt: { color: c.muted },

  fileCard: {
    flexDirection: "row", gap: spacing.md, backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border,
  },
  fileIcon: {
    width: 44, height: 44, borderRadius: radius.sm, backgroundColor: c.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  fileName: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  viewFile: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "center" },
  viewFileTxt: { color: c.brandPrimary, fontSize: 11, fontWeight: "700" },
  fileMeta: { color: c.muted, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  pending: { color: c.warning, fontSize: 11, fontWeight: "600", marginTop: 6 },
  replyBox: { backgroundColor: c.brandTertiary, borderRadius: radius.sm, padding: spacing.sm, marginTop: 6 },
  replyLbl: { color: c.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  replyTxt: { color: c.onBrandTertiary, fontSize: 12, marginTop: 2 },

  forWhom: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  forWhomActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  forWhomTxt: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
  forWhomTxtActive: { color: c.onBrandPrimary },
}));
