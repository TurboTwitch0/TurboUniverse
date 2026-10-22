// Replace only the original imported placeholder; keep owner-written descriptions.
const CATALOG_DESCRIPTIONS: Record<string, string> = {
  "8f50cedc-b18f-4d7c-8b83-0e60d04ff466": "The main gateway to Turbo’s creative universe. Start with the bigger picture, then follow the ideas that catch your eye.",
  "b07fef7b-1864-4126-bbc3-f3d66a56ec3e": "A compact doorway into the Turbo universe. Open the app and take another look at what Turbo is building.",
  "6b1d8218-f3f1-44b9-b721-441e59b1b655": "Curiosity starts with a new tab. Explore Turbo’s take on a browser-inspired experience.",
  "d25931cb-2ef4-4198-9e96-168b7d45d1aa": "The video side of Turbo. Visit the TurboTwitch0 channel and follow the creator beyond the websites.",
  "69a5f5c5-f2f4-4d38-beb4-aed55af111b1": "One of the school-site projects connected through TurboHome. Explore a different corner of Turbo’s web collection.",
  "14e9512a-a8a9-4f3a-8327-95c29afec381": "Take a playful detour through the collection. This school-site project is another destination connected by TurboHome.",
  "d9dc92b1-a450-4711-8750-c3756ae20666": "A home on the web for the TurboTwitch0 identity. Explore the project behind the name.",
  "4e62f8ac-3d2b-41ad-85c5-bf2bce92d12f": "A corner of the collection for the moments that bring people together. Take a look inside TurboEvents.",
  "122cbe8f-e3f4-402e-b32b-c803dab7dd13": "Turbo’s take on a school launchpad. Open a familiar starting point reimagined with a personal touch.",
  "621bfe75-ea4d-4765-872d-3e57109b83d6": "A shared document of paths into the Turbo universe. Follow the links and choose your next destination.",
  "ce8413db-1b53-4866-877f-aa54dbaa3e82": "A different lens on the Turbo universe. Explore this visual entry point into Turbo’s web projects.",
  "f73b23d5-8771-4272-9e04-d24db566ba76": "A lighter side of the universe. Take a break and explore Turbo’s corner of internet humor.",
  "f3748132-5745-41fa-b0b6-251d3d99d3ad": "A place for code-minded curiosity. Explore UniversalCoder and the possibilities of building for the web.",
  "b913cf97-6a66-40b6-90ac-0c99188859c6": "A change of pace for curious appetites. Step into TurboFood and explore the food-themed side of the collection.",
  "ee8767f5-4172-477f-a10b-20cfa6a04507": "What deserves the top spot? Explore TurboRank, a ranking-themed experiment from the Turbo collection.",
  "20261f53-611c-464f-b4da-d2960bcb297e": "Small insights can lead to better ideas. Explore Spark, Turbo’s tips-themed corner of the universe.",
  "f670ba0a-1c96-4217-a91e-094fa8bb2aef": "A little self-expression goes a long way. Explore TurboFashion and the style-inspired side of Turbo’s projects.",
  "ca8ae525-33f7-4ed4-8835-737c1592b125": "A fresh perspective on creating. Step inside OrbitStudio and explore another of Turbo’s creative experiments.",
  "1dcb1de8-f798-457a-af8f-390f439c8885": "Every new world begins with an idea. Explore Univerdea, a space for the possibilities that come next.",
  "d350487a-b490-423f-8b2b-d988e0087c4a": "Another gateway into the collection. Visit UniversalHUB and explore Turbo’s emulator-themed project.",
  "42f2861b-f81e-4ca8-b262-021e98b71e3c": "A different route into play. Explore NexusGames, another gaming destination in the Turbo collection.",
  "3b97186d-6d83-46e4-909f-e06494fbdda2": "An app-shaped invitation to create. Explore OrbitAppStudio and Turbo’s ideas around building your own experience.",
  "f494e734-72c6-4e8b-bb06-47e7d090b669": "A world for the questions that lead somewhere new. Explore Turbo’s education-themed project and keep learning in orbit.",
  "f7db8642-ea26-40ce-a087-4fe085596f45": "A conversation can open a whole new world. Visit UniverseChat, another connection-focused stop in the collection.",
  "a6891c2e-2a3c-4e34-abf7-e17eb868530b": "Set a different tone for your visit. Explore HarminoxMusic and the music-inspired side of Turbo’s universe."
};

export function getCatalogDescription(project: { id: string; description: string }): string {
  return project.description === 'Part of the Turbo universe, shared on TurboHome.'
    ? CATALOG_DESCRIPTIONS[project.id] ?? project.description
    : project.description;
}
