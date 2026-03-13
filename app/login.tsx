import { useEffect, useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView
} from "react-native"
import { useRouter } from "expo-router"

import { createCourier, getCouriers, Courier } from "../lib/courier"
import { saveCourier } from "../lib/storage"

export default function LoginScreen() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadCouriers()
  }, [])

  async function loadCouriers() {
    try {
      setLoading(true)
      const data = await getCouriers()
      setCouriers(data)
    } catch (error) {
      console.error("Load couriers error:", error)
      Alert.alert("Ошибка", "Не удалось загрузить список курьеров")
    } finally {
      setLoading(false)
    }
  }

  async function loginAsCourier(courier: Courier) {
    try {
      setSubmitting(true)
      await saveCourier(courier.id, courier.name)
      router.replace("/")
    } catch (error) {
      console.error("Login courier error:", error)
      Alert.alert("Ошибка", "Не удалось войти")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateCourier() {
    try {
      const cleanName = name.trim()

      if (!cleanName) {
        Alert.alert("Ошибка", "Введите имя курьера")
        return
      }

      setSubmitting(true)

      const courier = await createCourier(cleanName)
      await saveCourier(courier.id, courier.name)

      setName("")
      router.replace("/")
    } catch (error: any) {
      console.error("Create courier error:", error)
      Alert.alert("Ошибка", error?.message || "Не удалось создать курьера")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Вход курьера</Text>
        <Text style={styles.subtitle}>
          Выберите существующего курьера или создайте нового
        </Text>
      </View>

      <View style={styles.createCard}>
        <Text style={styles.blockTitle}>Новый курьер</Text>

        <TextInput
          placeholder="Имя курьера"
          value={name}
          onChangeText={setName}
          style={styles.input}
          editable={!submitting}
        />

        <TouchableOpacity
          style={[styles.primaryButton, submitting && styles.buttonDisabled]}
          onPress={handleCreateCourier}
          disabled={submitting}
        >
          <Text style={styles.primaryButtonText}>
            {submitting ? "Создаём..." : "Создать и войти"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listBlock}>
        <Text style={styles.blockTitle}>Существующие курьеры</Text>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#111827" />
          </View>
        ) : (
          <FlatList
            data={couriers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  Пока нет созданных курьеров
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.courierCard,
                  submitting && styles.buttonDisabled
                ]}
                onPress={() => loginAsCourier(item)}
                disabled={submitting}
              >
                <View>
                  <Text style={styles.courierName}>{item.name}</Text>
                  <Text style={styles.courierMeta}>
                    Нажмите, чтобы войти
                  </Text>
                </View>

                <Text style={styles.courierAction}>Войти</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
    paddingTop: 20
  },

  header: {
    marginBottom: 20
  },

  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827"
  },

  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#6b7280",
    lineHeight: 22
  },

  createCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 18
  },

  blockTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12
  },

  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
    marginBottom: 12
  },

  primaryButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },

  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },

  listBlock: {
    flex: 1
  },

  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },

  listContent: {
    paddingBottom: 24
  },

  courierCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  courierName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827"
  },

  courierMeta: {
    marginTop: 4,
    fontSize: 13,
    color: "#6b7280"
  },

  courierAction: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827"
  },

  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16
  },

  emptyText: {
    color: "#6b7280",
    fontSize: 14
  },

  buttonDisabled: {
    opacity: 0.6
  }
})