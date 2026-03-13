import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";

import { getActiveOrders } from "../lib/orders";
import { supabase } from "../lib/supabase";
import { Order } from "../types/order";

function formatPrice(value: number | null) {
  if (typeof value !== "number") return "—";
  return `${value} ₽`;
}

function formatStatus(status: Order["status"]) {
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

export default function CourierHomeScreen() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setScreenError(null);
      const nextOrders = await getActiveOrders();
      setOrders(nextOrders);
    } catch (error: any) {
      setScreenError(error?.message || "Не удалось загрузить заказы.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel("courier-orders-list")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        async () => {
          await loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "Заказы" }} />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Активные заказы</Text>
          <Text style={styles.subtitle}>Курьерское приложение МусорОК</Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Загружаем заказы...</Text>
          </View>
        ) : screenError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Ошибка</Text>
            <Text style={styles.errorText}>{screenError}</Text>

            <Pressable style={styles.retryButton} onPress={loadOrders}>
              <Text style={styles.retryButtonText}>Повторить</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Активных заказов нет</Text>
                <Text style={styles.emptyText}>
                  Когда появятся новые заказы, они покажутся здесь автоматически.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: "/order/[id]",
                    params: { id: item.id },
                  })
                }
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardStatus}>{formatStatus(item.status)}</Text>
                  <Text style={styles.cardPrice}>{formatPrice(item.total)}</Text>
                </View>

                <Text style={styles.cardAddress}>{item.address || "Без адреса"}</Text>

                <Text style={styles.cardMeta}>
                  {item.package_label || "Без пакета"} • {formatPaymentMethod(item.payment_method)}
                </Text>

                <Text style={styles.cardMeta}>{item.phone || "Без телефона"}</Text>

                <Text style={styles.cardId}>#{item.id}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#031225",
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 15,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 15,
  },
  listContent: {
    gap: 12,
    paddingBottom: 24,
    flexGrow: 1,
  },
  card: {
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#0F2138",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12,
  },
  cardStatus: {
    color: "#22C55E",
    fontSize: 14,
    fontWeight: "700",
  },
  cardPrice: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cardAddress: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardMeta: {
    color: "#CBD5E1",
    fontSize: 14,
    marginBottom: 4,
  },
  cardId: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 10,
  },
  emptyCard: {
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#0F2138",
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
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
  retryButton: {
    backgroundColor: "#22C55E",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  retryButtonText: {
    color: "#04110A",
    fontSize: 16,
    fontWeight: "800",
  },
});