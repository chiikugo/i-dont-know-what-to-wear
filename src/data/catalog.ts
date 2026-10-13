export type CategoryId =
  | "shirts"
  | "tshirts"
  | "sweaters"
  | "hoodies"
  | "jackets"
  | "pants"
  | "dresses"
  | "shoes";

export type Look = {
  id: string;
  title: string;
  category: CategoryId;
  vibe: string;
  image: string;
  photographer: string;
  photographerUrl: string;
  query: string;
};

export const categories: { id: CategoryId; label: string; hint: string }[] = [
  { id: "shirts", label: "Shirts", hint: "Button-ups & oxfords" },
  { id: "tshirts", label: "T-shirts", hint: "Everyday tees" },
  { id: "sweaters", label: "Sweaters", hint: "Knits & layers" },
  { id: "hoodies", label: "Hoodies", hint: "Soft & easy" },
  { id: "jackets", label: "Jackets", hint: "Outer layers" },
  { id: "pants", label: "Pants", hint: "Denim & trousers" },
  { id: "dresses", label: "Dresses", hint: "One-and-done" },
  { id: "shoes", label: "Shoes", hint: "Finish the look" },
];

const u = (id: string, params = "auto=format&fit=crop&w=900&q=80") =>
  `https://images.unsplash.com/${id}?${params}`;

