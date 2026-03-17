// FILE: app/_layout.tsx
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { InventoryProvider } from "@/context/inventory";
import { ProfileProvider } from "@/context/ProfileContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <ProfileProvider>
        <InventoryProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="modal"
              options={{ presentation: "modal", title: "Modal" }}
            />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="ocr" options={{ title: "Scan Lot/Date" }} />
          </Stack>
        </InventoryProvider>
      </ProfileProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
