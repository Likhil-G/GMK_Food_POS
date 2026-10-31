export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  veg: boolean;
}

export const menuItems: MenuItem[] = [
  // Starters
  { id: "s1", name: "Veg spring rolls",     price: 80,  category: "Starters",       veg: true  },
  { id: "s2", name: "Chicken 65",           price: 160, category: "Starters",       veg: false },
  { id: "s3", name: "Paneer tikka",         price: 140, category: "Starters",       veg: true  },
  { id: "s4", name: "Fish fry",             price: 180, category: "Starters",       veg: false },
  { id: "s5", name: "Mushroom pepper fry",  price: 120, category: "Starters",       veg: true  },

  // Rice & Biryani
  { id: "r1", name: "Chicken biryani",      price: 200, category: "Rice & Biryani", veg: false },
  { id: "r2", name: "Mutton biryani",       price: 260, category: "Rice & Biryani", veg: false },
  { id: "r3", name: "Veg biryani",          price: 150, category: "Rice & Biryani", veg: true  },
  { id: "r4", name: "Egg fried rice",       price: 130, category: "Rice & Biryani", veg: false },
  { id: "r5", name: "Prawn biryani",        price: 300, category: "Rice & Biryani", veg: false },

  // Curries
  { id: "c1", name: "Butter chicken",       price: 220, category: "Curries",        veg: false },
  { id: "c2", name: "Paneer butter masala", price: 180, category: "Curries",        veg: true  },
  { id: "c3", name: "Dal fry",              price: 100, category: "Curries",        veg: true  },
  { id: "c4", name: "Mutton curry",         price: 280, category: "Curries",        veg: false },
  { id: "c5", name: "Prawn masala",         price: 320, category: "Curries",        veg: false },

  // Breads
  { id: "b1", name: "Tandoori roti",        price: 20,  category: "Breads",         veg: true  },
  { id: "b2", name: "Butter naan",          price: 40,  category: "Breads",         veg: true  },
  { id: "b3", name: "Garlic naan",          price: 50,  category: "Breads",         veg: true  },
  { id: "b4", name: "Parotta",              price: 25,  category: "Breads",         veg: true  },
  { id: "b5", name: "Puri (2 pcs)",         price: 30,  category: "Breads",         veg: true  },

  // Beverages
  { id: "d1", name: "Lassi",               price: 60,  category: "Beverages",      veg: true  },
  { id: "d2", name: "Mango juice",         price: 70,  category: "Beverages",      veg: true  },
  { id: "d3", name: "Masala tea",          price: 30,  category: "Beverages",      veg: true  },
  { id: "d4", name: "Cold coffee",         price: 80,  category: "Beverages",      veg: true  },
  { id: "d5", name: "Mineral water",       price: 20,  category: "Beverages",      veg: true  },

  // Desserts
  { id: "ds1", name: "Gulab jamun (2 pcs)", price: 60, category: "Desserts",       veg: true  },
  { id: "ds2", name: "Ice cream",           price: 80, category: "Desserts",       veg: true  },
  { id: "ds3", name: "Kheer",               price: 70, category: "Desserts",       veg: true  },
];

export const categories = Array.from(new Set(menuItems.map((i) => i.category)));
