import { supabase } from "./supabase";
import { Order, OrderStatus } from "../types/order";

export async function getActiveOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, address, phone, package_id, package_label, package_price, total, payment_method, created_at"
    )
    .in("status", ["new", "assigned", "on_the_way", "arrived"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as Order[];
}

export async function getOrderById(orderId: string): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, address, phone, package_id, package_label, package_price, total, payment_method, created_at"
    )
    .eq("id", orderId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Order;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (error) {
    throw new Error(error.message);
  }
}

export function getNextStatuses(status: OrderStatus): OrderStatus[] {
  if (status === "new") return ["assigned"];
  if (status === "assigned") return ["on_the_way"];
  if (status === "on_the_way") return ["arrived"];
  if (status === "arrived") return ["done"];
  return [];
}