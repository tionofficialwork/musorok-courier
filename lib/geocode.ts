export async function geocodeAddress(address: string) {
  try {
    const apiKey = process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY

    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&format=json&geocode=${encodeURIComponent(
      address
    )}`

    const res = await fetch(url)
    const data = await res.json()

    const collection =
      data?.response?.GeoObjectCollection?.featureMember

    if (!collection || collection.length === 0) {
      throw new Error("Address not found")
    }

    const pos = collection[0].GeoObject.Point.pos

    const [lon, lat] = pos.split(" ").map(Number)

    return {
      latitude: lat,
      longitude: lon
    }
  } catch (error) {
    console.log("Geocode error:", error)

    return {
      latitude: 55.751244,
      longitude: 37.618423
    }
  }
}