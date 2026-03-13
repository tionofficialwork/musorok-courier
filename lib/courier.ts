import { supabase } from "./supabase"

export type Courier = {
  id: string
  name: string
  phone?: string | null
  created_at?: string
}

export async function getCouriers(): Promise<Courier[]> {
  const { data, error } = await supabase
    .from("couriers")
    .select("id, name, phone, created_at")
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as Courier[]
}

export async function createCourier(name: string): Promise<Courier> {
  const cleanName = name.trim()

  if (!cleanName) {
    throw new Error("Введите имя курьера")
  }

  const { data, error } = await supabase
    .from("couriers")
    .insert({
      name: cleanName
    })
    .select("id, name, phone, created_at")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Courier
}