import { supabase } from "./supabase"
import { Order, OrderStatus } from "../types/order"
import { getCourierId } from "./storage"

const ORDER_SELECT =
  "id, status, address, phone, package_id, package_label, package_price, total, payment_method, courier_id, created_at"

export async function getActiveOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .in("status", ["new", "assigned", "on_the_way", "arrived"])
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as Order[]
}

export async function getOrderById(orderId: string): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Order
}

export async function assignOrder(orderId: string) {
  const courierId = await getCourierId()

  if (!courierId) {
    throw new Error("Courier not logged in")
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status: "assigned",
      courier_id: courierId
    })
    .eq("id", orderId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
) {
  const { error } = await supabase
    .from("orders")
    .update({
      status
    })
    .eq("id", orderId)

  if (error) {
    throw new Error(error.message)
  }
}