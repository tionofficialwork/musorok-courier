import { useEffect, useState } from "react"
import { View, ActivityIndicator } from "react-native"
import { useRouter } from "expo-router"
import { getCourierId } from "../lib/storage"

export default function Index() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkCourier()
  }, [])

  async function checkCourier() {
    const courierId = await getCourierId()

    if (!courierId) {
      router.replace("/login")
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    )
  }

  return null
}