import { useEffect, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking
} from "react-native"
import MapView, { Marker } from "react-native-maps"
import { useLocalSearchParams } from "expo-router"

import { getOrderById, updateOrderStatus } from "../../lib/orders"
import { geocodeAddress } from "../../lib/geocode"
import { Order } from "../../types/order"

export default function OrderScreen() {
  const { id } = useLocalSearchParams()

  const [order, setOrder] = useState<Order | null>(null)
  const [coords, setCoords] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOrder()
  }, [])

  async function loadOrder() {
    try {
      const data = await getOrderById(id as string)

      setOrder(data)

      const geo = await geocodeAddress(data.address)

      setCoords(geo)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function changeStatus(status: Order["status"]) {
    if (!order) return

    await updateOrderStatus(order.id, status)

    setOrder({
      ...order,
      status
    })
  }

  function openNavigator() {
    if (!order) return

    const encodedAddress = encodeURIComponent(order.address)

    const yandexUrl = `yandexnavi://build_route_on_map?text=${encodedAddress}`
    const fallbackUrl = `https://yandex.ru/maps/?text=${encodedAddress}`

    Linking.canOpenURL(yandexUrl).then((supported) => {
      if (supported) {
        Linking.openURL(yandexUrl)
      } else {
        Linking.openURL(fallbackUrl)
      }
    })
  }

  if (loading || !coords) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text>Заказ не найден</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Заказ</Text>

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        }}
      >
        <Marker coordinate={coords} />
      </MapView>

      <View style={styles.card}>
        <Text style={styles.label}>Адрес</Text>
        <Text style={styles.value}>{order.address}</Text>

        <Text style={styles.label}>Телефон</Text>
        <Text style={styles.value}>{order.phone}</Text>

        <Text style={styles.label}>Цена</Text>
        <Text style={styles.value}>{order.total} ₽</Text>
      </View>

      <TouchableOpacity style={styles.mapButton} onPress={openNavigator}>
        <Text style={styles.mapButtonText}>
          Открыть в Яндекс Навигаторе
        </Text>
      </TouchableOpacity>

      {order.status === "assigned" && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => changeStatus("on_the_way")}
        >
          <Text style={styles.buttonText}>Выехал</Text>
        </TouchableOpacity>
      )}

      {order.status === "on_the_way" && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => changeStatus("arrived")}
        >
          <Text style={styles.buttonText}>Прибыл</Text>
        </TouchableOpacity>
      )}

      {order.status === "arrived" && (
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => changeStatus("done")}
        >
          <Text style={styles.buttonText}>Заказ выполнен</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  title: {
    fontSize: 22,
    fontWeight: "600",
    margin: 20
  },

  map: {
    width: "100%",
    height: 250
  },

  card: {
    padding: 20
  },

  label: {
    fontSize: 12,
    color: "#888",
    marginTop: 10
  },

  value: {
    fontSize: 16,
    fontWeight: "500"
  },

  mapButton: {
    backgroundColor: "#000",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    margin: 20
  },

  mapButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },

  button: {
    backgroundColor: "#007AFF",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 12
  },

  doneButton: {
    backgroundColor: "#34C759",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 20
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  }
})