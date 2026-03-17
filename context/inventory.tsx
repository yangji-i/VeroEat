import { registerForPushNotificationsAsync } from "@/utils/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProfile } from "./ProfileContext";

export type RecallStatus = "none" | "recalled";

export interface InventoryItem {
  id: string;
  name: string;
  barcode: string;
  imageUrl?: string;
  addedAt: number;
  scannedBy?: string;
  isSafe?: boolean;
  expiryDate?: number;
  ingredientsSummary?: string;
  lotCode?: string;
  mfgDate?: string;

  recallStatus?: RecallStatus;
  recallTitle?: string;
  recallReason?: string;
  recalledAt?: number;
  lastRecallCheckedAt?: number;
}

type InventoryByProfile = Record<string, InventoryItem[]>;
type RecallSettingsByProfile = Record<string, boolean>;
type PushTokenByProfile = Record<string, string | null>;

type InventoryContextValue = {
  items: InventoryItem[];

  addItem: (item: {
    name: string;
    barcode: string;
    imageUrl?: string;
    scannedBy?: string;
    isSafe?: boolean;
    expiryDate?: number;
    ingredientsSummary?: string;

    lotCode?: string;   // ✅ 新增
    mfgDate?: string;   // ✅ 新增
  }) => boolean;

  removeItem: (id: string) => void;
  clear: () => void;
  removeItemsByProfile: (profileName: string) => void;

  recallAlertsEnabled: boolean;
  setRecallAlertsEnabled: (enabled: boolean) => Promise<void>;

  markItemRecall: (
    id: string,
    recallData: {
      recallStatus: RecallStatus;
      recallTitle?: string;
      recallReason?: string;
      recalledAt?: number;
      lastRecallCheckedAt?: number;
    },
  ) => void;

  markAllItemsChecked: (checkedAt: number) => void;

  refreshCurrentProfileFromBackend: () => Promise<void>;
  runRecallCheckForCurrentProfile: () => Promise<void>;
};

