import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { getNextStatuses, getOrderById, updateOrderStatus } from "../../lib/orders";
import { supabase } from "../../lib/supabase";
import { Order, OrderStatus } from "../../types/order";

function formatPrice(value: number | null) {
  if (typeof value !== "number") return "—";
  return `${value} ₽`;
}

function formatStatus(status: OrderStatus) {
  if (status === "new") return "Новый";
  if (status === "assigned") return "Назначен";
  if (status === "on_the_way") return "В пути";
  if (status === "arrived") return "Прибыл";
  if (status === "done") return "Выполнен";
  if (status === "cancelled") return "Отменён";
  return status;
}

function formatPaymentMethod(value: Order["payment_method"]) {
  if (value === "card") return "Картой";
  if (value === "cash") return "Наличными";
  if (value === "sbp") return "СБП";
  return "—";
}

function getActionLabel(status: OrderStatus) {
  if (status === "new") return "Взять заказ";
  if (status === "assigned") return "Выехал";
  if (status === "on_the_way") return "Прибыл";
  if (status === "arrived") return "Завершить заказ";
  return null;
}

export default function CourierOrderDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const nextStatus = useMemo(() => {
    if (!order) return null;
    const nextStatuses = getNextStatuses(order.status);
    return nextStatuses[0] || null;
  }, [order]);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setScreenError("Не найден ID заказа.");
      return;
    }

    let isMounted = true;

    const loadOrder = async () => {
      try {
        setScreenError(null);
        const nextOrder = await getOrderById(orderId);

        if (!isMounted) return;
        setOrder(nextOrder);
      } catch (error: any) {
        if (!isMounted) return;
        setScreenError(error?.message || "Не удалось загрузить заказ.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadOrder();

    const channel = supabase
      .channel(`courier-order-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder(payload.new as Order);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const handleStatusUpdate = async () => {
    if (!order || !nextStatus) return;

    try {
      setActionLoading(true);
      await updateOrderStatus(order.id, nextStatus);
    } catch (error: any) {
      setScreenError(error?.message || "Не удалось обновить статус.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "Заказ" }} />

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Загружаем заказ...</Text>
          </View>
        ) : screenError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Ошибка</Text>
            <Text style={styles.errorText}>{screenError}</Text>
          </View>
        ) : order ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroStatus}>{formatStatus(order.status)}</Text>
              <Text style={styles.heroAddress}>{order.address || "Без адреса"}</Text>
              <Text style={styles.heroPhone}>{order.phone || "Без телефона"}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Детали</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Номер заказа</Text>
                <Text style={styles.infoValue}>{order.id}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Пакет</Text>
                <Text style={styles.infoValue}>{order.package_label || "—"}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Цена пакета</Text>
                <Text style={styles.infoValue}>{formatPrice(order.package_price)}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Итого</Text>
                <Text style={styles.infoValue}>{formatPrice(order.total)}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Оплата</Text>
                <Text style={styles.infoValue}>{formatPaymentMethod(order.payment_method)}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Статус</Text>
                <Text style={styles.infoValue}>{formatStatus(order.status)}</Text>
              </View>
            </View>

            {nextStatus ? (
              <Pressable
                style={styles.primaryButton}
                onPress={handleStatusUpdate}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#04110A" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {getActionLabel(order.status)}
                  </Text>
                )}
              </Pressable>
            ) : (
              <View style={styles.completedCard}>
                <Text style={styles.completedText}>
                  Для этого заказа больше нет доступных действий.
                </Text>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#031225",
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 15,
  },
  heroCard: {
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#0F2138",
  },
  heroStatus: {
    color: "#22C55E",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroAddress: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroPhone: {
    color: "#CBD5E1",
    fontSize: 18,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#0F2138",
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 16,
  },
  infoRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#13243A",
    gap: 6,
  },
  infoLabel: {
    color: "#94A3B8",
    fontSize: 13,
  },
  infoValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#22C55E",
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#04110A",
    fontSize: 18,
    fontWeight: "800",
  },
  completedCard: {
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#0F2138",
  },
  completedText: {
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 22,
  },
  errorCard: {
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#0F2138",
    gap: 12,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 15,
    lineHeight: 22,
  },
});