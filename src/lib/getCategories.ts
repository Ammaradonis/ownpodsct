import { getCollection, type CollectionEntry } from 'astro:content';

export type CategoryEntry = CollectionEntry<'categories'>;

export async function getCategories() {
  return (await getCollection('categories')).sort(
    (left, right) => left.data.sort_order - right.data.sort_order,
  );
}

export async function getCategoryBySlug(slug: string) {
  const categories = await getCategories();
  return categories.find((category) => category.data.slug === slug);
}
