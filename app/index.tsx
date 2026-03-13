import { useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  ActivityIndicator,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  SafeAreaView
} from "react-native"
import { useRouter } from "expo-router"

import { getOrders, assignOrder } from "../lib/orders"
import { getCourierId, getCourierName, clearCourier } from "../lib/storage"
import { supabase } from "../lib/supabase"
import { Order } from "../types/order"

type OrderSection = {
  title: string
  data: Order[]
  emptyText: string
}

export default function Index() {
  const router = useRouter()

  const [orders, setOrders] = useState<Order[]>([])
  const [courierId, setCourierId] = useState<string | null>(null)
  const [courierName, setCourierName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [takingOrderId, setTakingOrderId] = useState<string | null>(null)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      const storedCourierId = await getCourierId()
      const storedCourierName = await getCourierName()

      if (!storedCourierId) {
        router.replace("/login")
        return
      }

      setCourierId(storedCourierId)
      setCourierName(storedCourierName)

      await loadOrders(true)

      channel = supabase
        .channel("courier-orders")
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
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  async function loadOrders(showLoader = false) {
    try {
      if (showLoader) setLoading(true)

      const data = await getOrders()
      setOrders(data)
    } finally {
      if (showLoader) setLoading(false)
      setRefreshing(false)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadOrders(false)
  }

  async function handleTakeOrder(orderId: string) {
    try {
      setTakingOrderId(orderId)

      await assignOrder(orderId)
      await loadOrders(false)

      Alert.alert("Заказ взят")
    } catch (error: any) {
      Alert.alert("Ошибка", error.message || "Не удалось взять заказ")
    } finally {
      setTakingOrderId(null)
    }
  }

  const sections = useMemo<OrderSection[]>(() => {
    const newOrders = orders.filter((o) => o.status === "new")
    const myOrders = orders.filter(
      (o) => o.status === "assigned" && o.courier_id === courierId
    )
    const onTheWay = orders.filter(
      (o) => o.status === "on_the_way" && o.courier_id === courierId
    )
    const arrived = orders.filter(
      (o) => o.status === "arrived" && o.courier_id === courierId
    )

    return [
      { title: "Новые заказы", data: newOrders, emptyText: "Нет новых заказов" },
      { title: "Мои заказы", data: myOrders, emptyText: "Нет назначенных заказов" },
      { title: "В пути", data: onTheWay, emptyText: "Нет заказов в пути" },
      { title: "Прибыл", data: arrived, emptyText: "Нет прибывших заказов" }
    ]
  }, [orders, courierId])

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Заказы</Text>
          <Text style={styles.subtitle}>Курьер: {courierName}</Text>
        </View>

        <TouchableOpacity
          style={styles.logout}
          onPress={async () => {
            await clearCourier()
            router.replace("/login")
          }}
        >
          <Text style={styles.logoutText}>Сменить курьера</Text>
        </TouchableOpacity>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{section.data.length}</Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.address}>{item.address}</Text>

            <Text style={styles.info}>
              {item.package_label} • {item.total} ₽
            </Text>

            <Text style={styles.meta}>Телефон: {item.phone}</Text>

            {item.status === "new" ? (
              <TouchableOpacity
                style={styles.takeButton}
                onPress={() => handleTakeOrder(item.id)}
              >
                <Text style={styles.takeText}>
                  {takingOrderId === item.id ? "Берём..." : "Взять заказ"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.openButton}
                onPress={() => router.push(`/order/${item.id}`)}
              >
                <Text style={styles.openText}>Открыть заказ</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
    paddingTop: 28
  },

  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16
  },

  title: {
    fontSize: 28,
    fontWeight: "800"
  },

  subtitle: {
    marginTop: 4,
    color: "#6b7280"
  },

  logout: {
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12
  },

  logoutText: {
    color: "#fff",
    fontWeight: "700"
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 8
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "700"
  },

  badge: {
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4
  },

  badgeText: {
    color: "#fff",
    fontWeight: "700"
  },

  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 10
  },

  address: {
    fontSize: 18,
    fontWeight: "700"
  },

  info: {
    marginTop: 6
  },

  meta: {
    marginTop: 4,
    color: "#6b7280"
  },

  takeButton: {
    marginTop: 12,
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 10,
    alignItems: "center"
  },

  takeText: {
    color: "#fff",
    fontWeight: "700"
  },

  openButton: {
    marginTop: 12,
    backgroundColor: "#e5e7eb",
    padding: 12,
    borderRadius: 10,
    alignItems: "center"
  },

  openText: {
    fontWeight: "700"
  }
})