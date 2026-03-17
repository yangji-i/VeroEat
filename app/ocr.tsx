import { useInventory } from "@/context/inventory";
import { useProfile } from "@/context/ProfileContext";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// ✅ 先做占位：未来可替换为真实 OCR API
async function mockOcrExtractText(_base64: string): Promise<string> {
  // 你也可以返回 "" 来模拟识别失败
  return "LOT: A12B3C\nMFG: 2026-02-01\nEXP: 2026-08-01";
}

function parseLotDates(raw: string) {
  const text = raw || "";
  const lotMatch =
    text.match(/(?:LOT|BATCH|LOT#|LOT\s*CODE)\s*[:#]?\s*([A-Z0-9\-]+)/i) ||
    text.match(/\b([A-Z0-9]{5,})\b/); // fallback：一串较长字母数字
  const mfgMatch = text.match(/(?:MFG|MANUFACTURED)\s*[:#]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  const expMatch =
    text.match(/(?:EXP|EXPIRES|BEST\s*BY|BB)\s*[:#]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);

  return {
    lotCode: lotMatch?.[1] ?? "",
    mfgDate: mfgMatch?.[1] ?? "",
    expDate: expMatch?.[1] ?? "",
  };
}

export default function OcrScreen() {
  const params = useLocalSearchParams<{
    name?: string;
    barcode?: string;
    isSafe?: string;
    ingredientsSummary?: string;
  }>();

  const productName = params.name ?? "Unknown Product";
  const barcode = params.barcode ?? "";
  const isSafe = params.isSafe === "true";
  const ingredientsSummary = params.ingredientsSummary ?? "";

  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const parsed = useMemo(() => parseLotDates(rawText), [rawText]);
  const [lotCode, setLotCode] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [expDate, setExpDate] = useState("");

  const { profile } = useProfile();
  const { addItem } = useInventory();

  // 初始化权限
  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={{ marginBottom: 12 }}>Need camera permission</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePhoto = async () => {
    try {
      setLoading(true);
      // @ts-ignore: CameraView typing differs by Expo versions
      const pic = await camRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
      if (!pic?.uri) {
        Alert.alert("Camera", "Could not take photo.");
        return;
      }
      setPhotoUri(pic.uri);
      setPhotoBase64(pic.base64 ?? null);

      // ✅ OCR（目前 mock）
      const text = await mockOcrExtractText(pic.base64 ?? "");
      setRawText(text);

      const p = parseLotDates(text);
      setLotCode(p.lotCode);
      setMfgDate(p.mfgDate);
      setExpDate(p.expDate);
    } catch (e) {
      Alert.alert("Error", "Failed to take photo.");
    } finally {
      setLoading(false);
    }
  };

  const saveToInventory = () => {
    if (!barcode) {
      Alert.alert("Missing barcode", "Cannot save without a barcode.");
      return;
    }

    // 这里不强制必须有 lot/date：OCR 可能失败，允许空
    const expTimestamp =
      expDate && !isNaN(new Date(expDate).getTime()) ? new Date(expDate).getTime() : undefined;

    const payload = {
      name: productName,
      barcode,
      scannedBy: profile.name || "Guest",
      isSafe,
      expiryDate: expTimestamp,
      ingredientsSummary,

      // ✅ 新增字段（可选）：如果你们 inventory 类型不接收，后面我会教你们在 context/inventory 里加上
      lotCode: lotCode || undefined,
      mfgDate: mfgDate || undefined,
    };

    // 避免 TS 卡住：先用 as any 兼容现有 addItem 类型
    const added = addItem(payload);

    if (added) {
      Alert.alert("Saved", "Item saved to inventory.", [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/inventory"),
        },
      ]);
    }
  };

  const skipAndSave = () => {
    setLotCode("");
    setMfgDate("");
    setExpDate("");
    saveToInventory();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Lot / Date</Text>
      <Text style={styles.subtitle}>
        Product: <Text style={{ fontWeight: "700" }}>{productName}</Text>
      </Text>

      {!photoUri ? (
        <View style={styles.cameraWrap}>
          <CameraView ref={camRef as any} style={styles.camera} />
          <View style={styles.cameraHint}>
            <Text style={styles.hintText}>Aim at the printed lot/date text (喷码区)</Text>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={takePhoto}>
            <Text style={styles.btnText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={skipAndSave}>
            <Text style={styles.secondaryText}>Skip OCR and Save</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />

          <Text style={styles.sectionTitle}>OCR Raw Text (debug)</Text>
          <Text style={styles.rawBox}>{rawText || "(empty)"}</Text>

          <Text style={styles.sectionTitle}>Confirm / Edit</Text>

          <Text style={styles.label}>Lot Code</Text>
          <TextInput value={lotCode} onChangeText={setLotCode} style={styles.input} placeholder="e.g., A12B3C" />

          <Text style={styles.label}>MFG Date (YYYY-MM-DD)</Text>
          <TextInput value={mfgDate} onChangeText={setMfgDate} style={styles.input} placeholder="e.g., 2026-02-01" />

          <Text style={styles.label}>EXP / Best By (YYYY-MM-DD)</Text>
          <TextInput value={expDate} onChangeText={setExpDate} style={styles.input} placeholder="e.g., 2026-08-01" />

          <TouchableOpacity style={styles.primaryBtn} onPress={saveToInventory}>
            <Text style={styles.btnText}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
            <Text style={styles.secondaryText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#444", marginBottom: 12 },
  cameraWrap: { flex: 1 },
  camera: { height: 420, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" },
  cameraHint: { marginTop: 10, marginBottom: 10 },
  hintText: { color: "#555" },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "800" },
  secondaryBtn: { marginTop: 10, paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: "#2563EB", fontWeight: "700" },
  preview: { width: "100%", height: 240, backgroundColor: "#F3F4F6", borderRadius: 12 },
  sectionTitle: { marginTop: 14, fontWeight: "800" },
  rawBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    color: "#111827",
  },
  label: { marginTop: 10, fontWeight: "700" },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 10,
    borderRadius: 10,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});