import { useEffect, useState } from "react"
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl
} from "react-native"
import { useRouter } from "expo-router"

import { getOrders } from "../lib/orders"
import { getCourierId } from "../lib/storage"
import { supabase } from "../lib/supabase"
import { Order } from "../types/order"

export default function Index() {
  const router = useRouter()

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      const courierId = await getCourierId()

      if (!courierId) {
        router.replace("/login")
        return
      }

      await loadOrders()

      channel = supabase
        .channel("courier-orders-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders"
          },
          async () => {
            await loadOrders(false)
          }
        )
        .subscribe()
    }

    init()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [])

  async function loadOrders(showLoader = true) {
    try {
      if (showLoader) {
        setLoading(true)
      }

      const data = await getOrders()
      setOrders(data)
    } catch (e) {
      console.error("Load orders error:", e)
    } finally {
      if (showLoader) {
        setLoading(false)
      }
      setRefreshing(false)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadOrders(false)
  }

  function openOrder(orderId: string) {
    router.push(`/order/${orderId}`)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Заказы</Text>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          orders.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>Пока нет активных заказов</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => openOrder(item.id)}
          >
            <Text style={styles.address}>{item.address}</Text>

            <Text style={styles.info}>
              {item.package_label} • {item.total} ₽
            </Text>

            <Text style={styles.status}>Статус: {item.status}</Text>

            {item.courier_id ? (
              <Text style={styles.courier}>Курьер назначен</Text>
            ) : (
              <Text style={styles.newOrder}>Новый заказ</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 20
  },

  listContent: {
    paddingBottom: 20
  },

  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center"
  },

  emptyText: {
    textAlign: "center",
    fontSize: 16,
    color: "#666"
  },

  card: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 10,
    marginBottom: 12
  },

  address: {
    fontSize: 16,
    fontWeight: "600"
  },

  info: {
    fontSize: 14,
    marginTop: 4
  },

  status: {
    marginTop: 6,
    fontSize: 12,
    color: "#666"
  },

  courier: {
    marginTop: 8,
    fontSize: 12,
    color: "#007AFF",
    fontWeight: "600"
  },

  newOrder: {
    marginTop: 8,
    fontSize: 12,
    color: "#34C759",
    fontWeight: "600"
  }
})