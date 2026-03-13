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
import * as Location from "expo-location"

import { getOrders, assignOrder } from "../lib/orders"
import { getCourierId, getCourierName, clearCourier } from "../lib/storage"
import { supabase } from "../lib/supabase"
import { geocodeAddress } from "../lib/geocode"
import { Order } from "../types/order"

type OrderSection = {
  title: string
  data: Order[]
  emptyText: string
}

type CourierCoords = {
  latitude: number
  longitude: number
}

type OrderDistanceMap = Record<string, string>

export default function Index() {
  const router = useRouter()

  const [orders, setOrders] = useState<Order[]>([])
  const [courierId, setCourierId] = useState<string | null>(null)
  const [courierName, setCourierName] = useState<string | null>(null)
  const [courierCoords, setCourierCoords] = useState<CourierCoords | null>(null)
  const [orderDistances, setOrderDistances] = useState<OrderDistanceMap>({})
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

      await requestLocation()
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
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [])

  useEffect(() => {
    if (orders.length > 0 && courierCoords) {
      calculateDistances()
    }
  }, [orders, courierCoords])

  async function requestLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()

      if (status !== "granted") {
        console.log("Location permission denied")
        return
      }

      const location = await Location.getCurrentPositionAsync({})

      setCourierCoords({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      })
    } catch (error) {
      console.error("Location error:", error)
    }
  }

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

  async function calculateDistances() {
    if (!courierCoords) return

    try {
      const pairs = await Promise.all(
        orders.map(async (order) => {
          try {
            const orderCoords = await geocodeAddress(order.address)

            const distanceKm = getDistanceKm(
              courierCoords.latitude,
              courierCoords.longitude,
              orderCoords.latitude,
              orderCoords.longitude
            )

            return [order.id, formatDistance(distanceKm)] as const
          } catch (error) {
            console.error("Distance calc error:", error)
            return [order.id, "—"] as const
          }
        })
      )

      setOrderDistances(Object.fromEntries(pairs))
    } catch (error) {
      console.error("Calculate distances error:", error)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    await requestLocation()
    await loadOrders(false)
  }

  async function handleTakeOrder(orderId: string) {
    try {
      setTakingOrderId(orderId)

      await assignOrder(orderId)
      await loadOrders(false)

      Alert.alert("Заказ взят")
    } catch (error: any) {
      Alert.alert("Ошибка", error?.message || "Не удалось взять заказ")
    } finally {
      setTakingOrderId(null)
    }
  }

  const sections = useMemo<OrderSection[]>(() => {
    const newOrders = orders
      .filter((o) => o.status === "new")
      .sort((a, b) => compareDistance(a.id, b.id, orderDistances))

    const myOrders = orders
      .filter((o) => o.status === "assigned" && o.courier_id === courierId)
      .sort((a, b) => compareDistance(a.id, b.id, orderDistances))

    const onTheWay = orders
      .filter((o) => o.status === "on_the_way" && o.courier_id === courierId)
      .sort((a, b) => compareDistance(a.id, b.id, orderDistances))

    const arrived = orders
      .filter((o) => o.status === "arrived" && o.courier_id === courierId)
      .sort((a, b) => compareDistance(a.id, b.id, orderDistances))

    return [
      {
        title: "Новые заказы",
        data: newOrders,
        emptyText: "Нет новых заказов"
      },
      {
        title: "Мои заказы",
        data: myOrders,
        emptyText: "Нет назначенных заказов"
      },
      {
        title: "В пути",
        data: onTheWay,
        emptyText: "Нет заказов в пути"
      },
      {
        title: "Прибыл",
        data: arrived,
        emptyText: "Нет прибывших заказов"
      }
    ]
  }, [orders, courierId, orderDistances])

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
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyText}>{section.emptyText}</Text>
            </View>
          ) : (
            <View style={styles.sectionSpacer} />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.address}>{item.address}</Text>

            <Text style={styles.info}>
              {item.package_label} • {item.total} ₽
            </Text>

            <Text style={styles.meta}>Телефон: {item.phone}</Text>

            <Text style={styles.distance}>
              Расстояние: {orderDistances[item.id] || "считаем..."}
            </Text>

            {item.status === "new" ? (
              <TouchableOpacity
                style={[
                  styles.takeButton,
                  takingOrderId === item.id && styles.buttonDisabled
                ]}
                onPress={() => handleTakeOrder(item.id)}
                disabled={takingOrderId === item.id}
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

function formatDistance(distanceKm: number) {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} м`
  }

  return `${distanceKm.toFixed(1)} км`
}

function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const toRad = (value: number) => (value * Math.PI) / 180

  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadiusKm * c
}

function parseDistanceValue(distance: string | undefined) {
  if (!distance || distance === "—" || distance === "считаем...") {
    return Number.MAX_SAFE_INTEGER
  }

  if (distance.endsWith(" м")) {
    return Number(distance.replace(" м", "")) / 1000
  }

  if (distance.endsWith(" км")) {
    return Number(distance.replace(" км", ""))
  }

  return Number.MAX_SAFE_INTEGER
}

function compareDistance(
  orderIdA: string,
  orderIdB: string,
  orderDistances: OrderDistanceMap
) {
  return (
    parseDistanceValue(orderDistances[orderIdA]) -
    parseDistanceValue(orderDistances[orderIdB])
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

  distance: {
    marginTop: 6,
    color: "#374151",
    fontWeight: "600"
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
  },

  emptyBlock: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10
  },

  emptyText: {
    color: "#6b7280"
  },

  sectionSpacer: {
    height: 6
  },

  buttonDisabled: {
    opacity: 0.6
  }
})