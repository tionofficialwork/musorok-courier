import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";

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

type CourierCoords = {
  latitude: number;
  longitude: number;
};

const STATUS_META: Record<
  OrderStatus,
  {
    label: string;
    shortLabel: string;
    color: string;
    bg: string;
    progress: number;
    description: string;
  }
> = {
  new: {
    label: "Новый заказ",
    shortLabel: "Новый",
    color: "#2563EB",
    bg: "#DBEAFE",
    progress: 0.1,
    description: "Заказ ещё не закреплён за курьером.",
  },
  assigned: {
    label: "Назначен",
    shortLabel: "Назначен",
    color: "#7C3AED",
    bg: "#EDE9FE",
    progress: 0.35,
    description: "Заказ закреплён за курьером. Можно выезжать.",
  },
  on_the_way: {
    label: "В пути",
    shortLabel: "В пути",
    color: "#EA580C",
    bg: "#FFEDD5",
    progress: 0.6,
    description: "Курьер направляется к клиенту.",
  },
  arrived: {
    label: "Прибыл",
    shortLabel: "Прибыл",
    color: "#059669",
    bg: "#D1FAE5",
    progress: 0.82,
    description: "Курьер прибыл на точку. Можно завершать заказ.",
  },
  done: {
    label: "Завершён",
    shortLabel: "Завершён",
    color: "#16A34A",
    bg: "#DCFCE7",
    progress: 1,
    description: "Заказ успешно завершён.",
  },
  cancelled: {
    label: "Отменён",
    shortLabel: "Отменён",
    color: "#DC2626",
    bg: "#FEE2E2",
    progress: 1,
    description: "Заказ был отменён.",
  },
};

const STEP_TITLES = ["Назначен", "В пути", "Прибыл", "Завершён"];