const INVENTORY_STORAGE_KEY = "inventory_by_profile_v1";
const RECALL_SETTINGS_STORAGE_KEY = "recall_alert_settings_v1";
const PUSH_TOKEN_STORAGE_KEY = "push_tokens_by_profile_v1";
const BACKEND_BASE_URL = "http://35.2.54.101:8000";

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const currentProfileName = profile.name || "Guest";

  const [inventoryByProfile, setInventoryByProfile] =
    useState<InventoryByProfile>({});
  const [recallSettingsByProfile, setRecallSettingsByProfile] =
    useState<RecallSettingsByProfile>({});
  const [pushTokenByProfile, setPushTokenByProfile] =
    useState<PushTokenByProfile>({});
  const [isHydrated, setIsHydrated] = useState(false);

  const isApplyingRemoteDataRef = useRef(false);
  const backendUnavailableUntilRef = useRef(0);
  const BACKEND_RETRY_COOLDOWN_MS = 15000;

  const shouldSkipBackendCalls = () => {
    return Date.now() < backendUnavailableUntilRef.current;
  };

  const markBackendTemporarilyUnavailable = () => {
    backendUnavailableUntilRef.current = Date.now() + BACKEND_RETRY_COOLDOWN_MS;
  };

  useEffect(() => {
    const hydrate = async () => {
      try {
        const savedInventory = await AsyncStorage.getItem(
          INVENTORY_STORAGE_KEY,
        );
        const savedRecallSettings = await AsyncStorage.getItem(
          RECALL_SETTINGS_STORAGE_KEY,
        );
        const savedPushTokens = await AsyncStorage.getItem(
          PUSH_TOKEN_STORAGE_KEY,
        );

        if (savedInventory) {
          setInventoryByProfile(JSON.parse(savedInventory));
        }

        if (savedRecallSettings) {
          setRecallSettingsByProfile(JSON.parse(savedRecallSettings));
        }

        if (savedPushTokens) {
          setPushTokenByProfile(JSON.parse(savedPushTokens));
        }
      } catch (e) {
        console.error("Failed to load inventory cache", e);
      } finally {
        setIsHydrated(true);
      }
    };

    hydrate();
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(
      INVENTORY_STORAGE_KEY,
      JSON.stringify(inventoryByProfile),
    ).catch(console.error);
  }, [inventoryByProfile, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(
      RECALL_SETTINGS_STORAGE_KEY,
      JSON.stringify(recallSettingsByProfile),
    ).catch(console.error);
  }, [recallSettingsByProfile, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(
      PUSH_TOKEN_STORAGE_KEY,
      JSON.stringify(pushTokenByProfile),
    ).catch(console.error);
  }, [pushTokenByProfile, isHydrated]);

  const items = inventoryByProfile[currentProfileName] || [];

  const addItem: InventoryContextValue["addItem"] = ({
    name,
    barcode,
    imageUrl,
    scannedBy,
    isSafe,
    expiryDate,
    ingredientsSummary,
    lotCode,
    mfgDate,
  }) => {
    const uniqueId = `item_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    const newItem: InventoryItem = {
      id: uniqueId,
      name,
      barcode,
      imageUrl,
      scannedBy: scannedBy || currentProfileName,
      isSafe,
      expiryDate,
      ingredientsSummary,
      lotCode,
      mfgDate,
      addedAt: Date.now(),
      recallStatus: "none",
      recallTitle: "",
      recallReason: "",
      recalledAt: undefined,
      lastRecallCheckedAt: undefined,
    };

    setInventoryByProfile((prev) => {
      const currentItems = prev[currentProfileName] || [];
      return {
        ...prev,
        [currentProfileName]: [newItem, ...currentItems],
      };
    });

    return true;
  };

  const removeItem = (id: string) => {
    setInventoryByProfile((prev) => {
      const currentItems = prev[currentProfileName] || [];
      return {
        ...prev,
        [currentProfileName]: currentItems.filter((x) => x.id !== id),
      };
    });
  };

  const clear = () => {
    setInventoryByProfile((prev) => ({
      ...prev,
      [currentProfileName]: [],
    }));
  };

  const removeItemsByProfile = (profileName: string) => {
    setInventoryByProfile((prev) => ({
      ...prev,
      [profileName]: [],
    }));
  };

  const setRecallAlertsEnabled = async (enabled: boolean) => {
    setRecallSettingsByProfile((prev) => ({
      ...prev,
      [currentProfileName]: enabled,
    }));
  };

  const markItemRecall: InventoryContextValue["markItemRecall"] = (
    id,
    recallData,
  ) => {
    setInventoryByProfile((prev) => {
      const currentItems = prev[currentProfileName] || [];
      return {
        ...prev,
        [currentProfileName]: currentItems.map((item) =>
          item.id === id
            ? {
                ...item,
                recallStatus: recallData.recallStatus,
                recallTitle: recallData.recallTitle ?? item.recallTitle,
                recallReason: recallData.recallReason ?? item.recallReason,
                recalledAt: recallData.recalledAt ?? item.recalledAt,
                lastRecallCheckedAt:
                  recallData.lastRecallCheckedAt ?? item.lastRecallCheckedAt,
              }
            : item,
        ),
      };
    });
  };

  const markAllItemsChecked = (checkedAt: number) => {
    setInventoryByProfile((prev) => {
      const currentItems = prev[currentProfileName] || [];
      return {
        ...prev,
        [currentProfileName]: currentItems.map((item) => ({
          ...item,
          lastRecallCheckedAt: checkedAt,
        })),
      };
    });
  };

  const recallAlertsEnabled =
    recallSettingsByProfile[currentProfileName] === undefined
      ? true
      : recallSettingsByProfile[currentProfileName];

  const expoPushToken =
    pushTokenByProfile[currentProfileName] === undefined
      ? null
      : pushTokenByProfile[currentProfileName];

  const refreshCurrentProfileFromBackend = async () => {
    if (!currentProfileName || currentProfileName === "Guest") return;
    if (shouldSkipBackendCalls()) return;

    try {
      const [inventoryRes, settingsRes] = await Promise.all([
        fetch(
          `${BACKEND_BASE_URL}/inventory/${encodeURIComponent(currentProfileName)}`,
        ),
        fetch(
          `${BACKEND_BASE_URL}/recall-settings/${encodeURIComponent(currentProfileName)}`,
        ),
      ]);

      const inventoryJson = await inventoryRes.json();
      const settingsJson = await settingsRes.json();

      const remoteItems: InventoryItem[] = Array.isArray(inventoryJson?.items)
        ? inventoryJson.items
        : [];

      const remoteRecallEnabled =
        typeof settingsJson?.settings?.recallAlertsEnabled === "boolean"
          ? settingsJson.settings.recallAlertsEnabled
          : true;

      const remotePushToken =
        typeof settingsJson?.settings?.expoPushToken === "string"
          ? settingsJson.settings.expoPushToken
          : null;

      isApplyingRemoteDataRef.current = true;

      setInventoryByProfile((prev) => ({
        ...prev,
        [currentProfileName]: remoteItems,
      }));

      setRecallSettingsByProfile((prev) => ({
        ...prev,
        [currentProfileName]: remoteRecallEnabled,
      }));

      setPushTokenByProfile((prev) => ({
        ...prev,
        [currentProfileName]:
          prev[currentProfileName] ?? remotePushToken ?? null,
      }));

      setTimeout(() => {
        isApplyingRemoteDataRef.current = false;
      }, 0);
    } catch (e) {
      console.log("Failed to refresh current profile inventory/settings:", e);
      markBackendTemporarilyUnavailable();
    }
  };

  const runRecallCheckForCurrentProfile = async () => {
    if (!currentProfileName || currentProfileName === "Guest") return;
    if (shouldSkipBackendCalls()) return;

    try {
      await fetch(
        `${BACKEND_BASE_URL}/recall/check/${encodeURIComponent(
          currentProfileName,
        )}`,
        {
          method: "POST",
        },
      );

      await refreshCurrentProfileFromBackend();
    } catch (e) {
      console.log("Failed to run recall check for current profile:", e);
      markBackendTemporarilyUnavailable();
    }
  };

  // 当前 profile 可用时，尝试获取 push token（每个 profile 本地记一份）
  useEffect(() => {
    if (!isHydrated) return;
    if (!currentProfileName || currentProfileName === "Guest") return;
    if (pushTokenByProfile[currentProfileName] !== undefined) return;

    const setupPushToken = async () => {
      const token = await registerForPushNotificationsAsync();

      setPushTokenByProfile((prev) => ({
        ...prev,
        [currentProfileName]: token,
      }));
    };

    setupPushToken();
  }, [currentProfileName, isHydrated, pushTokenByProfile]);

  // 当前 profile 切换时，从后端拉 inventory 和 recall settings
  useEffect(() => {
    if (!isHydrated) return;
    if (!currentProfileName || currentProfileName === "Guest") return;

    refreshCurrentProfileFromBackend();
  }, [currentProfileName, isHydrated]);

  // 当前 profile 的 inventory 变化时，自动同步到后端
  useEffect(() => {
    if (!isHydrated) return;
    if (!currentProfileName || currentProfileName === "Guest") return;
    if (isApplyingRemoteDataRef.current) return;
    if (shouldSkipBackendCalls()) return;

    const syncInventoryToBackend = async () => {
      try {
        await fetch(`${BACKEND_BASE_URL}/inventory/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: currentProfileName,
            items,
          }),
        });
      } catch (e) {
        console.log("Inventory sync failed:", e);
        markBackendTemporarilyUnavailable();
      }
    };

    syncInventoryToBackend();
  }, [items, currentProfileName, isHydrated]);

  // 当前 profile 的 recall 开关 / push token 变化时，自动同步到后端
  useEffect(() => {
    if (!isHydrated) return;
    if (!currentProfileName || currentProfileName === "Guest") return;
    if (isApplyingRemoteDataRef.current) return;
    if (shouldSkipBackendCalls()) return;

    const syncRecallSettingsToBackend = async () => {
      try {
        await fetch(`${BACKEND_BASE_URL}/recall-settings/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: currentProfileName,
            recallAlertsEnabled,
            expoPushToken,
          }),
        });
      } catch (e) {
        console.log("Recall settings sync failed:", e);
        markBackendTemporarilyUnavailable();
      }
    };

    syncRecallSettingsToBackend();
  }, [recallAlertsEnabled, expoPushToken, currentProfileName, isHydrated]);

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      clear,
      removeItemsByProfile,
      recallAlertsEnabled,
      setRecallAlertsEnabled,
      markItemRecall,
      markAllItemsChecked,
      refreshCurrentProfileFromBackend,
      runRecallCheckForCurrentProfile,
    }),
    [items, recallAlertsEnabled],
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx)
    throw new Error("useInventory must be used inside InventoryProvider");
  return ctx;
}
