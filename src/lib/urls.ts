import { absoluteUrl } from './site';

export function showUrl(showSlug: string) {
  return `/shows/${showSlug}/`;
}

export function episodeUrl(showSlug: string, episodeSlug: string) {
  return `/shows/${showSlug}/${episodeSlug}/`;
}

export function showPageUrl(showSlug: string, page: number) {
  return page <= 1 ? showUrl(showSlug) : `/shows/${showSlug}/page/${page}/`;
}

export function tagUrl(tagSlug: string) {
  return `/tags/${tagSlug}/`;
}

export function feedUrl(feedSlug: string) {
  return `/feeds/${feedSlug}.xml`;
}

export function canonicalUrl(pathname: string) {
  return absoluteUrl(pathname);
}
