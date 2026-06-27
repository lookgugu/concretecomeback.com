import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

const CountryEnum = z.enum(['US', 'UK', 'CA', 'AU']);

const SurfaceEnum = z.enum(['concrete', 'wood', 'asphalt', 'hybrid', 'tiles']);

const FeatureEnum = z.enum([
  'bowl', 'pool', 'street', 'ramps', 'rails', 'stairs',
  'flatground', 'pump-track', 'banks', 'transitions',
  'mini-ramp', 'vert', 'flow-section',
]);

const DifficultyEnum = z.enum([
  'beginner-friendly', 'mixed', 'intermediate', 'advanced',
]);

const SkillLevelEnum = z.enum([
  'all-levels', 'beginner', 'intermediate', 'advanced',
]);

const ShopServiceEnum = z.enum([
  'decks', 'completes', 'trucks', 'wheels', 'bearings',
  'shoes', 'apparel', 'protective-gear', 'repairs',
  'lessons', 'adult-advice', 'board-building', 'online-only',
]);

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().max(80),
    description: z.string().min(50).max(165),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string(),
    authorAge: z.number().int().min(30).max(80).optional(),
    authorBio: z.string().max(200).optional(),
    tags: z.array(z.string()).min(1).max(8),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const parks = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/parks' }),
  schema: z.object({
    name: z.string(),
    country: CountryEnum,
    stateProvince: z.string().optional(),
    city: z.string(),
    address: z.string().optional(),
    coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
    description: z.string().min(50),
    surface: z.array(SurfaceEnum).min(1),
    features: z.array(FeatureEnum).min(1),
    difficulty: DifficultyEnum,
    adultFriendly: z.boolean(),
    hasLighting: z.boolean().optional(),
    hasParking: z.boolean().optional(),
    hasToilets: z.boolean().optional(),
    isCovered: z.boolean().optional(),
    isIndoor: z.boolean().default(false),
    openingHours: z.string().optional(),
    entryFee: z.string().optional(),
    website: z.string().url().optional(),
    googleMapsUrl: z.string().url().optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    featured: z.boolean().default(false),
    addedDate: z.coerce.date(),
    lastVerified: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const shops = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/shops' }),
  schema: z.object({
    name: z.string(),
    country: CountryEnum,
    stateProvince: z.string().optional(),
    city: z.string(),
    address: z.string().optional(),
    description: z.string().min(50),
    website: z.string().url().optional(),
    instagram: z.string().optional(),
    facebook: z.string().url().optional(),
    phone: z.string().optional(),
    servicesOffered: z.array(ShopServiceEnum).min(1),
    hasOnlineShop: z.boolean().default(false),
    adultsWelcomeNote: z.string().max(250).optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    featured: z.boolean().default(false),
    addedDate: z.coerce.date(),
    lastVerified: z.coerce.date().optional(),
  }),
});

const groups = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/groups' }),
  schema: z.object({
    name: z.string(),
    country: CountryEnum,
    stateProvince: z.string().optional(),
    city: z.string(),
    isOnline: z.boolean().default(false),
    description: z.string().min(50),
    meetFrequency: z.string().optional(),
    ageRange: z.string().optional(),
    minimumAge: z.number().int().optional(),
    skillLevel: SkillLevelEnum.default('all-levels'),
    contactEmail: z.string().email().optional(),
    website: z.string().url().optional(),
    facebook: z.string().url().optional(),
    instagram: z.string().optional(),
    discord: z.string().url().optional(),
    reddit: z.string().url().optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    featured: z.boolean().default(false),
    addedDate: z.coerce.date(),
    active: z.boolean().default(true),
  }),
});

export const collections = { blog, parks, shops, groups };