function getOrderCoords(order: Order | null): CourierCoords | null {
  if (!order) return null;

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
    !Number.isNaN(latitude) &&
    typeof longitude === "number" &&
    !Number.isNaN(longitude)
  ) {
    return { latitude, longitude };
  }

  return null;
}

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value)} ₽`;
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

function getNextStatus(status: OrderStatus): OrderStatus | null {
  if (status === "assigned") return "on_the_way";
  if (status === "on_the_way") return "arrived";
  if (status === "arrived") return "done";
  return null;
}

function getPrimaryActionLabel(status: OrderStatus) {
  if (status === "new") return "Взять заказ";
  if (status === "assigned") return "Выехал";
  if (status === "on_the_way") return "Прибыл";
  if (status === "arrived") return "Завершить заказ";
  return null;
}

function getStepState(status: OrderStatus, stepIndex: number) {
  const map: Record<OrderStatus, number> = {
    new: 0,
    assigned: 1,
    on_the_way: 2,
    arrived: 3,
    done: 4,
    cancelled: 0,
  };

  const current = map[status];

  if (current > stepIndex + 1) return "done";
  if (current === stepIndex + 1) return "current";
  return "todo";
}

function haversineDistance(a: CourierCoords, b: CourierCoords) {
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

function formatDistance(meters: number | null) {
  if (meters == null || Number.isNaN(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

async function tryOpenUrl(url: string) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export default function OrderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [courierLocation, setCourierLocation] = useState<CourierCoords | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [navigatorLoading, setNavigatorLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusMeta = useMemo(() => {
    if (!order) return STATUS_META.assigned;
    return STATUS_META[order.status];
  }, [order]);

  const orderCoords = useMemo(() => getOrderCoords(order), [order]);

  const distanceMeters = useMemo(() => {
    if (!courierLocation || !orderCoords) return null;
    return haversineDistance(courierLocation, orderCoords);
  }, [courierLocation, orderCoords]);

  const fetchOrder = useCallback(async () => {
    if (!id) {
      setError("Не найден id заказа.");
      setLoading(false);
      return;
    }

    const { data, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (orderError) {
      setError(orderError.message || "Не удалось загрузить заказ.");
      setLoading(false);
      return;
    }

    setOrder(data as Order);
    setError(null);
    setLoading(false);
  }, [id]);

  const fetchCourierLocation = useCallback(async () => {
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

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchOrder(), fetchCourierLocation()]);
    setRefreshing(false);
  }, [fetchOrder, fetchCourierLocation]);

  useEffect(() => {
    fetchOrder();
    fetchCourierLocation();
  }, [fetchOrder, fetchCourierLocation]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`order-details-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.new) {
            setOrder(payload.new as Order);
          } else {
            fetchOrder();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, fetchOrder]);

  const handleCallClient = useCallback(async () => {
    if (!order?.phone) {
      Alert.alert("Нет телефона", "У клиента отсутствует номер телефона.");
      return;
    }

    const url = `tel:${order.phone}`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Ошибка", "Не удалось открыть набор номера.");
    }
  }, [order?.phone]);

  const handleOpenNavigator = useCallback(async () => {
    if (navigatorLoading) return;

    if (!order?.address && !orderCoords) {
      Alert.alert("Нет адреса", "В заказе отсутствует адрес назначения.");
      return;
    }

    try {
      setNavigatorLoading(true);

      const encodedAddress = encodeURIComponent(order?.address || "");

      const yandexNaviUrl = orderCoords
        ? `yandexnavi://build_route_on_map?lat_to=${orderCoords.latitude}&lon_to=${orderCoords.longitude}`
        : `yandexnavi://build_route_on_map?text=${encodedAddress}`;

      const yandexMapsUrl = orderCoords
        ? `yandexmaps://maps.yandex.ru/?rtext=~${orderCoords.latitude},${orderCoords.longitude}&rtt=auto`
        : `yandexmaps://maps.yandex.ru/?text=${encodedAddress}`;

      const browserYandexUrl = orderCoords
        ? `https://yandex.ru/maps/?rtext=~${orderCoords.latitude},${orderCoords.longitude}&rtt=auto`
        : `https://yandex.ru/maps/?text=${encodedAddress}`;

      const googleMapsUrl = orderCoords
        ? `https://www.google.com/maps/dir/?api=1&destination=${orderCoords.latitude},${orderCoords.longitude}&travelmode=driving`
        : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

      const openedYandexNavi = await tryOpenUrl(yandexNaviUrl);
      if (openedYandexNavi) return;

      const openedYandexMaps = await tryOpenUrl(yandexMapsUrl);
      if (openedYandexMaps) return;

      const openedBrowserYandex = await tryOpenUrl(browserYandexUrl);
      if (openedBrowserYandex) return;

      const openedGoogleMaps = await tryOpenUrl(googleMapsUrl);
      if (openedGoogleMaps) return;

      Alert.alert("Ошибка", "Не удалось открыть навигацию.");
    } finally {
      setNavigatorLoading(false);
    }
  }, [navigatorLoading, order?.address, orderCoords]);

  const handlePrimaryAction = useCallback(async () => {
    if (!order || !id || actionLoading) return;

    try {
      setActionLoading(true);

      if (order.status === "new") {
        if (!order.courier_id) {
          Alert.alert(
            "Заказ не закреплён",
            "Этот заказ нужно брать со списка через atomic assign."
          );
        } else {
          const { error: updateError } = await supabase
            .from("orders")
            .update({ status: "assigned" })
            .eq("id", id)
            .eq("status", "new");

          if (updateError) throw updateError;
        }

        return;
      }

      const nextStatus = getNextStatus(order.status);
      if (!nextStatus) return;

      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", id)
        .eq("status", order.status);

      if (updateError) throw updateError;

      if (nextStatus === "done") {
        Alert.alert("Готово", "Заказ завершён.");
      }
    } catch (e: any) {
      Alert.alert(
        "Ошибка",
        e?.message || "Не удалось изменить статус заказа."
      );
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, id, order]);

  const canShowPrimaryAction = useMemo(() => {
    if (!order) return false;
    return !["done", "cancelled"].includes(order.status);
  }, [order]);

  const primaryActionLabel = useMemo(() => {
    if (!order) return null;
    return getPrimaryActionLabel(order.status);
  }, [order]);

  const mapRegion = useMemo(() => {
    if (courierLocation && orderCoords) {
      return {
        latitude: (courierLocation.latitude + orderCoords.latitude) / 2,
        longitude: (courierLocation.longitude + orderCoords.longitude) / 2,
        latitudeDelta: Math.max(
          Math.abs(courierLocation.latitude - orderCoords.latitude) * 2,
          0.02
        ),
        longitudeDelta: Math.max(
          Math.abs(courierLocation.longitude - orderCoords.longitude) * 2,
          0.02
        ),
      };
    }

    if (orderCoords) {
      return {
        latitude: orderCoords.latitude,
        longitude: orderCoords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }

    if (courierLocation) {
      return {
        latitude: courierLocation.latitude,
        longitude: courierLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }

    return {
      latitude: 55.751244,
      longitude: 37.618423,
      latitudeDelta: 0.2,
      longitudeDelta: 0.2,
    };
  }, [courierLocation, orderCoords]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Заказ" }} />
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Загружаем заказ…</Text>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Заказ" }} />
        <Text style={styles.errorTitle}>Не удалось открыть заказ</Text>
        <Text style={styles.errorText}>{error || "Заказ не найден."}</Text>

        <TouchableOpacity style={styles.retryButton} onPress={refreshAll}>
          <Text style={styles.retryButtonText}>Попробовать снова</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryGhostButton}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryGhostButtonText}>Назад</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Заказ #${order.id.slice(0, 6)}` }} />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusMeta.bg },
              ]}
            >
              <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                {statusMeta.shortLabel}
              </Text>
            </View>

            <Text style={styles.orderIdText}>#{order.id.slice(0, 8)}</Text>
          </View>

          <Text style={styles.heroTitle}>{statusMeta.label}</Text>
          <Text style={styles.heroDescription}>{statusMeta.description}</Text>

          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.max(8, statusMeta.progress * 100)}%`,
                  backgroundColor: statusMeta.color,
                },
              ]}
            />
          </View>

          <View style={styles.stepsRow}>
            {STEP_TITLES.map((title, index) => {
              const state = getStepState(order.status, index);

              return (
                <View key={title} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepDot,
                      state === "done" && styles.stepDotDone,
                      state === "current" && styles.stepDotCurrent,
                    ]}
                  />
                  <Text
                    style={[
                      styles.stepText,
                      state !== "todo" && styles.stepTextActive,
                    ]}
                  >
                    {title}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.quickStatsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Сумма</Text>
            <Text style={styles.statValue}>{formatPrice(order.total)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Расстояние</Text>
            <Text style={styles.statValue}>
              {locationLoading ? "..." : formatDistance(distanceMeters)}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Создан</Text>
            <Text style={styles.statValueSmall}>
              {formatDate(order.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Детали заказа</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Пакет</Text>
            <Text style={styles.infoValue}>{order.package_label || "—"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Цена пакета</Text>
            <Text style={styles.infoValue}>
              {formatPrice(order.package_price)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Оплата</Text>
            <Text style={styles.infoValue}>
              {formatPaymentMethod(order.payment_method)}
            </Text>
          </View>

          <View style={[styles.infoRow, styles.infoRowTopAligned]}>
            <Text style={styles.infoLabel}>Адрес</Text>
            <Text style={[styles.infoValue, styles.addressText]}>
              {order.address || "—"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Телефон</Text>
            <Text style={styles.infoValue}>{order.phone || "—"}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Маршрут</Text>

          <MapView style={styles.map} initialRegion={mapRegion} region={mapRegion}>
            {courierLocation ? (
              <Marker
                coordinate={courierLocation}
                title="Курьер"
                description="Ваше текущее местоположение"
                pinColor="blue"
              />
            ) : null}

            {orderCoords ? (
              <Marker
                coordinate={orderCoords}
                title="Точка заказа"
                description={order.address || "Адрес заказа"}
              />
            ) : null}

            {courierLocation && orderCoords ? (
              <Polyline
                coordinates={[courierLocation, orderCoords]}
                strokeWidth={4}
              />
            ) : null}
          </MapView>

          {!orderCoords ? (
            <Text style={styles.mapHint}>
              Координаты заказа пока не найдены. Карта показывает только доступную
              точку. Для полноценного маршрута лучше сохранять lat/lng заказа в БД.
            </Text>
          ) : (
            <Text style={styles.mapHint}>
              Сейчас для MVP рисуется прямая линия между курьером и заказом.
              Следующим шагом подключим полноценный маршрут по дорогам.
            </Text>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                navigatorLoading && styles.buttonDisabled,
              ]}
              onPress={handleOpenNavigator}
              disabled={navigatorLoading}
            >
              {navigatorLoading ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.secondaryButtonText}>
                  Открыть в Яндекс Навигаторе
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={fetchCourierLocation}
            >
              <Text style={styles.secondaryButtonText}>Обновить геопозицию</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Быстрые действия</Text>

          <View style={styles.actionsColumn}>
            <TouchableOpacity style={styles.quickActionButton} onPress={handleCallClient}>
              <Text style={styles.quickActionButtonText}>Позвонить клиенту</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickActionButton,
                navigatorLoading && styles.buttonDisabled,
              ]}
              onPress={handleOpenNavigator}
              disabled={navigatorLoading}
            >
              {navigatorLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.quickActionButtonText}>Построить маршрут</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {canShowPrimaryAction && primaryActionLabel ? (
          <TouchableOpacity
            style={[
              styles.primaryActionButton,
              actionLoading && styles.primaryActionButtonDisabled,
            ]}
            disabled={actionLoading}
            onPress={handlePrimaryAction}
          >
            {actionLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryActionButtonText}>
                {primaryActionLabel}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.finalStateBox}>
            <Text style={styles.finalStateText}>
              {order.status === "done"
                ? "Заказ завершён"
                : "Заказ недоступен для дальнейших действий"}
            </Text>
          </View>
        )}
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
    paddingBottom: 32,
    gap: 14,
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
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  errorText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#111827",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 180,
    alignItems: "center",
    marginBottom: 10,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryGhostButton: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    minWidth: 180,
    alignItems: "center",
  },
  secondaryGhostButtonText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  orderIdText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  heroDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    marginBottom: 16,
  },
  progressBarTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: 16,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  stepsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
  },
  stepDotDone: {
    backgroundColor: "#111827",
  },
  stepDotCurrent: {
    backgroundColor: "#2563EB",
  },
  stepText: {
    fontSize: 11,
    textAlign: "center",
    color: "#9CA3AF",
    fontWeight: "600",
  },
  stepTextActive: {
    color: "#111827",
  },
  quickStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 8,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  statValueSmall: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoRowTopAligned: {
    alignItems: "flex-start",
  },
  infoLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "700",
    flex: 1.4,
    textAlign: "right",
  },
  addressText: {
    lineHeight: 20,
  },
  map: {
    width: "100%",
    height: 260,
    borderRadius: 16,
    marginBottom: 12,
  },
  mapHint: {
    fontSize: 13,
    lineHeight: 18,
    color: "#6B7280",
    marginBottom: 12,
  },
  actionsRow: {
    gap: 10,
  },
  actionsColumn: {
    gap: 10,
  },
  secondaryButton: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  quickActionButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  quickActionButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryActionButton: {
    backgroundColor: "#111827",
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 58,
  },
  primaryActionButtonDisabled: {
    opacity: 0.7,
  },
  primaryActionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  finalStateBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  finalStateText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});