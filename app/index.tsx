import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Stack, useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

type OrderStatus =
  | "new"
  | "assigned"
  | "on_the_way"
  | "arrived"
  | "done"
  | "cancelled";

type Order = {
  id: string;
  status: OrderStatus;
  package_id: string | null;
  package_label: string | null;
  package_price: number | null;
  total: number | null;
  address: string | null;
  phone: string | null;
  payment_method: string | null;
  courier_id: string | null;
  created_at: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
};

type Courier = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string | null;
};

type Coords = {
  latitude: number;
  longitude: number;
};

const COURIER_STORAGE_KEY = "courier_id";

const SECTION_TITLES = {
  active: "Мой активный заказ",
  new: "Новые заказы",
  assigned: "Мои заказы",
  on_the_way: "В пути",
  arrived: "Прибыл",
};

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)} ₽`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPaymentMethod(value: string | null | undefined) {
  switch (value) {
    case "cash":
      return "Наличные";
    case "card":
      return "Карта";
    case "sbp":
      return "СБП";
    default:
      return "—";
  }
}

function getOrderCoords(order: Order): Coords | null {
  const latitude =
    typeof order.latitude === "number"
      ? order.latitude
      : typeof order.lat === "number"
      ? order.lat
      : null;

  const longitude =
    typeof order.longitude === "number"
      ? order.longitude
      : typeof order.lng === "number"
      ? order.lng
      : null;

  if (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude)
  ) {
    return { latitude, longitude };
  }

  return null;
}

function haversineDistance(a: Coords, b: Coords) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) *
      Math.sin(dLon / 2) *
      Math.cos(lat1) *
      Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function formatDistance(distance: number | null) {
  if (distance == null || Number.isNaN(distance)) return "—";
  if (distance < 1000) return `${Math.round(distance)} м`;
  return `${(distance / 1000).toFixed(1)} км`;
}

function getStatusMeta(status: OrderStatus) {
  switch (status) {
    case "new":
      return {
        label: "Новый",
        bg: "#DBEAFE",
        color: "#2563EB",
      };
    case "assigned":
      return {
        label: "Назначен",
        bg: "#EDE9FE",
        color: "#7C3AED",
      };
    case "on_the_way":
      return {
        label: "В пути",
        bg: "#FFEDD5",
        color: "#EA580C",
      };
    case "arrived":
      return {
        label: "Прибыл",
        bg: "#D1FAE5",
        color: "#059669",
      };
    case "done":
      return {
        label: "Завершён",
        bg: "#DCFCE7",
        color: "#16A34A",
      };
    case "cancelled":
      return {
        label: "Отменён",
        bg: "#FEE2E2",
        color: "#DC2626",
      };
  }
}

function sortOrders(orders: Order[], courierLocation: Coords | null) {
  return [...orders].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

    if (!courierLocation) {
      return bTime - aTime;
    }

    const aCoords = getOrderCoords(a);
    const bCoords = getOrderCoords(b);

    const aDistance = aCoords
      ? haversineDistance(courierLocation, aCoords)
      : Number.MAX_SAFE_INTEGER;

    const bDistance = bCoords
      ? haversineDistance(courierLocation, bCoords)
      : Number.MAX_SAFE_INTEGER;

    if (aDistance !== bDistance) {
      return aDistance - bDistance;
    }

    return bTime - aTime;
  });
}

async function atomicAssignOrder(orderId: string, courierId: string) {
  const { data, error } = await supabase
    .from("orders")
    .update({
      courier_id: courierId,
      status: "assigned",
    })
    .eq("id", orderId)
    .eq("status", "new")
    .is("courier_id", null)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Order;
}

type OrderCardProps = {
  order: Order;
  courierLocation: Coords | null;
  onOpen: (orderId: string) => void;
  onTake?: (orderId: string) => void;
  takingOrderId: string | null;
};

function OrderCard({
  order,
  courierLocation,
  onOpen,
  onTake,
  takingOrderId,
}: OrderCardProps) {
  const statusMeta = getStatusMeta(order.status);
  const coords = getOrderCoords(order);

  const distance = useMemo(() => {
    if (!courierLocation || !coords) return null;
    return haversineDistance(courierLocation, coords);
  }, [courierLocation, coords]);

  const isTaking = takingOrderId === order.id;

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderCardTop}>
        <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
          <Text style={[styles.badgeText, { color: statusMeta.color }]}>
            {statusMeta.label}
          </Text>
        </View>

        <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
      </View>

      <Text style={styles.orderAddress}>{order.address || "Адрес не указан"}</Text>

      <View style={styles.metaGrid}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Сумма</Text>
          <Text style={styles.metaValue}>{formatPrice(order.total)}</Text>
        </View>

        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Расстояние</Text>
          <Text style={styles.metaValue}>{formatDistance(distance)}</Text>
        </View>

        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Пакет</Text>
          <Text style={styles.metaValue}>{order.package_label || "—"}</Text>
        </View>

        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Оплата</Text>
          <Text style={styles.metaValue}>
            {formatPaymentMethod(order.payment_method)}
          </Text>
        </View>
      </View>

      <View style={styles.orderCardBottom}>
        <Text style={styles.createdAt}>Создан: {formatDate(order.created_at)}</Text>

        <View style={styles.orderActions}>
          <TouchableOpacity
            style={styles.openButton}
            onPress={() => onOpen(order.id)}
          >
            <Text style={styles.openButtonText}>Открыть</Text>
          </TouchableOpacity>

          {order.status === "new" && onTake ? (
            <TouchableOpacity
              style={[styles.takeButton, isTaking && styles.buttonDisabled]}
              onPress={() => onTake(order.id)}
              disabled={isTaking}
            >
              {isTaking ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.takeButtonText}>Взять заказ</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

type SectionProps = {
  title: string;
  orders: Order[];
  courierLocation: Coords | null;
  emptyText: string;
  onOpen: (orderId: string) => void;
  onTake?: (orderId: string) => void;
  takingOrderId: string | null;
  highlighted?: boolean;
};

function OrdersSection({
  title,
  orders,
  courierLocation,
  emptyText,
  onOpen,
  onTake,
  takingOrderId,
  highlighted = false,
}: SectionProps) {
  return (
    <View style={[styles.section, highlighted && styles.sectionHighlighted]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionCount}>
          <Text style={styles.sectionCountText}>{orders.length}</Text>
        </View>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>{emptyText}</Text>
        </View>
      ) : (
        <View style={styles.sectionList}>
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              courierLocation={courierLocation}
              onOpen={onOpen}
              onTake={onTake}
              takingOrderId={takingOrderId}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function CourierHomeScreen() {
  const router = useRouter();

  const [courierId, setCourierId] = useState<string | null>(null);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [courierLocation, setCourierLocation] = useState<Coords | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [takingOrderId, setTakingOrderId] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCourierId = useCallback(async () => {
    const storedCourierId = await AsyncStorage.getItem(COURIER_STORAGE_KEY);

    if (!storedCourierId) {
      router.replace("/login");
      return null;
    }

    setCourierId(storedCourierId);
    return storedCourierId;
  }, [router]);

  const loadCourier = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("couriers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    setCourier(data as Courier);
  }, []);

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("status", ["new", "assigned", "on_the_way", "arrived"])
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    setOrders((data || []) as Order[]);
  }, []);

  const loadCourierLocation = useCallback(async () => {
    try {
      setLocationLoading(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCourierLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch {
      // ignore for MVP
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const initialLoad = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const storedCourierId = await loadCourierId();
      if (!storedCourierId) return;

      await Promise.all([
        loadCourier(storedCourierId),
        loadOrders(),
        loadCourierLocation(),
      ]);
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить данные.");
    } finally {
      setLoading(false);
    }
  }, [loadCourierId, loadCourier, loadOrders, loadCourierLocation]);

  const refreshAll = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);

      if (!courierId) {
        const storedCourierId = await loadCourierId();
        if (!storedCourierId) return;
        await Promise.all([
          loadCourier(storedCourierId),
          loadOrders(),
          loadCourierLocation(),
        ]);
      } else {
        await Promise.all([
          loadCourier(courierId),
          loadOrders(),
          loadCourierLocation(),
        ]);
      }
    } catch (e: any) {
      setError(e?.message || "Не удалось обновить данные.");
    } finally {
      setRefreshing(false);
    }
  }, [courierId, loadCourier, loadCourierId, loadOrders, loadCourierLocation]);

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  useEffect(() => {
    const channel = supabase
      .channel("courier-home-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        async () => {
          try {
            await loadOrders();
          } catch {
            // ignore realtime refresh error for MVP
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  const handleOpenOrder = useCallback(
    (orderId: string) => {
      router.push(`/order/${orderId}`);
    },
    [router]
  );

  const handleTakeOrder = useCallback(
    async (orderId: string) => {
      if (!courierId || takingOrderId) return;

      try {
        setTakingOrderId(orderId);

        await atomicAssignOrder(orderId, courierId);
        await loadOrders();

        router.push(`/order/${orderId}`);
      } catch (e: any) {
        Alert.alert(
          "Не удалось взять заказ",
          e?.message || "Скорее всего, заказ уже взял другой курьер."
        );
      } finally {
        setTakingOrderId(null);
      }
    },
    [courierId, takingOrderId, loadOrders, router]
  );

  const handleLogout = useCallback(async () => {
    Alert.alert("Сменить курьера", "Выйти из текущего профиля курьера?", [
      {
        text: "Отмена",
        style: "cancel",
      },
      {
        text: "Выйти",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem(COURIER_STORAGE_KEY);
          router.replace("/login");
        },
      },
    ]);
  }, [router]);

  const prepared = useMemo(() => {
    const activeOrder =
      orders.find(
        (order) =>
          order.courier_id === courierId &&
          ["assigned", "on_the_way", "arrived"].includes(order.status)
      ) || null;

    const newOrders = sortOrders(
      orders.filter((order) => order.status === "new"),
      courierLocation
    );

    const assignedOrders = sortOrders(
      orders.filter(
        (order) =>
          order.status === "assigned" &&
          order.courier_id === courierId &&
          (!activeOrder || order.id !== activeOrder.id)
      ),
      courierLocation
    );

    const onTheWayOrders = sortOrders(
      orders.filter(
        (order) =>
          order.status === "on_the_way" &&
          order.courier_id === courierId &&
          (!activeOrder || order.id !== activeOrder.id)
      ),
      courierLocation
    );

    const arrivedOrders = sortOrders(
      orders.filter(
        (order) =>
          order.status === "arrived" &&
          order.courier_id === courierId &&
          (!activeOrder || order.id !== activeOrder.id)
      ),
      courierLocation
    );

    return {
      activeOrder,
      newOrders,
      assignedOrders,
      onTheWayOrders,
      arrivedOrders,
    };
  }, [orders, courierId, courierLocation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Courier" }} />
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Загружаем заказы…</Text>
      </View>
    );
  }

  if (error && orders.length === 0) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Courier" }} />
        <Text style={styles.errorTitle}>Не удалось загрузить экран</Text>
        <Text style={styles.errorText}>{error}</Text>

        <TouchableOpacity style={styles.retryButton} onPress={refreshAll}>
          <Text style={styles.retryButtonText}>Попробовать снова</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Courier" }} />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroEyebrow}>МусорОК Courier</Text>
              <Text style={styles.heroTitle}>
                {courier?.name ? courier.name : "Курьер"}
              </Text>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>Сменить</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroSubtitle}>
            Рабочий экран курьера. Сначала добираем активный заказ, потом берём
            новый.
          </Text>

          <View style={styles.topStats}>
            <View style={styles.topStatCard}>
              <Text style={styles.topStatLabel}>Новые</Text>
              <Text style={styles.topStatValue}>{prepared.newOrders.length}</Text>
            </View>

            <View style={styles.topStatCard}>
              <Text style={styles.topStatLabel}>Мои активные</Text>
              <Text style={styles.topStatValue}>
                {prepared.activeOrder ? 1 : 0}
              </Text>
            </View>

            <View style={styles.topStatCard}>
              <Text style={styles.topStatLabel}>Гео</Text>
              <Text style={styles.topStatValue}>
                {locationLoading
                  ? "..."
                  : courierLocation
                  ? "OK"
                  : "—"}
              </Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.lightActionButton}
              onPress={loadCourierLocation}
            >
              <Text style={styles.lightActionButtonText}>Обновить геопозицию</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.darkActionButton}
              onPress={refreshAll}
            >
              <Text style={styles.darkActionButtonText}>Обновить заказы</Text>
            </TouchableOpacity>
          </View>
        </View>

        {prepared.activeOrder ? (
          <OrdersSection
            title={SECTION_TITLES.active}
            orders={[prepared.activeOrder]}
            courierLocation={courierLocation}
            emptyText=""
            onOpen={handleOpenOrder}
            takingOrderId={takingOrderId}
            highlighted
          />
        ) : null}

        <OrdersSection
          title={SECTION_TITLES.new}
          orders={prepared.newOrders}
          courierLocation={courierLocation}
          emptyText="Сейчас новых заказов нет."
          onOpen={handleOpenOrder}
          onTake={handleTakeOrder}
          takingOrderId={takingOrderId}
        />

        <OrdersSection
          title={SECTION_TITLES.assigned}
          orders={prepared.assignedOrders}
          courierLocation={courierLocation}
          emptyText="У вас нет назначенных заказов."
          onOpen={handleOpenOrder}
          takingOrderId={takingOrderId}
        />

        <OrdersSection
          title={SECTION_TITLES.on_the_way}
          orders={prepared.onTheWayOrders}
          courierLocation={courierLocation}
          emptyText="Нет заказов в статусе «В пути»."
          onOpen={handleOpenOrder}
          takingOrderId={takingOrderId}
        />

        <OrdersSection
          title={SECTION_TITLES.arrived}
          orders={prepared.arrivedOrders}
          courierLocation={courierLocation}
          emptyText="Нет заказов в статусе «Прибыл»."
          onOpen={handleOpenOrder}
          takingOrderId={takingOrderId}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#6B7280",
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  errorText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 18,
  },
  retryButton: {
    backgroundColor: "#111827",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 180,
    alignItems: "center",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 12,
  },
  heroEyebrow: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    marginBottom: 16,
  },
  logoutButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  logoutButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  topStats: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  topStatCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 12,
  },
  topStatLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 6,
  },
  topStatValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
  },
  lightActionButton: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  lightActionButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  darkActionButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  darkActionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  section: {
    gap: 12,
  },
  sectionHighlighted: {
    backgroundColor: "#EEF2FF",
    borderRadius: 20,
    padding: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  sectionCount: {
    minWidth: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  sectionCountText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionList: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  emptyCardText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  orderCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  orderId: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "700",
  },
  orderAddress: {
    fontSize: 16,
    lineHeight: 22,
    color: "#111827",
    fontWeight: "800",
    marginBottom: 14,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  metaItem: {
    width: "47%",
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 12,
  },
  metaLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 6,
  },
  metaValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "800",
  },
  orderCardBottom: {
    gap: 12,
  },
  createdAt: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  orderActions: {
    flexDirection: "row",
    gap: 10,
  },
  openButton: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  openButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },
  takeButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  takeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});