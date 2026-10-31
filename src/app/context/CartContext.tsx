"use client";
import React, { createContext, useContext, useState } from "react";
import type { MenuItem } from "../data/menu";

export interface CartItem extends MenuItem {
  qty: number;
}

interface CartContextType {
  cart: CartItem[];
  addItem: (item: MenuItem) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
  tableNo: string;
  setTableNo: (t: string) => void;
  customerName: string;
  setCustomerName: (n: string) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNo, setTableNo] = useState("");
  const [customerName, setCustomerName] = useState("");

  const addItem = (item: MenuItem) =>
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) return prev.map((c) => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...item, qty: 1 }];
    });

  const removeItem = (id: string) => setCart((prev) => prev.filter((c) => c.id !== id));

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) { removeItem(id); return; }
    setCart((prev) => prev.map((c) => c.id === id ? { ...c, qty } : c));
  };

  const clearCart = () => setCart([]);

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  return (
    <CartContext.Provider value={{
      cart, addItem, removeItem, updateQty, clearCart,
      total, itemCount, tableNo, setTableNo, customerName, setCustomerName,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}
