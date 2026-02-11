import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, Alert, TouchableOpacity } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';

export default function TabOneScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [profile, setProfile] = useState<'Baby' | 'Allergy'>('Baby');

  // 模拟规则
  const rules = {
    'Baby': ['honey', 'sugar', 'salt', 'palm oil'],
    'Allergy': ['peanuts', 'milk', 'egg', 'gluten']
  };

  useEffect(() => {
    const getBarCodeScannerPermissions = async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getBarCodeScannerPermissions();
  }, []);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);
    
    // 调用 Open Food Facts API
    fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`)
      .then(res => res.json())
      .then(json => {
        if (json.status === 1) {
          const product = json.product;
          const ingredients = (product.ingredients_text || "").toLowerCase();
          const forbidden = rules[profile];
          
          // 逻辑匹配
          const matched = forbidden.filter(item => ingredients.includes(item));
          
          // 弹出结果（Demo 第一步先用 Alert，稳住后再做自定义 UI）
          const title = matched.length > 0 ? "⚠️ Warning" : "✅ Safe";
          const message = `Product: ${product.product_name || 'unknown'}\n\n${
            matched.length > 0 
            ? `Do not match ${profile} mode：Contains ${matched.join(', ')}` 
            : "This product is safe"
          }`;

          Alert.alert(title, message, [{ text: "好的", onPress: () => setScanned(false) }]);
        } else {
          Alert.alert("Not Found", `Barcode ${data} not in database`, [{ text: "Please try again", onPress: () => setScanned(false) }]);
        }
      })
      .catch(() => {
        Alert.alert("Error", "Connection Lost");
        setScanned(false);
      });
  };

  if (hasPermission === null) return <View style={styles.center}><Text>Camera Permission Required...</Text></View>;
  if (hasPermission === false) return <View style={styles.center}><Text>No camera permission provided</Text></View>;

  return (
    <View style={styles.container}>
      {/* 顶部档案切换 */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Current Mode: {profile}</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => setProfile(prev => prev === 'Baby' ? 'Allergy' : 'Baby')}
        >
          <Text style={styles.buttonText}>Change Profile</Text>
        </TouchableOpacity>
      </View>

      {/* 扫码区域 */}
      <View style={styles.scannerContainer}>
        <BarCodeScanner
          onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
        {/* 扫描框辅助视觉 */}
        <View style={styles.layerTop} />
        <View style={styles.layerCenter}>
          <View style={styles.layerLeft} />
          <View style={styles.focused} />
          <View style={styles.layerRight} />
        </View>
        <View style={styles.layerBottom} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Place barcode inside the frame</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    position: 'absolute', top: 40, width: '100%', zIndex: 10, 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 15
  },
  headerText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  button: { backgroundColor: '#2f95dc', padding: 8, borderRadius: 5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  scannerContainer: { flex: 1 },
  footer: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  footerText: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 20 },
  
  // 扫描框遮罩样式
  layerTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  layerCenter: { flex: 2, flexDirection: 'row' },
  layerLeft: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  focused: { flex: 10, borderWidth: 2, borderColor: '#2f95dc', borderRadius: 10 },
  layerRight: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  layerBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
});
