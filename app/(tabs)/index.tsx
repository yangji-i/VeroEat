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
          const title = matched.length > 0 ? "⚠️ 风险警告" : "✅ 安全食用";
          const message = `产品: ${product.product_name || '未知'}\n\n${
            matched.length > 0 
            ? `不符合 ${profile} 模式：含有 ${matched.join(', ')}` 
            : "该产品成分符合您的档案需求。"
          }`;

          Alert.alert(title, message, [{ text: "好的", onPress: () => setScanned(false) }]);
        } else {
          Alert.alert("未找到", `条码 ${data} 不在数据库中`, [{ text: "重试", onPress: () => setScanned(false) }]);
        }
      })
      .catch(() => {
        Alert.alert("错误", "网络连接失败");
        setScanned(false);
      });
  };

  if (hasPermission === null) return <View style={styles.center}><Text>正在请求相机权限...</Text></View>;
  if (hasPermission === false) return <View style={styles.center}><Text>无相机权限，请在设置中开启</Text></View>;

  return (
    <View style={styles.container}>
      {/* 顶部档案切换 */}
      <View style={styles.header}>
        <Text style={styles.headerText}>当前模式: {profile}</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => setProfile(prev => prev === 'Baby' ? 'Allergy' : 'Baby')}
        >
          <Text style={styles.buttonText}>切换档案</Text>
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
        <Text style={styles.footerText}>请将条形码置于框内</Text>
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