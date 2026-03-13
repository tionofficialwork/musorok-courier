import { getCourierId() } from "./courier";
import { supabase } from "./supabase";
import { Order, OrderStatus } from "../types/order";

const ORDER_SELECT =
  "id, status, address, phone, package_id, package_label, package_price, total, payment_method, courier_id, created_at";

export async function getActiveOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
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
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Order;
}

export async function assignOrder(orderId: string) {
  const { error } = await supabase
    .from("orders")
    .update({
      status: "assigned",
      courier_id: CURRENT_COURIER_ID,
    })
    .eq("id", orderId)
    .eq("status", "new");

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .eq("courier_id", CURRENT_COURIER_ID);

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