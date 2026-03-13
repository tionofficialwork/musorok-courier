export type OrderStatus =
  | "new"
  | "assigned"
  | "on_the_way"
  | "arrived"
  | "done"
  | "cancelled";

export type PaymentMethod = "card" | "cash" | "sbp";

export type Order = {
  id: string;
  status: OrderStatus;
  address: string | null;
  phone: string | null;
  package_id: string | null;
  package_label: string | null;
  package_price: number | null;
  total: number | null;
  payment_method: PaymentMethod | null;
  created_at: string | null;
};