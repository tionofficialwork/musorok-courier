import { supabase } from "./supabase"

export async function createCourier(name: string) {
  const { data, error } = await supabase
    .from("couriers")
    .insert({
      name
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}