type WorldIdentity = { id: string; title: string; url?: string; description?: string };

export const POPULAR_WORLDS = [
  {
    id: 'dd0c0246-c635-4a90-bfcc-a3d27ed7115e',
    displayTitle: 'TurboChat',
    aliases: ['turbochat'],
    url: 'https://turbo-chat-five.vercel.app/',
    label: 'CONNECTION',
    tagline: 'A universe of conversation.',
    description: 'Every great idea starts with a conversation. Step into Turbo’s corner of connection and keep the conversation moving.',
    image: '/images/cinematic-nebula.webp',
  },
  {
    id: 'fe5f7450-28d3-4134-9f9d-95fd491ddba4',
    displayTitle: 'TurboGames',
    aliases: ['turbogames'],
    url: 'https://turbogames.vercel.app/',
    label: 'PLAY',
    tagline: 'Your next escape starts here.',
    description: 'Leave the ordinary behind. A playful corner of the universe for new favorites, a little adventure, and your next great game.',
    image: '/images/space-01.webp',
  },
  {
    id: 'bb707a02-edd1-43c7-9e6e-e65e38e53af4',
    displayTitle: 'TurboStocks',
    aliases: ['turbostocks'],
    url: 'https://turbostocks.vercel.app/',
    label: 'PERSPECTIVE',
    tagline: 'A wider view of the market.',
    description: 'A different perspective on the market. Explore the world of stocks with a little curiosity and the unmistakable energy of Turbo.',
    image: '/images/space-04.webp',
  },
  {
    id: '082fc48b-9cd7-4ae9-ba7a-18bf1ec83dd7',
    displayTitle: 'Orbit Study',
    aliases: ['orbitstudy', 'studyorbit', 'turbostudy'],
    url: 'https://studyorbitv1.vercel.app/',
    label: 'DISCOVERY',
    tagline: 'Find your focus among the stars.',
    description: 'A focused space for learning, planning, and practice. Open StudyOrbit and give your next study session a place to begin.',
    image: '/images/cinematic-horizon.webp',
  },
] as const;

function normalizeTitle(title: string) { return title.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function normalizeUrl(url: string | undefined) { return url?.replace(/\/$/, ''); }

export function getWorldPresentation(project: WorldIdentity) {
  return POPULAR_WORLDS.find(world => world.id === project.id
    || world.aliases.some(alias => alias === normalizeTitle(project.title))
    || normalizeUrl(world.url) === normalizeUrl(project.url));
}
