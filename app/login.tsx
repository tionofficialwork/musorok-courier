import { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native"
import { useRouter } from "expo-router"
import { createCourier } from "../lib/courier"
import { saveCourier } from "../lib/storage"

export default function LoginScreen() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!name) return

    try {
      setLoading(true)

      const courier = await createCourier(name)

      await saveCourier(courier.id, courier.name)

      router.replace("/")
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Вход курьера</Text>

      <TextInput
        placeholder="Имя курьера"
        value={name}
        onChangeText={setName}
        style={styles.input}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Входим..." : "Войти"}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24
  },

  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 24
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },

  button: {
    backgroundColor: "#000",
    padding: 14,
    borderRadius: 8,
    alignItems: "center"
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  }
})