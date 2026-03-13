import { useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  ActivityIndicator,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert
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
  const [loggingOut, setLoggingOut] = useState(false)
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

  function handleLogoutPress() {
    Alert.alert(
      "Сменить курьера",
      "Вы хотите выйти и войти под другим курьером?",
      [
        {
          text: "Отмена",
          style: "cancel"
        },
        {
          text: "Сменить",
          style: "destructive",
          onPress: confirmLogout
        }
      ]
    )
  }

  async function confirmLogout() {
    try {
      setLoggingOut(true)
      await clearCourier()
      setCourierId(null)
      setCourierName(null)
      setOrders([])
      router.replace("/login")
    } catch (error) {
      console.error("Logout error:", error)
      Alert.alert("Ошибка", "Не удалось сменить курьера")
    } finally {
      setLoggingOut(false)
    }
  }

  async function handleTakeOrder(orderId: string) {
    try {
      setTakingOrderId(orderId)

      await assignOrder(orderId)
      await loadOrders(false)

      Alert.alert("Готово", "Заказ взят")
    } catch (error) {
      console.error("Take order error:", error)

      const message =
        error instanceof Error ? error.message : "Не удалось взять заказ"

      if (message === "Order already taken") {
        Alert.alert("Заказ уже занят", "Этот заказ уже взял другой курьер")
      } else if (message === "Courier not logged in") {
        Alert.alert("Ошибка", "Сессия курьера истекла, войдите заново")
        router.replace("/login")
      } else {
        Alert.alert("Ошибка", message)
      }
    } finally {
      setTakingOrderId(null)
    }
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.title}>Заказы</Text>
            {!!courierName && (
              <Text style={styles.subtitle}>Курьер: {courierName}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.logoutButton, loggingOut && styles.buttonDisabled]}
            onPress={handleLogoutPress}
            disabled={loggingOut}
          >
            <Text style={styles.logoutButtonText}>
              {loggingOut ? "Выход..." : "Сменить курьера"}
            </Text>
          </TouchableOpacity>
        </View>
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
        renderItem={({ item }) => {
          const isNew = item.status === "new"
          const isTakingThisOrder = takingOrderId === item.id

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => openOrder(item.id)}
              activeOpacity={0.9}
            >
              <Text style={styles.address}>{item.address}</Text>

              <Text style={styles.info}>
                {item.package_label} • {item.total} ₽
              </Text>

              <Text style={styles.status}>
                Статус: {getStatusLabel(item.status)}
              </Text>

              {item.phone ? (
                <Text style={styles.meta}>Телефон: {item.phone}</Text>
              ) : null}

              {isNew ? (
                <TouchableOpacity
                  style={[
                    styles.takeButton,
                    isTakingThisOrder && styles.buttonDisabled
                  ]}
                  onPress={() => handleTakeOrder(item.id)}
                  disabled={isTakingThisOrder}
                >
                  <Text style={styles.takeButtonText}>
                    {isTakingThisOrder ? "Берём..." : "Взять заказ"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.openButton}
                  onPress={() => openOrder(item.id)}
                >
                  <Text style={styles.openButtonText}>Открыть заказ</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )
        }}
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
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
    paddingTop: 16
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6"
  },

  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12
  },

  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12
  },

  headerTextBlock: {
    flex: 1
  },

  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827"
  },

  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: "#4b5563"
  },

  logoutButton: {
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12
  },

  logoutButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700"
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
    fontSize: 22,
    fontWeight: "800",
    color: "#111827"
  },

  sectionBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },

  sectionBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
  },

  card: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 18,
    marginBottom: 10
  },

  address: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827"
  },

  info: {
    marginTop: 8,
    fontSize: 16,
    color: "#374151"
  },

  status: {
    marginTop: 10,
    fontSize: 14,
    color: "#4b5563"
  },

  meta: {
    marginTop: 6,
    fontSize: 14,
    color: "#4b5563"
  },

  takeButton: {
    marginTop: 14,
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },

  takeButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },

  openButton: {
    marginTop: 14,
    backgroundColor: "#e5e7eb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },

  openButtonText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800"
  },

  emptySection: {
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 8
  },

  emptySectionText: {
    fontSize: 14,
    color: "#6b7280"
  },

  sectionSpacer: {
    height: 6
  },

  buttonDisabled: {
    opacity: 0.6
  }
})