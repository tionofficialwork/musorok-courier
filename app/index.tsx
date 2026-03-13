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

import { getActiveOrders } from "../lib/orders";
import { supabase } from "../lib/supabase";
import { Order } from "../types/order";

function formatPrice(value: number | null) {
  if (typeof value !== "number") return "—";
  return `${value} ₽`;
}

function Section({
  title,
  orders,
  router,
}: {
  title: string;
  orders: Order[];
  router: any;
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
            <Text style={styles.status}>{item.status}</Text>
            <Text style={styles.price}>{formatPrice(item.total)}</Text>
          </View>

          <Text style={styles.address}>{item.address}</Text>

          <Text style={styles.meta}>
            {item.package_label} • {item.payment_method}
          </Text>

          <Text style={styles.meta}>{item.phone}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function CourierHomeScreen() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    const nextOrders = await getActiveOrders();
    setOrders(nextOrders);
    setLoading(false);
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
  }, []);

  const newOrders = useMemo(
    () => orders.filter((o) => o.status === "new"),
    [orders]
  );

  const assignedOrders = useMemo(
    () => orders.filter((o) => o.status === "assigned"),
    [orders]
  );

  const onTheWayOrders = useMemo(
    () => orders.filter((o) => o.status === "on_the_way"),
    [orders]
  );

  const arrivedOrders = useMemo(
    () => orders.filter((o) => o.status === "arrived"),
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
        renderItem={() => (
          <>
            <Section
              title="Новые заказы"
              orders={newOrders}
              router={router}
            />

            <Section
              title="Назначенные"
              orders={assignedOrders}
              router={router}
            />

            <Section
              title="В пути"
              orders={onTheWayOrders}
              router={router}
            />

            <Section
              title="Прибыл"
              orders={arrivedOrders}
              router={router}
            />
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

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  section: {
    padding: 16,
  },

  sectionTitle: {
    color: "#fff",
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
  },

  status: {
    color: "#22C55E",
    fontWeight: "700",
  },

  price: {
    color: "#fff",
    fontWeight: "700",
  },

  address: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 6,
  },

  meta: {
    color: "#CBD5E1",
    marginTop: 4,
  },
});