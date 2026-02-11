import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Alert, TouchableOpacity, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// 1. 定义类型
type ProfileType = 'Baby' | 'Allergy';

const rules: Record<ProfileType, string[]> = {
  'Baby': ['honey', 'sugar', 'salt', 'palm oil', 'additive'],
  'Allergy': ['peanuts', 'milk', 'egg', 'gluten', 'soy']
};

export default function TabOneScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [profile, setProfile] = useState<ProfileType>('Baby');
  
  // 【关键】使用 useRef 创建一个“物理锁”，它不随组件重新渲染而改变，且修改是同步的
  const isProcessing = useRef(false);

  useEffect(() => {
    requestPermission();
  }, []);

  // 2. 扫码处理函数
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    // 如果物理锁已经锁上，或者 React 状态显示已扫码，直接跳出
    if (isProcessing.current || scanned) return;

    // 立即上锁
    isProcessing.current = true;
    setScanned(true);

    console.log("The barcode is being recognized:", data);

    // 调用 API
    fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`)
      .then(res => res.json())
      .then(json => {
        if (json.status === 1) {
          const product = json.product;
          const ingredients = (product.ingredients_text || "").toLowerCase();
          const forbidden = rules[profile];
          const matched = forbidden.filter(item => ingredients.includes(item));
          
          const title = matched.length > 0 ? "⚠️ Forbidden Ingredients Found" : "✅ Safe";
          const message = `Product: ${product.product_name || 'Unknown'}\n\n${
            matched.length > 0 
            ? `Current 【${profile}】 mode matches: contains ${matched.join(', ')}` 
            : "No forbidden ingredients found, safe to use."
          }`;

          // 弹出 Alert，只有点“好的”才会解锁
          Alert.alert(title, message, [
            { 
              text: "OK", 
              onPress: () => {
                isProcessing.current = false; // 解开物理锁
                setScanned(false);           // 解开状态锁
              } 
            }
          ]);
        } else {
          Alert.alert("Not Found", `No information found in the database for barcode ${data}`, [
            { text: "Retry", onPress: () => { isProcessing.current = false; setScanned(false); } }
          ]);
        }
      })
      .catch((err) => {
        Alert.alert("Error", "Network request failed");
        isProcessing.current = false;
        setScanned(false);
      });
  };

  if (!permission) return <View style={styles.center}><Text>Loading...</Text></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{ marginBottom: 20 }}>Camera permission is required to scan</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Authorize Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 顶部状态栏 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>Current Mode</Text>
          <Text style={styles.headerValue}>{profile}</Text>
        </View>
        <TouchableOpacity 
          style={styles.switchButton} 
          onPress={() => setProfile(prev => prev === 'Baby' ? 'Allergy' : 'Baby')}
        >
          <Text style={styles.buttonText}>Switch Mode</Text>
        </TouchableOpacity>
      </View>

      {/* 扫码区域 */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        // 【重要】如果已扫码，直接不传入回调函数，彻底关闭底层监听
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "upc_a", "upc_e"], 
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.maskSide} />
          <View style={styles.maskCenterRow}>
            <View style={styles.maskSide} />
            <View style={styles.focusedFrame}>
               {/* 四个角的小装饰 */}
               <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 }]} />
               <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 }]} />
               <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
               <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 }]} />
            </View>
            <View style={styles.maskSide} />
          </View>
          <View style={styles.maskSide} />
        </View>
      </CameraView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Please align the barcode within the blue frame</Text>
      </View>
    </View>
  );
}

const { width } = Dimensions.get('window');
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    position: 'absolute', top: 50, left: 20, right: 20, 
    zIndex: 10, flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.8)', padding: 15, borderRadius: 12, alignItems: 'center'
  },
  headerLabel: { color: '#aaa', fontSize: 12 },
  headerValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  switchButton: { backgroundColor: '#2f95dc', padding: 10, borderRadius: 8 },
  button: { backgroundColor: '#2f95dc', padding: 15, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  
  // 扫码框遮罩
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  maskSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', width: '100%' },
  maskCenterRow: { flexDirection: 'row', height: 220 },
  focusedFrame: { 
    width: width * 0.7, height: 220, 
    backgroundColor: 'transparent', position: 'relative' 
  },
  corner: { position: 'absolute', width: 20, height: 20, borderColor: '#2f95dc' },

  footer: { position: 'absolute', bottom: 60, width: '100%', alignItems: 'center' },
  footerText: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 20 },
});