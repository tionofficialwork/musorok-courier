import AsyncStorage from "@react-native-async-storage/async-storage"

const COURIER_ID_KEY = "courier_id"
const COURIER_NAME_KEY = "courier_name"

export async function saveCourier(id: string, name: string) {
  await AsyncStorage.setItem(COURIER_ID_KEY, id)
  await AsyncStorage.setItem(COURIER_NAME_KEY, name)
}

export async function getCourierId() {
  return AsyncStorage.getItem(COURIER_ID_KEY)
}

export async function getCourierName() {
  return AsyncStorage.getItem(COURIER_NAME_KEY)
}

export async function clearCourier() {
  await AsyncStorage.removeItem(COURIER_ID_KEY)
  await AsyncStorage.removeItem(COURIER_NAME_KEY)
}