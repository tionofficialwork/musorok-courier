import { supabase } from "./supabase"
import { Order, OrderStatus } from "../types/order"
import { getCourierId } from "./storage"

const ORDER_SELECT =
  "id, status, address, phone, package_id, package_label, package_price, total, payment_method, courier_id, created_at"

export async function getOrders(): Promise<Order[]> {
  const courierId = await getCourierId()

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .in("status", ["new", "assigned", "on_the_way", "arrived"])
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const orders = (data || []) as Order[]

  return orders.filter((order) => {
    if (order.status === "new") {
      return true
    }

    return order.courier_id === courierId
  })
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

  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "assigned",
      courier_id: courierId
    })
    .eq("id", orderId)
    .eq("status", "new")
    .select()

  if (error) {
    throw new Error(error.message)
  }

  if (!data || data.length === 0) {
    throw new Error("Order already taken")
  }

  return data[0] as Order
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