const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3003';
const PRODUCTS_ENDPOINT = '/api/products';

// Dog-related product data
const products = [
  {
    name: 'Premium Dog Food - Chicken & Rice',
    description: 'High-quality dog food made with real chicken as the first ingredient. Perfect for adult dogs of all breeds.',
    price: 45.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Food',
    brand: 'PawNaturals',
    tags: ['dog food', 'premium', 'chicken', 'adult dogs'],
    inventory: {
      quantity: 150,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      weight: '15 lbs',
      ingredients: 'Chicken, Brown Rice, Peas, Sweet Potatoes',
      lifestage: 'Adult'
    }
  },
  {
    name: 'Interactive Dog Puzzle Toy',
    description: 'Keep your dog mentally stimulated with this challenging puzzle toy. Hide treats inside for hours of fun!',
    price: 24.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Toys',
    brand: 'SmartPaws',
    tags: ['dog toy', 'puzzle', 'interactive', 'mental stimulation'],
    inventory: {
      quantity: 85,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      size: 'Medium',
      material: 'BPA-free plastic',
      difficulty: 'Intermediate'
    }
  },
  {
    name: 'Orthopedic Dog Bed - Large',
    description: 'Memory foam dog bed designed to support joints and provide ultimate comfort for large breeds.',
    price: 89.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Beds',
    brand: 'ComfyPaws',
    tags: ['dog bed', 'orthopedic', 'large dogs', 'memory foam'],
    inventory: {
      quantity: 45,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      dimensions: '42" x 28" x 4"',
      material: 'Memory foam with waterproof cover',
      washable: 'Yes'
    }
  },
  {
    name: 'LED Dog Collar - USB Rechargeable',
    description: 'Keep your dog visible and safe during night walks with this bright LED collar. USB rechargeable with 3 light modes.',
    price: 19.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Collars',
    brand: 'SafeGlow',
    tags: ['dog collar', 'LED', 'safety', 'rechargeable'],
    inventory: {
      quantity: 120,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      sizes: 'S, M, L, XL',
      battery: 'USB rechargeable',
      modes: 'Steady, Slow Flash, Fast Flash'
    }
  },
  {
    name: 'Dog Grooming Kit - Professional Grade',
    description: 'Complete grooming kit including clippers, scissors, brushes, and nail trimmers. Everything you need for at-home grooming.',
    price: 59.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Grooming',
    brand: 'GroomPro',
    tags: ['grooming', 'clippers', 'professional', 'kit'],
    inventory: {
      quantity: 65,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      pieces: '12',
      cordless: 'Yes',
      warranty: '2 years'
    }
  },
  {
    name: 'Puppy Training Pads - 100 Count',
    description: 'Super absorbent training pads with leak-proof backing. Perfect for house training puppies.',
    price: 29.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Training',
    brand: 'PuppyTrain',
    tags: ['training pads', 'puppy', 'house training', 'absorbent'],
    inventory: {
      quantity: 200,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      size: '22" x 22"',
      count: '100',
      absorption: '5 cups'
    }
  },
  {
    name: 'Dog Car Seat Cover - Waterproof',
    description: 'Protect your car seats from dirt, fur, and scratches. Universal fit with side flaps for full coverage.',
    price: 39.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Travel',
    brand: 'AutoPet',
    tags: ['car seat cover', 'waterproof', 'travel', 'protection'],
    inventory: {
      quantity: 75,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      material: 'Waterproof Oxford fabric',
      universal: 'Yes',
      installation: 'Quick-release clips'
    }
  },
  {
    name: 'Natural Dog Shampoo - Oatmeal & Aloe',
    description: 'Gentle, natural shampoo perfect for dogs with sensitive skin. Soothes and moisturizes while cleaning.',
    price: 14.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Grooming',
    brand: 'NaturePaws',
    tags: ['dog shampoo', 'natural', 'oatmeal', 'sensitive skin'],
    inventory: {
      quantity: 110,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      volume: '16 oz',
      ingredients: 'Oatmeal, Aloe Vera, Coconut Oil',
      pH: 'Balanced for dogs'
    }
  },
  {
    name: 'Retractable Dog Leash - 16ft',
    description: 'Heavy-duty retractable leash with ergonomic handle. One-button brake and lock system for safety.',
    price: 22.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Leashes',
    brand: 'FlexiWalk',
    tags: ['dog leash', 'retractable', 'heavy duty', '16 feet'],
    inventory: {
      quantity: 90,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      length: '16 feet',
      maxWeight: 'Up to 110 lbs',
      handle: 'Anti-slip rubber'
    }
  },
  {
    name: 'Dog Dental Chew Toys - 3 Pack',
    description: 'Durable rubber chew toys designed to clean teeth and massage gums. Helps reduce plaque and tartar.',
    price: 18.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Toys',
    brand: 'DentaPaws',
    tags: ['dental toys', 'chew toys', 'teeth cleaning', 'rubber'],
    inventory: {
      quantity: 130,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      material: 'Natural rubber',
      sizes: 'Small, Medium, Large',
      dishwasherSafe: 'Yes'
    }
  },
  {
    name: 'Dog Cooling Mat - Self-Cooling',
    description: 'Pressure-activated cooling mat that keeps dogs comfortable in hot weather. No electricity or refrigeration needed.',
    price: 34.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Beds',
    brand: 'ChillPaws',
    tags: ['cooling mat', 'summer', 'self-cooling', 'comfort'],
    inventory: {
      quantity: 60,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      size: '28" x 20"',
      cooling: 'Up to 3 hours',
      foldable: 'Yes'
    }
  },
  {
    name: 'Dog First Aid Kit',
    description: 'Comprehensive first aid kit for dogs including bandages, antiseptic wipes, thermometer, and emergency guide.',
    price: 27.99,
    category: 'Pet Supplies',
    subcategory: 'Dog Health',
    brand: 'PetMedic',
    tags: ['first aid', 'emergency', 'health', 'safety kit'],
    inventory: {
      quantity: 55,
      warehouse: 'main',
      lastRestocked: new Date().toISOString()
    },
    specifications: {
      items: '45 pieces',
      case: 'Waterproof hard case',
      guide: 'Emergency care booklet included'
    }
  }
];

// Function to generate random dog image URL
function getDogImageUrl(width = 400, height = 400) {
  return `https://placedog.net/${width}/${height}?random=${Math.random()}`;
}

// Function to create a single product
async function createProduct(productData) {
  try {
    // Add random dog image
    const product = {
      ...productData,
      images: [
        getDogImageUrl(800, 800),
        getDogImageUrl(800, 800),
        getDogImageUrl(800, 800)
      ],
      thumbnail: getDogImageUrl(400, 400)
    };

    const response = await axios.post(`${API_BASE_URL}${PRODUCTS_ENDPOINT}`, product);
    console.log(`✓ Created product: ${product.name}`);
    return response.data;
  } catch (error) {
    console.error(`✗ Failed to create product: ${productData.name}`);
    console.error(`  Error: ${error.response?.data?.error || error.message}`);
    return null;
  }
}

// Main seeding function
async function seedProducts() {
  console.log('🐕 Starting product seeding...\n');
  console.log(`API URL: ${API_BASE_URL}${PRODUCTS_ENDPOINT}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const product of products) {
    const result = await createProduct(product);
    if (result) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Seeding complete!');
  console.log(`✓ Successfully created: ${successCount} products`);
  console.log(`✗ Failed: ${failCount} products`);
}

// Run the seeding
seedProducts().catch(console.error);