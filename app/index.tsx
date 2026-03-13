import { useEffect, useState } from "react"
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  StyleSheet
} from "react-native"
import { useRouter } from "expo-router"

import { getOrders } from "../lib/orders"
import { getCourierId } from "../lib/storage"
import { Order } from "../types/order"

export default function Index() {
  const router = useRouter()

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkCourier()
  }, [])

  async function checkCourier() {
    const courierId = await getCourierId()

    if (!courierId) {
      router.replace("/login")
      return
    }

    loadOrders()
  }

  async function loadOrders() {
    try {
      const data = await getOrders()
      setOrders(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  function openOrder(orderId: string) {
    router.push(`/order/${orderId}`)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Заказы</Text>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => openOrder(item.id)}
          >
            <Text style={styles.address}>{item.address}</Text>

            <Text style={styles.info}>
              {item.package_label} • {item.total} ₽
            </Text>

            <Text style={styles.status}>
              Статус: {item.status}
            </Text>
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
  }
})