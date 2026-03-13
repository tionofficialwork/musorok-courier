import { useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  ActivityIndicator,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl
} from "react-native"
import { useRouter } from "expo-router"

import { getOrders } from "../lib/orders"
import { getCourierId, getCourierName } from "../lib/storage"
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
        .channel("courier-orders-sections")
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

  async function loadOrders(showLoader = false) {
    try {
      if (showLoader) {
        setLoading(true)
      }

      const data = await getOrders()
      setOrders(data)
    } catch (error) {
      console.error("Load orders error:", error)
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

  const sections = useMemo<OrderSection[]>(() => {
    const newOrders = orders.filter((order) => order.status === "new")
    const myOrders = orders.filter(
      (order) => order.status === "assigned" && order.courier_id === courierId
    )
    const onTheWayOrders = orders.filter(
      (order) =>
        order.status === "on_the_way" && order.courier_id === courierId
    )
    const arrivedOrders = orders.filter(
      (order) => order.status === "arrived" && order.courier_id === courierId
    )

    return [
      {
        title: "Новые заказы",
        data: newOrders,
        emptyText: "Новых заказов пока нет"
      },
      {
        title: "Мои заказы",
        data: myOrders,
        emptyText: "У вас пока нет назначенных заказов"
      },
      {
        title: "В пути",
        data: onTheWayOrders,
        emptyText: "Нет заказов в пути"
      },
      {
        title: "Прибыл",
        data: arrivedOrders,
        emptyText: "Нет заказов со статусом 'прибыл'"
      }
    ]
  }, [orders, courierId])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Заказы</Text>
        {!!courierName && (
          <Text style={styles.subtitle}>Курьер: {courierName}</Text>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{section.data.length}</Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => openOrder(item.id)}
          >
            <Text style={styles.address}>{item.address}</Text>

            <Text style={styles.info}>
              {item.package_label} • {item.total} ₽
            </Text>

            <Text style={styles.status}>Статус: {getStatusLabel(item.status)}</Text>

            {item.phone ? (
              <Text style={styles.meta}>Телефон: {item.phone}</Text>
            ) : null}
          </TouchableOpacity>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>{section.emptyText}</Text>
            </View>
          ) : (
            <View style={styles.sectionSpacer} />
          )
        }
      />
    </View>
  )
}

function getStatusLabel(status: Order["status"]) {
  switch (status) {
    case "new":
      return "Новый"
    case "assigned":
      return "Назначен"
    case "on_the_way":
      return "В пути"
    case "arrived":
      return "Прибыл"
    case "done":
      return "Выполнен"
    case "cancelled":
      return "Отменён"
    default:
      return status
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  header: {
    marginBottom: 16
  },

  title: {
    fontSize: 28,
    fontWeight: "700"
  },

  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#666"
  },

  listContent: {
    paddingBottom: 32
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 10
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "700"
  },

  sectionBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },

  sectionBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700"
  },

  card: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 14,
    marginBottom: 10
  },

  address: {
    fontSize: 16,
    fontWeight: "700"
  },

  info: {
    marginTop: 6,
    fontSize: 14,
    color: "#333"
  },

  status: {
    marginTop: 8,
    fontSize: 13,
    color: "#666"
  },

  meta: {
    marginTop: 6,
    fontSize: 13,
    color: "#666"
  },

  emptySection: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8
  },

  emptySectionText: {
    fontSize: 14,
    color: "#777"
  },

  sectionSpacer: {
    height: 4
  }
})