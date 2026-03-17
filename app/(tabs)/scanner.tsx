import { useInventory } from "@/context/inventory";
import { useProfile } from "@/context/ProfileContext";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { styles } from './scanner.styles';

const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  peanuts: ["peanut", "peanuts", "groundnut"],
  milk: ["milk", "whey", "casein", "butter", "cream", "cheese", "lactose"],
  egg: ["egg", "eggs"],
  gluten: ["gluten", "barley", "rye", "malt"],
  soy: ["soy", "soybean"],
  "tree nuts": ["almond", "cashew", "walnut", "pecan"],
  fish: ["fish", "salmon", "tuna"],
  "crustacean shellfish": ["shrimp", "crab", "lobster"],
  wheat: ["wheat", "wheat flour"],
  sesame: ["sesame", "sesame oil"],
};

const BABY_RULES = ["honey", "sugar", "salt", "palm oil"];
interface ScanResult {
  type: "safe" | "unsafe" | "not_found";
  name: string;
  barcode: string;
  ingredients: string;
  imageUrl: string | null;
  matchedAllergens: string[];
  currentMode: string;
}
export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const {
    profile: userProfile,
    profiles,
    switchProfile,
    isLoading: isContextLoading,
  } = useProfile();
  const { addItem } = useInventory();

  const isProcessing = useRef(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const resetScanner = () => {
    isProcessing.current = false;
    setScanned(false);
    setShowDetails(false);
  };

  // --- 新增：调用 AI 总结成分 ---
  const fetchIngredientsSummary = async (ingredientsText: string) => {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "enter your API key", // 🚨 在这里输入你的 API Key
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: `Summarize these food ingredients into a concise, readable English list. Highlight potential allergens. Original ingredients: ${ingredientsText}`,
            },
          ],
        }),
      });
      const result = await response.json();
      return result.content?.[0]?.text || "No ingredient summary available";
    } catch (err) {
      console.error("AI Summary Error:", err);
      return "No ingredient summary available";
    }
  };

  // --- 修改：添加至清单并跳转至OCR扫描 ---
  const prepareAddToInventory = async (
    name: string,
    barcode: string,
    isSafe: boolean,
    rawIngredients: string,
  ) => {
    setLoadingAI(true);
  
    const summary = await fetchIngredientsSummary(rawIngredients);
  
    setLoadingAI(false);
  
    router.push({
      pathname: "/ocr",
      params: {
        name,
        barcode,
        isSafe: String(isSafe),
        ingredientsSummary: summary,
      },
    });
  };

  const fetchAIRecommendation = async (
    unsafeProduct: string,
    reason: string,
  ) => {
    setScanResult(null);
    setLoadingAI(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "enter your API key",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: `Product: ${unsafeProduct}. Issue: ${reason}. Suggest 1 safe alternative. Return ONLY JSON: {"recommendation": "name", "brand": "brand"}`,
            },
          ],
        }),
      });
      const result = await response.json();
      const rawText = result.content?.[0]?.text || "{}";
      const data = JSON.parse(rawText);
      Alert.alert(
        "AI Recommendation",
        `You can try: ${data.recommendation}\nBrand: ${data.brand}`,
        [{ text: "OK", onPress: resetScanner }],
      );
    } catch {
      Alert.alert("AI Error", "Failed to fetch recommendation");
      resetScanner();
    } finally {
      setLoadingAI(false);
    }
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (isProcessing.current || scanned) return;
    isProcessing.current = true;
    setScanned(true);

    fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`)
      .then((res) => res.json())
      .then((json) => {
        if (json.status !== 1) {
          Alert.alert("Not Found", "Barcode not recognized", [
            { text: "Try Again", onPress: resetScanner },
          ]);
          return;
        }

        const product = json.product;
        const name = product.product_name || "Unknown Product";
        const ingredients = (product.ingredients_text || "").toLowerCase();
        const imageUrl = product.image_front_url || product.image_url || null;
        
        const currentMode = userProfile.name || "Guest";

        let matched: string[] = [];
        if (currentMode === "Baby") {
          matched = BABY_RULES.filter((r) => ingredients.includes(r));
        } else {
          const selectedAllergens = userProfile.allergens || [];
          matched = selectedAllergens.filter((allergen) => {
            const keywords = ALLERGEN_KEYWORDS[allergen] || [allergen];
            return keywords.some((k) => ingredients.includes(k));
          });
        }


        setScanResult({
          type: matched.length > 0 ? "unsafe" : "safe",
          name,
          barcode: data,
          ingredients,
          imageUrl,
          matchedAllergens: matched,
          currentMode,
        });
      })
      .catch(() => {
        Alert.alert("Error", "Network request failed");
        resetScanner();
      });
  };
  //       if (matched.length > 0) {
  //         Alert.alert(
  //           "⚠️ Warning (Mode: " + currentMode + ")",
  //           `${name}\n\nDetected ingredients: ${matched.join(", ")}`,
  //           [
  //             { text: "Back", style: "cancel", onPress: resetScanner },
  //             {
  //               text: "Still Add",
  //               onPress: () =>
  //                 prepareAddToInventory(name, data, false, ingredients),
  //             },
  //             {
  //               text: "Find Alternatives",
  //               onPress: () => fetchAIRecommendation(name, matched.join(",")),
  //             },
  //           ],
  //         );
  //       } else {
  //         Alert.alert(
  //           "Safe ✅",
  //           `Product: ${name}\nCurrent Mode: ${currentMode}\n\nNo allergens detected.`,
  //           [
  //             { text: "Back", style: "cancel", onPress: resetScanner },
  //             {
  //               text: "Add to Inventory",
  //               onPress: () =>
  //                 prepareAddToInventory(name, data, true, ingredients),
  //             },
  //           ],
  //         );
  //       }
  //     })
  //     .catch(() => {
  //       Alert.alert("Error", "Network request failed");
  //       resetScanner();
  //     });
  // };

  const renderHighlightedIngredients = (text: string, matchedAllergens: string[]) => {
    if (!text) return <Text style={{ color: "gray" }}>No ingredients listed.</Text>;
    let dangerWords: string[] = [];
    matchedAllergens.forEach((allergen) => {
      if (BABY_RULES.includes(allergen)) {
        dangerWords.push(allergen);
      } else {
        dangerWords.push(...(ALLERGEN_KEYWORDS[allergen] || [allergen]));
      }
    });
    const parts = text.split(/([,\s().]+)/);

    return parts.map((part, index) => {
      const isDanger = dangerWords.some((w) => part.toLowerCase().includes(w));
      return (
        <Text
          key={index}
          style={{
            color: isDanger ? "red" : "#333",
            fontWeight: isDanger ? "bold" : "normal",
          }}
        >
          {part}
        </Text>
      );
    });
  };

  if (!permission?.granted)
    return (
      <View style={styles.center}>
        <Text>Need Camera Permission</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      {/* 顶部 Profile 信息栏 */}
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.headerLabel}>Current Mode</Text>
          <Text style={styles.headerValue}>{userProfile.name || "Guest"}</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 4 }}
          >
            {userProfile.allergens.length > 0 ? (
              userProfile.allergens.map((a) => (
                <View key={a} style={styles.allergenChip}>
                  <Text style={styles.allergenChipText}>{a}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.headerSubtext}>
                {userProfile.name === "Baby"
                  ? "Baby safety mode is active"
                  : "No allergen restrictions"}
              </Text>
            )}
          </ScrollView>
        </View>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setShowProfiles(true)}
        >
          <Text style={styles.buttonText}>Switch</Text>
        </TouchableOpacity>
      </View>

      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      <View style={styles.scannerOverlay} pointerEvents="none">
        <View style={styles.scannerBox}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.scanText}>Please scan the barcode</Text>
      </View>

      {showProfiles && (
        <View style={styles.overlay}>
          <View style={styles.profileBox}>
            <Text style={styles.profileTitle}>Select Member</Text>
            {profiles.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.profileItem,
                  p === userProfile.name && styles.profileItemActive,
                ]}
                onPress={async () => {
                  setShowProfiles(false);
                  await switchProfile(p);
                }}
              >
                <Text
                  style={[
                    styles.profileText,
                    p === userProfile.name && styles.profileTextActive,
                  ]}
                >
                  {p} {p === userProfile.name ? "✓" : ""}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[
                styles.profileItem,
                { backgroundColor: "#F0FDF4", marginTop: 10, borderRadius: 10 },
              ]}
              onPress={() => {
                setShowProfiles(false);
                router.push({
                  pathname: "/login",
                  params: { canGoBack: "true" },
                });
              }}
            >
              <Text
                style={[
                  styles.profileText,
                  { color: "#16A34A", fontWeight: "bold" },
                ]}
              >
                + Create New Member
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowProfiles(false)}
              style={styles.cancel}
            >
              <Text style={{ color: "red", fontWeight: "bold", marginTop: 10 }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {scanResult && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <Text style={scanResult.type === "safe" ? styles.safeTitle : styles.warningTitle}>
              {scanResult.type === "safe" ? "Safe ✅" : `⚠️ Warning (${scanResult.currentMode})`}
            </Text>

            {scanResult.imageUrl && (
              <Image source={{ uri: scanResult.imageUrl }} style={styles.productImage} resizeMode="contain" />
            )}

            <Text style={styles.productName}>{scanResult.name}</Text>

            {/* 警告信息 */}
            {scanResult.type === "unsafe" ? (
              <Text style={styles.warningText}>
                Detected: {scanResult.matchedAllergens.join(", ")}
              </Text>
            ) : (
              <Text style={styles.safeText}>No allergens detected.</Text>
            )}

            {/* See Details 展开/收起组件 */}
            {showDetails ? (
              <View style={styles.detailsBox}>
                <ScrollView style={{ maxHeight: 150 }}>
                  <Text style={styles.ingredientsTitle}>Ingredients:</Text>
                  <Text style={styles.ingredientsText}>
                    {renderHighlightedIngredients(scanResult.ingredients, scanResult.matchedAllergens)}
                  </Text>
                </ScrollView>
                <TouchableOpacity onPress={() => setShowDetails(false)}>
                  <Text style={styles.toggleText}>Hide Details ▲</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowDetails(true)}>
                <Text style={styles.toggleText}>See Details ▼</Text>
              </TouchableOpacity>
            )}

            {/* 操作按钮区 */}
            <View style={styles.actionRow}>
              {scanResult.type === "unsafe" && (
                <TouchableOpacity
                  style={styles.findAltButton}
                  onPress={() => fetchAIRecommendation(scanResult.name, scanResult.matchedAllergens.join(","))}
                >
                  <Text style={styles.buttonText}>Find Alternatives</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={scanResult.type === "safe" ? styles.addButtonSafe : styles.addButtonUnsafe}
                onPress={() =>
                  prepareAddToInventory(
                    scanResult.name,
                    scanResult.barcode,
                    scanResult.type === "safe",
                    scanResult.ingredients
                  )
                }
              >
                <Text style={styles.buttonText}>{scanResult.type === "safe" ? "Add to Inventory" : "Still Add"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={resetScanner} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Back to Scanner</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {(isContextLoading || loadingAI) && (
        <View style={styles.fullLoading} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}