export const looks: Look[] = [
  {
    id: "shirt-oxford",
    title: "Crisp white oxford",
    category: "shirts",
    vibe: "Clean / office",
    image: u("photo-1596755094514-f87e34085b2c"),
    photographer: "Toa Heftiba",
    photographerUrl: "https://unsplash.com/@heftiba",
    query: "white oxford shirt outfit",
  },
  {
    id: "shirt-linen",
    title: "Linen camp collar",
    category: "shirts",
    vibe: "Warm weather",
    image: u("photo-1603252109303-2751441dd157"),
    photographer: "Adrian Hernandez",
    photographerUrl: "https://unsplash.com/@adrianh",
    query: "linen shirt outfit men",
  },
  {
    id: "shirt-striped",
    title: "Blue stripe shirt",
    category: "shirts",
    vibe: "Smart casual",
    image: u("photo-1594938298603-c8148c4dae35"),
    photographer: "Benjamin Voros",
    photographerUrl: "https://unsplash.com/@vorosbenisop",
    query: "striped button up shirt outfit",
  },
  {
    id: "tee-white",
    title: "White crew tee",
    category: "tshirts",
    vibe: "Baseline",
    image: u("photo-1521572163474-6864f9cf17ab"),
    photographer: "Christian Bolt",
    photographerUrl: "https://unsplash.com/@christianbolt",
    query: "white t-shirt outfit",
  },
  {
    id: "tee-black",
    title: "Black fitted tee",
    category: "tshirts",
    vibe: "Night out",
    image: u("photo-1583743814966-8936f5b7be1a"),
    photographer: "Anastase Maragos",
    photographerUrl: "https://unsplash.com/@visuals",
    query: "black t-shirt outfit",
  },
  {
    id: "tee-graphic",
    title: "Oversized graphic",
    category: "tshirts",
    vibe: "Street",
    image: u("photo-1503342217505-b0a15ec3261c"),
    photographer: "Laura Chouette",
    photographerUrl: "https://unsplash.com/@laurachouette",
    query: "oversized graphic tee outfit",
  },
  {
    id: "sweater-cream",
    title: "Cream knit",
    category: "sweaters",
    vibe: "Weekend",
    image: u("photo-1434389677669-e08b4cac3105"),
    photographer: "Alora Griffiths",
    photographerUrl: "https://unsplash.com/@aloragriffiths",
    query: "cream knit sweater outfit",
  },
  {
    id: "sweater-navy",
    title: "Navy pullover",
    category: "sweaters",
    vibe: "Cool day",
    image: u("photo-1576566588028-4147f3842f27"),
    photographer: "Omid Armin",
    photographerUrl: "https://unsplash.com/@omidarmin",
    query: "navy sweater outfit",
  },
  {
    id: "sweater-cardigan",
    title: "Long cardigan",
    category: "sweaters",
    vibe: "Soft layers",
    image: u("photo-1485968579580-b6d095142e6e"),
    photographer: "Dom Hill",
    photographerUrl: "https://unsplash.com/@domhill",
    query: "cardigan sweater outfit",
  },
  {
    id: "hoodie-grey",
    title: "Heather grey hoodie",
    category: "hoodies",
    vibe: "Off duty",
    image: u("photo-1556821840-3a63f95609a7"),
    photographer: "Keagan Henman",
    photographerUrl: "https://unsplash.com/@keaganhenman",
    query: "grey hoodie outfit",
  },
  {
    id: "hoodie-black",
    title: "Black zip hoodie",
    category: "hoodies",
    vibe: "Travel",
    image: u("photo-1515886657613-9f3515b0c78f"),
    photographer: "Austin Wade",
    photographerUrl: "https://unsplash.com/@austinwade",
    query: "black hoodie streetwear",
  },
  {
    id: "jacket-leather",
    title: "Leather biker",
    category: "jackets",
    vibe: "Edge",
    image: u("photo-1551028719-00167b16eac5"),
    photographer: "Toa Heftiba",
    photographerUrl: "https://unsplash.com/@heftiba",
    query: "leather jacket outfit",
  },
  {
    id: "jacket-denim",
    title: "Classic denim",
    category: "jackets",
    vibe: "Anytime",
    image: u("photo-1544022613-e87ca75a784a"),
    photographer: "Clem Onojeghuo",
    photographerUrl: "https://unsplash.com/@clemono",
    query: "denim jacket outfit",
  },
  {
    id: "jacket-blazer",
    title: "Tailored blazer",
    category: "jackets",
    vibe: "Polished",
    image: u("photo-1591047139829-d91aecb6caea"),
    photographer: "Amanda Vick",
    photographerUrl: "https://unsplash.com/@amandavick",
    query: "blazer casual outfit",
  },
  {
    id: "pants-jeans",
    title: "Straight jeans",
    category: "pants",
    vibe: "Default",
    image: u("photo-1541099649105-f69ad21f3246"),
    photographer: "Amanda Vick",
    photographerUrl: "https://unsplash.com/@amandavick",
    query: "straight jeans outfit",
  },
  {
    id: "pants-wide",
    title: "Wide-leg trousers",
    category: "pants",
    vibe: "Editorial",
    image: u("photo-1594633312681-425c7b97ccd1"),
    photographer: "Tamara Bellis",
    photographerUrl: "https://unsplash.com/@tamarabellis",
    query: "wide leg trousers outfit",
  },
  {
    id: "pants-chinos",
    title: "Sand chinos",
    category: "pants",
    vibe: "Casual work",
    image: u("photo-1473966968600-fa801b869a1a"),
    photographer: "Omid Armin",
    photographerUrl: "https://unsplash.com/@omidarmin",
    query: "chinos outfit",
  },
  {
    id: "dress-black",
    title: "Little black dress",
    category: "dresses",
    vibe: "Evening",
    image: u("photo-1595777457583-95e059d581b8"),
    photographer: "Charles Deluvio",
    photographerUrl: "https://unsplash.com/@charlesdeluvio",
    query: "little black dress outfit",
  },
  {
    id: "dress-slip",
    title: "Satin slip",
    category: "dresses",
    vibe: "Dinner",
    image: u("photo-1566174053879-31528523f8ae"),
    photographer: "Tamara Bellis",
    photographerUrl: "https://unsplash.com/@tamarabellis",
    query: "satin slip dress outfit",
  },
  {
    id: "dress-day",
    title: "Day midi",
    category: "dresses",
    vibe: "Brunch",
    image: u("photo-1515372039744-b8f02a3ae446"),
    photographer: "Tamara Bellis",
    photographerUrl: "https://unsplash.com/@tamarabellis",
    query: "midi dress outfit",
  },
  {
    id: "shoes-sneakers",
    title: "White sneakers",
    category: "shoes",
    vibe: "Walkable",
    image: u("photo-1542291026-7eec264c27ff"),
    photographer: "Rezaul Karim",
    photographerUrl: "https://unsplash.com/@rezaulkarim",
    query: "white sneakers outfit",
  },
  {
    id: "shoes-boots",
    title: "Chelsea boots",
    category: "shoes",
    vibe: "City",
    image: u("photo-1608256246200-53e635b5b65f"),
    photographer: "mostafa mahmoudi",
    photographerUrl: "https://unsplash.com/@mostafa_mahmoudi",
    query: "chelsea boots outfit",
  },
  {
    id: "shoes-loafers",
    title: "Leather loafers",
    category: "shoes",
    vibe: "Smart",
    image: u("photo-1533867617858-e7b97e060509"),
    photographer: "Flo P",
    photographerUrl: "https://unsplash.com/@flop",
    query: "loafers outfit",
  },
];

export function sourceLinks(query: string) {
  const q = encodeURIComponent(query);
  return [
    {
      label: "Pinterest",
      href: `https://www.pinterest.com/search/pins/?q=${q}`,
    },
    {
      label: "Unsplash",
      href: `https://unsplash.com/s/photos/${q}`,
    },
    {
      label: "Google",
      href: `https://www.google.com/search?tbm=isch&q=${q}`,
    },
    {
      label: "ASOS",
      href: `https://www.asos.com/us/search/?q=${q}`,
    },
  ];
}
