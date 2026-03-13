import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";

import { CURRENT_COURIER_NAME, CURRENT_COURIER_ID } from "../lib/courier";
import { getActiveOrders } from "../lib/orders";
import { supabase } from "../lib/supabase";
import { Order } from "../types/order";

function formatPrice(value: number | null) {
  if (typeof value !== "number") return "—";
  return `${value} ₽`;
}

function formatPaymentMethod(value: Order["payment_method"]) {
  if (value === "card") return "Картой";
  if (value === "cash") return "Наличными";
  if (value === "sbp") return "СБП";
  return "—";
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

function Section({
  title,
  orders,
  router,
}: {
  title: string;
  orders: Order[];
  router: ReturnType<typeof useRouter>;
}) {
  if (orders.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {orders.map((item) => (
        <Pressable
          key={item.id}
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/order/[id]",
              params: { id: item.id },
            })
          }
        >
          <View style={styles.row}>
            <Text style={styles.status}>{formatStatus(item.status)}</Text>
            <Text style={styles.price}>{formatPrice(item.total)}</Text>
          </View>

          <Text style={styles.address}>{item.address || "Без адреса"}</Text>

          <Text style={styles.meta}>
            {item.package_label || "Без пакета"} •{" "}
            {formatPaymentMethod(item.payment_method)}
          </Text>

          <Text style={styles.meta}>{item.phone || "Без телефона"}</Text>

          <Text style={styles.meta}>
            {item.courier_id ? `Курьер: ${item.courier_id}` : "Курьер не назначен"}
          </Text>

          <Text style={styles.orderId}>#{item.id}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function CourierHomeScreen() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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
    }
  }, []);

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel("orders-courier")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  const newOrders = useMemo(
    () => orders.filter((o) => o.status === "new" && !o.courier_id),
    [orders]
  );

  const assignedOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "assigned" && o.courier_id === CURRENT_COURIER_ID
      ),
    [orders]
  );

  const onTheWayOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "on_the_way" && o.courier_id === CURRENT_COURIER_ID
      ),
    [orders]
  );

  const arrivedOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "arrived" && o.courier_id === CURRENT_COURIER_ID
      ),
    [orders]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "Заказы" }} />

      <FlatList
        data={[{ key: "sections" }]}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Курьерская панель</Text>
            <Text style={styles.subtitle}>{CURRENT_COURIER_NAME}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Заказов нет</Text>
            <Text style={styles.emptyText}>
              Новые или активные заказы появятся здесь автоматически.
            </Text>
          </View>
        }
        renderItem={() => (
          <>
            {screenError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Ошибка</Text>
                <Text style={styles.errorText}>{screenError}</Text>
              </View>
            ) : null}

            <Section title="Новые заказы" orders={newOrders} router={router} />
            <Section title="Мои заказы" orders={assignedOrders} router={router} />
            <Section title="В пути" orders={onTheWayOrders} router={router} />
            <Section title="Прибыл" orders={arrivedOrders} router={router} />
          </>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#031225",
  },
  content: {
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 16,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#0F2138",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  status: {
    color: "#22C55E",
    fontWeight: "700",
    fontSize: 14,
  },
  price: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  address: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 6,
  },
  meta: {
    color: "#CBD5E1",
    marginTop: 4,
    fontSize: 14,
  },
  orderId: {
    color: "#64748B",
    marginTop: 8,
    fontSize: 12,
  },
  emptyCard: {
    margin: 16,
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 20,
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
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: "#081426",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#0F2138",
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 15,
    lineHeight: 22,
  },
});